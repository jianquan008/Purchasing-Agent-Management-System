import { connectionPool } from './connectionPool';

/**
 * 数据库查询优化器
 * 提供优化的查询方法和缓存机制
 */
export class QueryOptimizer {
  private queryCache = new Map<string, { data: any; timestamp: number; ttl: number }>();
  private readonly DEFAULT_CACHE_TTL = 300000; // 5分钟

  /**
   * 执行优化的收据查询
   */
  async getReceiptsOptimized(params: {
    page?: number;
    limit?: number;
    startDate?: string;
    endDate?: string;
    userId?: number;
    itemName?: string;
  }) {
    const { page = 1, limit = 20, startDate, endDate, userId, itemName } = params;
    const offset = (page - 1) * limit;

    let whereConditions: string[] = [];
    let queryParams: any[] = [];
    let paramIndex = 1;

    // 构建WHERE条件
    if (startDate) {
      whereConditions.push(`r.created_at >= ?`);
      queryParams.push(startDate);
    }
    
    if (endDate) {
      whereConditions.push(`r.created_at <= ?`);
      queryParams.push(endDate);
    }
    
    if (userId) {
      whereConditions.push(`r.user_id = ?`);
      queryParams.push(userId);
    }
    
    if (itemName) {
      whereConditions.push(`EXISTS (
        SELECT 1 FROM receipt_items ri 
        WHERE ri.receipt_id = r.id 
        AND ri.item_name LIKE ?
      )`);
      queryParams.push(`%${itemName}%`);
    }

    const whereClause = whereConditions.length > 0 
      ? `WHERE ${whereConditions.join(' AND ')}` 
      : '';

    // 优化的主查询 - 使用索引
    const receiptsQuery = `
      SELECT 
        r.id,
        r.user_id,
        r.image_path,
        r.total_amount,
        r.created_at,
        r.updated_at,
        u.username
      FROM receipts r
      LEFT JOIN users u ON r.user_id = u.id
      ${whereClause}
      ORDER BY r.created_at DESC
      LIMIT ? OFFSET ?
    `;

    queryParams.push(limit, offset);

    // 执行查询
    const receipts = await connectionPool.query(receiptsQuery, queryParams);

    // 批量获取收据项目 - 使用IN查询优化
    if (receipts.length > 0) {
      const receiptIds = receipts.map((r: any) => r.id);
      const placeholders = receiptIds.map(() => '?').join(',');
      
      const itemsQuery = `
        SELECT 
          receipt_id,
          item_name,
          unit_price,
          quantity,
          total_price
        FROM receipt_items
        WHERE receipt_id IN (${placeholders})
        ORDER BY receipt_id, id
      `;

      const items = await connectionPool.query(itemsQuery, receiptIds);
      
      // 将项目分组到对应的收据
      const itemsMap = new Map();
      items.forEach((item: any) => {
        if (!itemsMap.has(item.receipt_id)) {
          itemsMap.set(item.receipt_id, []);
        }
        itemsMap.get(item.receipt_id).push(item);
      });

      receipts.forEach((receipt: any) => {
        receipt.items = itemsMap.get(receipt.id) || [];
      });
    }

    // 获取总数（使用相同的WHERE条件但不包含LIMIT）
    const countQuery = `
      SELECT COUNT(*) as total
      FROM receipts r
      ${whereClause}
    `;
    
    const countParams = queryParams.slice(0, -2); // 移除limit和offset参数
    const [{ total }] = await connectionPool.query(countQuery, countParams);

    return {
      receipts,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    };
  }

  /**
   * 优化的库存查询
   */
  async getInventoryOptimized(params: {
    search?: string;
    page?: number;
    limit?: number;
    lowStockOnly?: boolean;
    stockThreshold?: number;
  }) {
    const { search, page = 1, limit = 20, lowStockOnly = false, stockThreshold = 10 } = params;
    const offset = (page - 1) * limit;

    let whereConditions: string[] = [];
    let queryParams: any[] = [];

    if (search) {
      whereConditions.push(`item_name LIKE ?`);
      queryParams.push(`%${search}%`);
    }

    if (lowStockOnly) {
      whereConditions.push(`current_stock <= ?`);
      queryParams.push(stockThreshold);
    }

    const whereClause = whereConditions.length > 0 
      ? `WHERE ${whereConditions.join(' AND ')}` 
      : '';

    // 主查询
    const inventoryQuery = `
      SELECT 
        id,
        item_name,
        current_stock,
        unit_price,
        (current_stock * unit_price) as total_value,
        last_updated,
        CASE 
          WHEN current_stock <= ? THEN 1 
          ELSE 0 
        END as is_low_stock
      FROM inventory
      ${whereClause}
      ORDER BY item_name
      LIMIT ? OFFSET ?
    `;

    const allParams = [stockThreshold, ...queryParams, limit, offset];
    const inventory = await connectionPool.query(inventoryQuery, allParams);

    // 获取总数
    const countQuery = `
      SELECT COUNT(*) as total
      FROM inventory
      ${whereClause}
    `;
    
    const [{ total }] = await connectionPool.query(countQuery, queryParams);

    return {
      inventory,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    };
  }

  /**
   * 优化的操作日志查询
   */
  async getOperationLogsOptimized(params: {
    page?: number;
    limit?: number;
    startDate?: string;
    endDate?: string;
    username?: string;
    action?: string;
  }) {
    const { page = 1, limit = 50, startDate, endDate, username, action } = params;
    const offset = (page - 1) * limit;

    let whereConditions: string[] = [];
    let queryParams: any[] = [];

    if (startDate) {
      whereConditions.push(`created_at >= ?`);
      queryParams.push(startDate);
    }
    
    if (endDate) {
      whereConditions.push(`created_at <= ?`);
      queryParams.push(endDate);
    }
    
    if (username) {
      whereConditions.push(`username LIKE ?`);
      queryParams.push(`%${username}%`);
    }
    
    if (action) {
      whereConditions.push(`action = ?`);
      queryParams.push(action);
    }

    const whereClause = whereConditions.length > 0 
      ? `WHERE ${whereConditions.join(' AND ')}` 
      : '';

    // 使用复合索引的查询
    const logsQuery = `
      SELECT 
        id,
        user_id,
        username,
        action,
        resource,
        details,
        ip_address,
        created_at
      FROM operation_logs
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `;

    queryParams.push(limit, offset);
    const logs = await connectionPool.query(logsQuery, queryParams);

    // 获取总数
    const countQuery = `
      SELECT COUNT(*) as total
      FROM operation_logs
      ${whereClause}
    `;
    
    const countParams = queryParams.slice(0, -2);
    const [{ total }] = await connectionPool.query(countQuery, countParams);

    return {
      logs,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    };
  }

  /**
   * 获取数据库统计信息
   */
  async getDatabaseStats() {
    const cacheKey = 'database_stats';
    const cached = this.getFromCache(cacheKey);
    
    if (cached) {
      return cached;
    }

    const queries = [
      'SELECT COUNT(*) as total_users FROM users',
      'SELECT COUNT(*) as total_receipts FROM receipts',
      'SELECT COUNT(*) as total_receipt_items FROM receipt_items',
      'SELECT COUNT(*) as total_inventory_items FROM inventory',
      'SELECT COUNT(*) as total_operation_logs FROM operation_logs',
      'SELECT SUM(total_amount) as total_purchase_amount FROM receipts',
      'SELECT SUM(current_stock * unit_price) as total_inventory_value FROM inventory'
    ];

    const results = await Promise.all(
      queries.map(query => connectionPool.query(query))
    );

    const stats = {
      totalUsers: results[0][0].total_users,
      totalReceipts: results[1][0].total_receipts,
      totalReceiptItems: results[2][0].total_receipt_items,
      totalInventoryItems: results[3][0].total_inventory_items,
      totalOperationLogs: results[4][0].total_operation_logs,
      totalPurchaseAmount: results[5][0].total_purchase_amount || 0,
      totalInventoryValue: results[6][0].total_inventory_value || 0,
      connectionPoolStatus: connectionPool.getStatus()
    };

    this.setCache(cacheKey, stats, this.DEFAULT_CACHE_TTL);
    return stats;
  }

  /**
   * 缓存管理
   */
  private getFromCache(key: string) {
    const cached = this.queryCache.get(key);
    if (cached && Date.now() - cached.timestamp < cached.ttl) {
      return cached.data;
    }
    this.queryCache.delete(key);
    return null;
  }

  private setCache(key: string, data: any, ttl: number = this.DEFAULT_CACHE_TTL) {
    this.queryCache.set(key, {
      data,
      timestamp: Date.now(),
      ttl
    });
  }

  /**
   * 清理过期缓存
   */
  clearExpiredCache() {
    const now = Date.now();
    for (const [key, value] of this.queryCache.entries()) {
      if (now - value.timestamp >= value.ttl) {
        this.queryCache.delete(key);
      }
    }
  }

  /**
   * 清理所有缓存
   */
  clearAllCache() {
    this.queryCache.clear();
  }
}

// 单例实例
export const queryOptimizer = new QueryOptimizer();

// 定期清理过期缓存
setInterval(() => {
  queryOptimizer.clearExpiredCache();
}, 60000); // 每分钟清理一次