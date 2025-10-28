import express from 'express';
import { getDatabase, connectionPool } from '../database/init';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { logOperation } from '../middleware/logger';

const router = express.Router();

// 获取采购趋势分析数据
router.get('/trends', authenticateToken, logOperation('查看', '采购趋势分析'), async (req: AuthRequest, res) => {
  try {
    const { period = 'month', startDate, endDate } = req.query;
    
    const db = await connectionPool.acquire();
    
    try {
      // 根据时间段获取不同的分组格式
      let dateFormat: string;
      let dateLabel: string;
      
      switch (period) {
        case 'day':
          dateFormat = '%Y-%m-%d';
          dateLabel = 'date';
          break;
        case 'week':
          dateFormat = '%Y-W%W';
          dateLabel = 'week';
          break;
        case 'month':
          dateFormat = '%Y-%m';
          dateLabel = 'month';
          break;
        case 'year':
          dateFormat = '%Y';
          dateLabel = 'year';
          break;
        default:
          dateFormat = '%Y-%m';
          dateLabel = 'month';
      }
      
      // 构建WHERE条件
      let whereClause = '1=1';
      const params: any[] = [];
      
      if (startDate) {
        whereClause += ' AND r.created_at >= ?';
        params.push(startDate);
      }
      
      if (endDate) {
        whereClause += ' AND r.created_at <= ?';
        params.push(endDate);
      }
      
      // 获取采购金额趋势
      const amountTrends = await new Promise<any[]>((resolve, reject) => {
        db.all(`
          SELECT 
            strftime('${dateFormat}', r.created_at) as period,
            COUNT(*) as receipt_count,
            SUM(r.total_amount) as total_amount,
            AVG(r.total_amount) as avg_amount,
            COUNT(DISTINCT r.user_id) as unique_users
          FROM receipts r
          WHERE ${whereClause}
          GROUP BY strftime('${dateFormat}', r.created_at)
          ORDER BY period ASC
        `, params, (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        });
      });
      
      // 获取商品数量趋势
      const quantityTrends = await new Promise<any[]>((resolve, reject) => {
        db.all(`
          SELECT 
            strftime('${dateFormat}', r.created_at) as period,
            SUM(ri.quantity) as total_quantity,
            COUNT(DISTINCT ri.item_name) as unique_items,
            AVG(ri.quantity) as avg_quantity_per_item
          FROM receipts r
          JOIN receipt_items ri ON r.id = ri.receipt_id
          WHERE ${whereClause}
          GROUP BY strftime('${dateFormat}', r.created_at)
          ORDER BY period ASC
        `, params, (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        });
      });
      
      connectionPool.release(db);
      
      res.json({
        period: period,
        dateLabel: dateLabel,
        amountTrends: amountTrends.map(row => ({
          period: row.period,
          receiptCount: row.receipt_count,
          totalAmount: parseFloat(row.total_amount || 0),
          avgAmount: parseFloat(row.avg_amount || 0),
          uniqueUsers: row.unique_users
        })),
        quantityTrends: quantityTrends.map(row => ({
          period: row.period,
          totalQuantity: row.total_quantity,
          uniqueItems: row.unique_items,
          avgQuantityPerItem: parseFloat(row.avg_quantity_per_item || 0)
        }))
      });
      
    } catch (error) {
      connectionPool.release(db);
      throw error;
    }
    
  } catch (error) {
    console.error('获取采购趋势失败:', error);
    res.status(500).json({ 
      error: '获取采购趋势失败',
      message: error instanceof Error ? error.message : '数据库查询错误'
    });
  }
});

// 获取商品采购频率分析
router.get('/item-frequency', authenticateToken, logOperation('查看', '商品采购频率'), async (req: AuthRequest, res) => {
  try {
    const { limit = 20, startDate, endDate, minFrequency = 1 } = req.query;
    
    const db = await connectionPool.acquire();
    
    try {
      let whereClause = '1=1';
      const params: any[] = [];
      
      if (startDate) {
        whereClause += ' AND r.created_at >= ?';
        params.push(startDate);
      }
      
      if (endDate) {
        whereClause += ' AND r.created_at <= ?';
        params.push(endDate);
      }
      
      const itemFrequency = await new Promise<any[]>((resolve, reject) => {
        db.all(`
          SELECT 
            ri.item_name,
            COUNT(*) as purchase_frequency,
            SUM(ri.quantity) as total_quantity,
            SUM(ri.total_price) as total_value,
            AVG(ri.unit_price) as avg_unit_price,
            MIN(ri.unit_price) as min_unit_price,
            MAX(ri.unit_price) as max_unit_price,
            COUNT(DISTINCT r.user_id) as purchased_by_users,
            MIN(r.created_at) as first_purchase,
            MAX(r.created_at) as last_purchase
          FROM receipt_items ri
          JOIN receipts r ON ri.receipt_id = r.id
          WHERE ${whereClause}
          GROUP BY ri.item_name
          HAVING COUNT(*) >= ?
          ORDER BY purchase_frequency DESC, total_value DESC
          LIMIT ?
        `, [...params, minFrequency, limit], (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        });
      });
      
      connectionPool.release(db);
      
      res.json({
        items: itemFrequency.map(row => ({
          itemName: row.item_name,
          purchaseFrequency: row.purchase_frequency,
          totalQuantity: row.total_quantity,
          totalValue: parseFloat(row.total_value || 0),
          avgUnitPrice: parseFloat(row.avg_unit_price || 0),
          minUnitPrice: parseFloat(row.min_unit_price || 0),
          maxUnitPrice: parseFloat(row.max_unit_price || 0),
          purchasedByUsers: row.purchased_by_users,
          firstPurchase: row.first_purchase,
          lastPurchase: row.last_purchase,
          priceVariation: parseFloat(row.max_unit_price || 0) - parseFloat(row.min_unit_price || 0)
        }))
      });
      
    } catch (error) {
      connectionPool.release(db);
      throw error;
    }
    
  } catch (error) {
    console.error('获取商品频率分析失败:', error);
    res.status(500).json({ 
      error: '获取商品频率分析失败',
      message: error instanceof Error ? error.message : '数据库查询错误'
    });
  }
});

// 获取季节性采购模式分析
router.get('/seasonal-patterns', authenticateToken, logOperation('查看', '季节性采购模式'), async (req: AuthRequest, res) => {
  try {
    const { year } = req.query;
    
    const db = await connectionPool.acquire();
    
    try {
      let whereClause = '1=1';
      const params: any[] = [];
      
      if (year) {
        whereClause += ' AND strftime("%Y", r.created_at) = ?';
        params.push(year);
      }
      
      // 按月份分析
      const monthlyPatterns = await new Promise<any[]>((resolve, reject) => {
        db.all(`
          SELECT 
            CAST(strftime('%m', r.created_at) AS INTEGER) as month,
            COUNT(*) as receipt_count,
            SUM(r.total_amount) as total_amount,
            AVG(r.total_amount) as avg_amount,
            SUM(ri.quantity) as total_quantity,
            COUNT(DISTINCT ri.item_name) as unique_items
          FROM receipts r
          JOIN receipt_items ri ON r.id = ri.receipt_id
          WHERE ${whereClause}
          GROUP BY strftime('%m', r.created_at)
          ORDER BY month ASC
        `, params, (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        });
      });
      
      // 按季度分析
      const quarterlyPatterns = await new Promise<any[]>((resolve, reject) => {
        db.all(`
          SELECT 
            CASE 
              WHEN CAST(strftime('%m', r.created_at) AS INTEGER) IN (1,2,3) THEN 1
              WHEN CAST(strftime('%m', r.created_at) AS INTEGER) IN (4,5,6) THEN 2
              WHEN CAST(strftime('%m', r.created_at) AS INTEGER) IN (7,8,9) THEN 3
              ELSE 4
            END as quarter,
            COUNT(*) as receipt_count,
            SUM(r.total_amount) as total_amount,
            AVG(r.total_amount) as avg_amount,
            SUM(ri.quantity) as total_quantity
          FROM receipts r
          JOIN receipt_items ri ON r.id = ri.receipt_id
          WHERE ${whereClause}
          GROUP BY quarter
          ORDER BY quarter ASC
        `, params, (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        });
      });
      
      // 按星期几分析
      const weekdayPatterns = await new Promise<any[]>((resolve, reject) => {
        db.all(`
          SELECT 
            CAST(strftime('%w', r.created_at) AS INTEGER) as weekday,
            COUNT(*) as receipt_count,
            SUM(r.total_amount) as total_amount,
            AVG(r.total_amount) as avg_amount
          FROM receipts r
          WHERE ${whereClause}
          GROUP BY strftime('%w', r.created_at)
          ORDER BY weekday ASC
        `, params, (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        });
      });
      
      connectionPool.release(db);
      
      // 转换星期几数字为中文
      const weekdayNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
      const monthNames = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];
      const quarterNames = ['第一季度', '第二季度', '第三季度', '第四季度'];
      
      res.json({
        year: year || '全部年份',
        monthly: monthlyPatterns.map(row => ({
          month: row.month,
          monthName: monthNames[row.month - 1],
          receiptCount: row.receipt_count,
          totalAmount: parseFloat(row.total_amount || 0),
          avgAmount: parseFloat(row.avg_amount || 0),
          totalQuantity: row.total_quantity,
          uniqueItems: row.unique_items
        })),
        quarterly: quarterlyPatterns.map(row => ({
          quarter: row.quarter,
          quarterName: quarterNames[row.quarter - 1],
          receiptCount: row.receipt_count,
          totalAmount: parseFloat(row.total_amount || 0),
          avgAmount: parseFloat(row.avg_amount || 0),
          totalQuantity: row.total_quantity
        })),
        weekday: weekdayPatterns.map(row => ({
          weekday: row.weekday,
          weekdayName: weekdayNames[row.weekday],
          receiptCount: row.receipt_count,
          totalAmount: parseFloat(row.total_amount || 0),
          avgAmount: parseFloat(row.avg_amount || 0)
        }))
      });
      
    } catch (error) {
      connectionPool.release(db);
      throw error;
    }
    
  } catch (error) {
    console.error('获取季节性模式分析失败:', error);
    res.status(500).json({ 
      error: '获取季节性模式分析失败',
      message: error instanceof Error ? error.message : '数据库查询错误'
    });
  }
});

// 获取用户采购行为分析
router.get('/user-behavior', authenticateToken, logOperation('查看', '用户采购行为'), async (req: AuthRequest, res) => {
  try {
    const { startDate, endDate, limit = 10 } = req.query;
    
    const db = await connectionPool.acquire();
    
    try {
      let whereClause = '1=1';
      const params: any[] = [];
      
      if (startDate) {
        whereClause += ' AND r.created_at >= ?';
        params.push(startDate);
      }
      
      if (endDate) {
        whereClause += ' AND r.created_at <= ?';
        params.push(endDate);
      }
      
      const userBehavior = await new Promise<any[]>((resolve, reject) => {
        db.all(`
          SELECT 
            u.username,
            u.role,
            COUNT(r.id) as total_receipts,
            SUM(r.total_amount) as total_spent,
            AVG(r.total_amount) as avg_per_receipt,
            MIN(r.total_amount) as min_receipt,
            MAX(r.total_amount) as max_receipt,
            SUM(ri.quantity) as total_items_purchased,
            COUNT(DISTINCT ri.item_name) as unique_items,
            MIN(r.created_at) as first_purchase,
            MAX(r.created_at) as last_purchase,
            COUNT(DISTINCT DATE(r.created_at)) as active_days
          FROM users u
          LEFT JOIN receipts r ON u.id = r.user_id
          LEFT JOIN receipt_items ri ON r.id = ri.receipt_id
          WHERE ${whereClause}
          GROUP BY u.id, u.username, u.role
          HAVING COUNT(r.id) > 0
          ORDER BY total_spent DESC
          LIMIT ?
        `, [...params, limit], (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        });
      });
      
      connectionPool.release(db);
      
      res.json({
        users: userBehavior.map(row => ({
          username: row.username,
          role: row.role,
          totalReceipts: row.total_receipts,
          totalSpent: parseFloat(row.total_spent || 0),
          avgPerReceipt: parseFloat(row.avg_per_receipt || 0),
          minReceipt: parseFloat(row.min_receipt || 0),
          maxReceipt: parseFloat(row.max_receipt || 0),
          totalItemsPurchased: row.total_items_purchased,
          uniqueItems: row.unique_items,
          firstPurchase: row.first_purchase,
          lastPurchase: row.last_purchase,
          activeDays: row.active_days,
          avgItemsPerReceipt: row.total_receipts > 0 ? (row.total_items_purchased / row.total_receipts).toFixed(2) : 0
        }))
      });
      
    } catch (error) {
      connectionPool.release(db);
      throw error;
    }
    
  } catch (error) {
    console.error('获取用户行为分析失败:', error);
    res.status(500).json({ 
      error: '获取用户行为分析失败',
      message: error instanceof Error ? error.message : '数据库查询错误'
    });
  }
});

// 获取价格趋势分析
router.get('/price-trends', authenticateToken, logOperation('查看', '价格趋势分析'), async (req: AuthRequest, res) => {
  try {
    const { itemName, period = 'month', limit = 12 } = req.query;
    
    if (!itemName) {
      return res.status(400).json({ error: '请指定商品名称' });
    }
    
    const db = await connectionPool.acquire();
    
    try {
      let dateFormat: string;
      
      switch (period) {
        case 'day':
          dateFormat = '%Y-%m-%d';
          break;
        case 'week':
          dateFormat = '%Y-W%W';
          break;
        case 'month':
          dateFormat = '%Y-%m';
          break;
        case 'year':
          dateFormat = '%Y';
          break;
        default:
          dateFormat = '%Y-%m';
      }
      
      const priceTrends = await new Promise<any[]>((resolve, reject) => {
        db.all(`
          SELECT 
            strftime('${dateFormat}', r.created_at) as period,
            AVG(ri.unit_price) as avg_price,
            MIN(ri.unit_price) as min_price,
            MAX(ri.unit_price) as max_price,
            COUNT(*) as purchase_count,
            SUM(ri.quantity) as total_quantity
          FROM receipt_items ri
          JOIN receipts r ON ri.receipt_id = r.id
          WHERE ri.item_name = ?
          GROUP BY strftime('${dateFormat}', r.created_at)
          ORDER BY period DESC
          LIMIT ?
        `, [itemName, limit], (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        });
      });
      
      connectionPool.release(db);
      
      res.json({
        itemName: itemName,
        period: period,
        trends: priceTrends.map(row => ({
          period: row.period,
          avgPrice: parseFloat(row.avg_price || 0),
          minPrice: parseFloat(row.min_price || 0),
          maxPrice: parseFloat(row.max_price || 0),
          purchaseCount: row.purchase_count,
          totalQuantity: row.total_quantity,
          priceVariation: parseFloat(row.max_price || 0) - parseFloat(row.min_price || 0)
        })).reverse() // 按时间正序排列
      });
      
    } catch (error) {
      connectionPool.release(db);
      throw error;
    }
    
  } catch (error) {
    console.error('获取价格趋势分析失败:', error);
    res.status(500).json({ 
      error: '获取价格趋势分析失败',
      message: error instanceof Error ? error.message : '数据库查询错误'
    });
  }
});

// 获取综合分析报告
router.get('/summary', authenticateToken, logOperation('查看', '综合分析报告'), async (req: AuthRequest, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    const db = await connectionPool.acquire();
    
    try {
      let whereClause = '1=1';
      const params: any[] = [];
      
      if (startDate) {
        whereClause += ' AND r.created_at >= ?';
        params.push(startDate);
      }
      
      if (endDate) {
        whereClause += ' AND r.created_at <= ?';
        params.push(endDate);
      }
      
      // 基础统计
      const basicStats = await new Promise<any>((resolve, reject) => {
        db.get(`
          SELECT 
            COUNT(DISTINCT r.id) as total_receipts,
            COUNT(DISTINCT r.user_id) as active_users,
            COUNT(DISTINCT ri.item_name) as unique_items,
            SUM(r.total_amount) as total_amount,
            AVG(r.total_amount) as avg_receipt_amount,
            SUM(ri.quantity) as total_quantity,
            AVG(ri.unit_price) as avg_unit_price
          FROM receipts r
          LEFT JOIN receipt_items ri ON r.id = ri.receipt_id
          WHERE ${whereClause}
        `, params, (err, row) => {
          if (err) reject(err);
          else resolve(row);
        });
      });
      
      // 最受欢迎的商品 (前5名)
      const topItems = await new Promise<any[]>((resolve, reject) => {
        db.all(`
          SELECT 
            ri.item_name,
            COUNT(*) as frequency,
            SUM(ri.quantity) as total_quantity,
            SUM(ri.total_price) as total_value
          FROM receipt_items ri
          JOIN receipts r ON ri.receipt_id = r.id
          WHERE ${whereClause}
          GROUP BY ri.item_name
          ORDER BY frequency DESC
          LIMIT 5
        `, params, (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        });
      });
      
      // 最活跃的用户 (前5名)
      const topUsers = await new Promise<any[]>((resolve, reject) => {
        db.all(`
          SELECT 
            u.username,
            COUNT(r.id) as receipt_count,
            SUM(r.total_amount) as total_spent
          FROM users u
          JOIN receipts r ON u.id = r.user_id
          WHERE ${whereClause}
          GROUP BY u.id, u.username
          ORDER BY receipt_count DESC
          LIMIT 5
        `, params, (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        });
      });
      
      // 最近7天的趋势
      const recentTrends = await new Promise<any[]>((resolve, reject) => {
        db.all(`
          SELECT 
            DATE(r.created_at) as date,
            COUNT(*) as receipt_count,
            SUM(r.total_amount) as daily_amount
          FROM receipts r
          WHERE r.created_at >= date('now', '-7 days')
          GROUP BY DATE(r.created_at)
          ORDER BY date ASC
        `, (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        });
      });
      
      connectionPool.release(db);
      
      res.json({
        period: {
          startDate: startDate || '全部时间',
          endDate: endDate || '至今'
        },
        basicStats: {
          totalReceipts: basicStats.total_receipts || 0,
          activeUsers: basicStats.active_users || 0,
          uniqueItems: basicStats.unique_items || 0,
          totalAmount: parseFloat(basicStats.total_amount || 0),
          avgReceiptAmount: parseFloat(basicStats.avg_receipt_amount || 0),
          totalQuantity: basicStats.total_quantity || 0,
          avgUnitPrice: parseFloat(basicStats.avg_unit_price || 0)
        },
        topItems: topItems.map(item => ({
          itemName: item.item_name,
          frequency: item.frequency,
          totalQuantity: item.total_quantity,
          totalValue: parseFloat(item.total_value || 0)
        })),
        topUsers: topUsers.map(user => ({
          username: user.username,
          receiptCount: user.receipt_count,
          totalSpent: parseFloat(user.total_spent || 0)
        })),
        recentTrends: recentTrends.map(trend => ({
          date: trend.date,
          receiptCount: trend.receipt_count,
          dailyAmount: parseFloat(trend.daily_amount || 0)
        }))
      });
      
    } catch (error) {
      connectionPool.release(db);
      throw error;
    }
    
  } catch (error) {
    console.error('获取综合分析报告失败:', error);
    res.status(500).json({ 
      error: '获取综合分析报告失败',
      message: error instanceof Error ? error.message : '数据库查询错误'
    });
  }
});

export default router;