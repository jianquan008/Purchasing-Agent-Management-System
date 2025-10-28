import { connectionPool } from '../src/database/connectionPool';
import { queryOptimizer } from '../src/database/queryOptimizer';
import { initDatabase } from '../src/database/init';

describe('Database Performance Optimizations', () => {
  beforeAll(async () => {
    // Initialize database with indexes
    await initDatabase();
  });

  afterAll(async () => {
    // Close connection pool
    await connectionPool.close();
  });

  describe('Connection Pool', () => {
    test('should manage connections efficiently', async () => {
      const initialStatus = connectionPool.getStatus();
      
      // Test multiple concurrent queries
      const queries = Array(5).fill(null).map(() => 
        connectionPool.query('SELECT 1 as test')
      );
      
      const results = await Promise.all(queries);
      
      expect(results).toHaveLength(5);
      results.forEach(result => {
        expect(result[0].test).toBe(1);
      });
      
      const finalStatus = connectionPool.getStatus();
      expect(finalStatus.maxConnections).toBe(10);
    });

    test('should handle connection pool status', () => {
      const status = connectionPool.getStatus();
      
      expect(status).toHaveProperty('activeConnections');
      expect(status).toHaveProperty('idleConnections');
      expect(status).toHaveProperty('waitingRequests');
      expect(status).toHaveProperty('maxConnections');
      expect(status).toHaveProperty('totalConnections');
      
      expect(status.maxConnections).toBe(10);
    });
  });

  describe('Database Indexes', () => {
    test('should have created all required indexes', async () => {
      // Check if indexes exist by querying sqlite_master
      const indexes = await connectionPool.query(`
        SELECT name, tbl_name, sql 
        FROM sqlite_master 
        WHERE type = 'index' 
        AND name LIKE 'idx_%'
        ORDER BY name
      `);
      
      const indexNames = indexes.map(idx => idx.name);
      
      // Verify all required indexes exist
      expect(indexNames).toContain('idx_receipts_created_at');
      expect(indexNames).toContain('idx_receipt_items_name');
      expect(indexNames).toContain('idx_receipt_items_receipt_id');
      expect(indexNames).toContain('idx_inventory_item_name');
      expect(indexNames).toContain('idx_operation_logs_created_username');
      expect(indexNames).toContain('idx_operation_logs_user_id');
    });
  });

  describe('Query Optimizer', () => {
    test('should optimize receipt queries', async () => {
      const startTime = Date.now();
      
      const result = await queryOptimizer.getReceiptsOptimized({
        page: 1,
        limit: 10
      });
      
      const queryTime = Date.now() - startTime;
      
      expect(result).toHaveProperty('receipts');
      expect(result).toHaveProperty('total');
      expect(result).toHaveProperty('page');
      expect(result).toHaveProperty('limit');
      expect(result).toHaveProperty('totalPages');
      
      // Query should complete quickly (under 100ms for empty database)
      expect(queryTime).toBeLessThan(100);
    });

    test('should optimize inventory queries', async () => {
      const startTime = Date.now();
      
      const result = await queryOptimizer.getInventoryOptimized({
        page: 1,
        limit: 10
      });
      
      const queryTime = Date.now() - startTime;
      
      expect(result).toHaveProperty('inventory');
      expect(result).toHaveProperty('total');
      expect(result).toHaveProperty('page');
      expect(result).toHaveProperty('limit');
      expect(result).toHaveProperty('totalPages');
      
      // Query should complete quickly
      expect(queryTime).toBeLessThan(100);
    });

    test('should provide database statistics', async () => {
      const startTime = Date.now();
      
      const stats = await queryOptimizer.getDatabaseStats();
      
      const queryTime = Date.now() - startTime;
      
      expect(stats).toHaveProperty('totalUsers');
      expect(stats).toHaveProperty('totalReceipts');
      expect(stats).toHaveProperty('totalReceiptItems');
      expect(stats).toHaveProperty('totalInventoryItems');
      expect(stats).toHaveProperty('totalOperationLogs');
      expect(stats).toHaveProperty('totalPurchaseAmount');
      expect(stats).toHaveProperty('totalInventoryValue');
      expect(stats).toHaveProperty('connectionPoolStatus');
      
      // Statistics query should complete quickly
      expect(queryTime).toBeLessThan(200);
    });
  });

  describe('Performance Benchmarks', () => {
    test('should handle multiple concurrent operations', async () => {
      const operations = [];
      
      // Create multiple concurrent database operations
      for (let i = 0; i < 10; i++) {
        operations.push(
          connectionPool.query('SELECT COUNT(*) as count FROM users'),
          connectionPool.query('SELECT COUNT(*) as count FROM receipts'),
          connectionPool.query('SELECT COUNT(*) as count FROM inventory')
        );
      }
      
      const startTime = Date.now();
      const results = await Promise.all(operations);
      const totalTime = Date.now() - startTime;
      
      expect(results).toHaveLength(30);
      
      // All operations should complete within reasonable time
      expect(totalTime).toBeLessThan(1000); // 1 second for 30 operations
    });
  });
});