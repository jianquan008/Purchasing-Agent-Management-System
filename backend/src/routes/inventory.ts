import express from 'express';
import { getDatabase, connectionPool } from '../database/init';
import { queryOptimizer } from '../database/queryOptimizer';
import { authenticateToken, AuthRequest, requireAdmin } from '../middleware/auth';
import { logOperation } from '../middleware/logger';

const router = express.Router();

// 获取库存列表 - 使用优化查询
router.get('/list', authenticateToken, logOperation('查看', '库存列表'), async (req: AuthRequest, res) => {
  try {
    const { page = 1, limit = 20, search, lowStock } = req.query;
    
    const result = await queryOptimizer.getInventoryOptimized({
      page: Number(page),
      limit: Number(limit),
      search: search as string,
      lowStockOnly: lowStock === 'true',
      stockThreshold: 10
    });
    
    res.json({
      items: result.inventory,
      total: result.total,
      page: result.page,
      limit: result.limit,
      totalPages: result.totalPages
    });
  } catch (error) {
    console.error('获取库存列表失败:', error);
    res.status(500).json({ 
      error: '获取库存列表失败',
      message: error instanceof Error ? error.message : '数据库查询错误'
    });
  }
});

// 添加库存项目 (仅管理员)
router.post('/add', authenticateToken, requireAdmin, logOperation('添加', '库存项目'), async (req: AuthRequest, res) => {
  const { item_name, current_stock, unit_price } = req.body;
  
  if (!item_name || current_stock < 0 || unit_price < 0) {
    return res.status(400).json({ error: '请提供有效的商品信息' });
  }
  
  try {
    const result = await connectionPool.run(
      'INSERT INTO inventory (item_name, current_stock, unit_price) VALUES (?, ?, ?)',
      [item_name.trim(), current_stock, unit_price]
    );
    
    res.status(201).json({ 
      message: '库存添加成功', 
      id: result.lastID 
    });
  } catch (error: any) {
    if (error.message.includes('UNIQUE constraint failed')) {
      return res.status(400).json({ error: '商品名称已存在' });
    }
    console.error('添加库存失败:', error);
    res.status(500).json({ error: '添加库存失败' });
  }
});

// 更新库存 (仅管理员)
router.put('/:id', authenticateToken, requireAdmin, logOperation('更新', '库存'), async (req: AuthRequest, res) => {
  const { id } = req.params;
  const { current_stock, unit_price } = req.body;
  
  try {
    const result = await connectionPool.run(
      'UPDATE inventory SET current_stock = ?, unit_price = ?, last_updated = CURRENT_TIMESTAMP WHERE id = ?',
      [current_stock, unit_price, id]
    );
    
    if (result.changes === 0) {
      return res.status(404).json({ error: '库存项目不存在' });
    }
    
    res.json({ message: '库存更新成功' });
  } catch (error) {
    console.error('更新库存失败:', error);
    res.status(500).json({ error: '更新库存失败' });
  }
});

// 删除库存项目 (仅管理员)
router.delete('/:id', authenticateToken, requireAdmin, logOperation('删除', '库存项目'), async (req: AuthRequest, res) => {
  const { id } = req.params;
  
  try {
    const result = await connectionPool.run('DELETE FROM inventory WHERE id = ?', [id]);
    
    if (result.changes === 0) {
      return res.status(404).json({ error: '库存项目不存在' });
    }
    
    res.json({ message: '库存删除成功' });
  } catch (error) {
    console.error('删除库存失败:', error);
    res.status(500).json({ error: '删除库存失败' });
  }
});

// 批量更新库存 (仅管理员)
router.post('/batch-update', authenticateToken, requireAdmin, logOperation('批量更新', '库存'), async (req: AuthRequest, res) => {
  const { updates } = req.body;
  
  if (!Array.isArray(updates) || updates.length === 0) {
    return res.status(400).json({ error: '请提供有效的更新数据' });
  }
  
  const db = await connectionPool.acquire();
  
  try {
    // 开始事务
    await new Promise<void>((resolve, reject) => {
      db.run('BEGIN TRANSACTION', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    
    // 批量更新
    for (const update of updates) {
      await new Promise<void>((resolve, reject) => {
        db.run(
          'UPDATE inventory SET current_stock = ?, unit_price = ?, last_updated = CURRENT_TIMESTAMP WHERE id = ?',
          [update.current_stock, update.unit_price, update.id],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });
    }
    
    // 提交事务
    await new Promise<void>((resolve, reject) => {
      db.run('COMMIT', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    
    connectionPool.release(db);
    res.json({ message: '批量更新成功' });
  } catch (error) {
    // 回滚事务
    await new Promise<void>((resolve) => {
      db.run('ROLLBACK', () => resolve());
    });
    
    connectionPool.release(db);
    console.error('批量更新失败:', error);
    res.status(500).json({ error: '批量更新失败' });
  }
});

// 获取库存统计
router.get('/stats', authenticateToken, logOperation('查看', '库存统计'), async (req: AuthRequest, res) => {
  try {
    const stats = await connectionPool.query(`
      SELECT 
        COUNT(*) as total_items,
        SUM(current_stock) as total_stock,
        SUM(current_stock * unit_price) as total_value,
        COUNT(CASE WHEN current_stock <= 10 THEN 1 END) as low_stock_items,
        COUNT(CASE WHEN current_stock = 0 THEN 1 END) as out_of_stock_items
      FROM inventory
    `);
    
    const recentUpdates = await connectionPool.query(`
      SELECT item_name, current_stock, last_updated 
      FROM inventory 
      ORDER BY last_updated DESC 
      LIMIT 5
    `);
    
    res.json({
      ...(stats[0] || {}),
      recent_updates: recentUpdates
    });
  } catch (error) {
    console.error('获取库存统计失败:', error);
    res.status(500).json({ error: '获取库存统计失败' });
  }
});

// 设置库存阈值 (仅管理员)
router.post('/set-threshold', authenticateToken, requireAdmin, logOperation('设置', '库存阈值'), (req: AuthRequest, res) => {
  const { item_id, threshold } = req.body;
  
  if (!item_id || threshold < 0) {
    return res.status(400).json({ error: '请提供有效的阈值设置' });
  }
  
  // 这里可以扩展数据库表结构来支持每个商品的自定义阈值
  // 目前使用固定阈值10，将来可以添加threshold字段到inventory表
  
  res.json({ message: '阈值设置功能将在后续版本中实现' });
});

export default router;