import sqlite3 from 'sqlite3';
import path from 'path';

interface ConnectionPoolConfig {
  maxConnections: number;
  acquireTimeout: number;
  idleTimeout: number;
}

class DatabaseConnectionPool {
  private pool: sqlite3.Database[] = [];
  private activeConnections: Set<sqlite3.Database> = new Set();
  private waitingQueue: Array<{
    resolve: (db: sqlite3.Database) => void;
    reject: (error: Error) => void;
    timestamp: number;
  }> = [];
  
  private config: ConnectionPoolConfig;
  private dbPath: string;
  private healthCheckInterval?: NodeJS.Timeout;

  constructor(dbPath: string, config: Partial<ConnectionPoolConfig> = {}) {
    this.dbPath = dbPath;
    this.config = {
      maxConnections: config.maxConnections || 10,
      acquireTimeout: config.acquireTimeout || 30000, // 30秒
      idleTimeout: config.idleTimeout || 300000, // 5分钟
    };
    
    // 启动健康检查
    this.startHealthCheck();
  }

  /**
   * 获取数据库连接
   */
  async acquire(): Promise<sqlite3.Database> {
    return new Promise((resolve, reject) => {
      // 检查是否有可用的空闲连接
      if (this.pool.length > 0) {
        const db = this.pool.pop()!;
        this.activeConnections.add(db);
        resolve(db);
        return;
      }

      // 检查是否可以创建新连接
      if (this.activeConnections.size < this.config.maxConnections) {
        try {
          const db = new sqlite3.Database(this.dbPath, (err) => {
            if (err) {
              reject(new Error(`数据库连接失败: ${err.message}`));
              return;
            }
            
            // 优化SQLite设置
            db.run('PRAGMA journal_mode = WAL');
            db.run('PRAGMA synchronous = NORMAL');
            db.run('PRAGMA cache_size = 1000');
            db.run('PRAGMA temp_store = MEMORY');
            
            this.activeConnections.add(db);
            resolve(db);
          });
        } catch (error) {
          reject(new Error(`创建数据库连接失败: ${error}`));
        }
        return;
      }

      // 连接池已满，加入等待队列
      const timeoutId = setTimeout(() => {
        const index = this.waitingQueue.findIndex(item => item.resolve === resolve);
        if (index !== -1) {
          this.waitingQueue.splice(index, 1);
          reject(new Error('获取数据库连接超时'));
        }
      }, this.config.acquireTimeout);

      this.waitingQueue.push({
        resolve: (db: sqlite3.Database) => {
          clearTimeout(timeoutId);
          resolve(db);
        },
        reject: (error: Error) => {
          clearTimeout(timeoutId);
          reject(error);
        },
        timestamp: Date.now()
      });
    });
  }

  /**
   * 释放数据库连接
   */
  release(db: sqlite3.Database): void {
    if (!this.activeConnections.has(db)) {
      console.warn('尝试释放不在活跃连接池中的数据库连接');
      return;
    }

    this.activeConnections.delete(db);

    // 检查是否有等待的请求
    if (this.waitingQueue.length > 0) {
      const waiting = this.waitingQueue.shift()!;
      this.activeConnections.add(db);
      waiting.resolve(db);
      return;
    }

    // 将连接返回到空闲池
    this.pool.push(db);
  }

  /**
   * 执行数据库查询（自动管理连接）
   */
  async query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    const db = await this.acquire();
    
    return new Promise((resolve, reject) => {
      db.all(sql, params, (err, rows) => {
        this.release(db);
        
        if (err) {
          reject(new Error(`数据库查询失败: ${err.message}`));
        } else {
          resolve(rows as T[]);
        }
      });
    });
  }

  /**
   * 执行数据库更新操作（自动管理连接）
   */
  async run(sql: string, params: any[] = []): Promise<{ lastID: number; changes: number }> {
    const db = await this.acquire();
    const self = this;
    
    return new Promise((resolve, reject) => {
      db.run(sql, params, function(err) {
        self.release(db);
        
        if (err) {
          reject(new Error(`数据库操作失败: ${err.message}`));
        } else {
          resolve({ lastID: this.lastID, changes: this.changes });
        }
      });
    });
  }

  /**
   * 获取连接池状态
   */
  getStatus() {
    return {
      activeConnections: this.activeConnections.size,
      idleConnections: this.pool.length,
      waitingRequests: this.waitingQueue.length,
      maxConnections: this.config.maxConnections,
      totalConnections: this.activeConnections.size + this.pool.length
    };
  }

  /**
   * 启动健康检查
   */
  private startHealthCheck(): void {
    this.healthCheckInterval = setInterval(() => {
      this.performHealthCheck();
    }, 60000); // 每分钟检查一次
  }

  /**
   * 执行健康检查
   */
  private async performHealthCheck(): Promise<void> {
    try {
      // 清理超时的等待请求
      const now = Date.now();
      const timeoutRequests = this.waitingQueue.filter(
        item => now - item.timestamp > this.config.acquireTimeout
      );
      
      timeoutRequests.forEach(item => {
        item.reject(new Error('连接请求超时'));
      });
      
      this.waitingQueue = this.waitingQueue.filter(
        item => now - item.timestamp <= this.config.acquireTimeout
      );

      // 测试空闲连接的健康状态
      const healthyConnections: sqlite3.Database[] = [];
      
      for (const db of this.pool) {
        try {
          await new Promise<void>((resolve, reject) => {
            db.get('SELECT 1', (err) => {
              if (err) {
                reject(err);
              } else {
                resolve();
              }
            });
          });
          healthyConnections.push(db);
        } catch (error) {
          // 关闭不健康的连接
          db.close();
        }
      }
      
      this.pool = healthyConnections;
      
    } catch (error) {
      console.error('数据库连接池健康检查失败:', error);
    }
  }

  /**
   * 关闭连接池
   */
  async close(): Promise<void> {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    // 拒绝所有等待的请求
    this.waitingQueue.forEach(item => {
      item.reject(new Error('连接池正在关闭'));
    });
    this.waitingQueue = [];

    // 关闭所有连接
    const allConnections = [...this.pool, ...this.activeConnections];
    
    await Promise.all(
      allConnections.map(db => 
        new Promise<void>((resolve) => {
          db.close((err) => {
            if (err) {
              console.error('关闭数据库连接时出错:', err);
            }
            resolve();
          });
        })
      )
    );

    this.pool = [];
    this.activeConnections.clear();
  }
}

// 单例连接池实例
const DB_PATH = process.env.DB_PATH || './database/daigou.db';
export const connectionPool = new DatabaseConnectionPool(DB_PATH, {
  maxConnections: parseInt(process.env.DB_MAX_CONNECTIONS || '10'),
  acquireTimeout: parseInt(process.env.DB_ACQUIRE_TIMEOUT || '30000'),
  idleTimeout: parseInt(process.env.DB_IDLE_TIMEOUT || '300000'),
});

export default DatabaseConnectionPool;