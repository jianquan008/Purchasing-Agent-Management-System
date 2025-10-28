import sqlite3 from 'sqlite3';
import path from 'path';
import fs from 'fs';
import { connectionPool } from './connectionPool';

const DB_PATH = process.env.DB_PATH || './database/daigou.db';

export function getDatabase(): sqlite3.Database {
  return new sqlite3.Database(DB_PATH);
}

export { connectionPool };

export async function initDatabase(): Promise<void> {
  // 确保数据库目录存在
  const dbDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  const db = getDatabase();

  return new Promise((resolve, reject) => {
    db.serialize(() => {
      // 用户表
      db.run(`
        CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          username TEXT UNIQUE NOT NULL,
          password TEXT NOT NULL,
          role TEXT NOT NULL DEFAULT 'user',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // 收据表
      db.run(`
        CREATE TABLE IF NOT EXISTS receipts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL,
          image_path TEXT,
          total_amount REAL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users (id)
        )
      `);

      // 收据项目表
      db.run(`
        CREATE TABLE IF NOT EXISTS receipt_items (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          receipt_id INTEGER NOT NULL,
          item_name TEXT NOT NULL,
          unit_price REAL NOT NULL,
          quantity INTEGER NOT NULL,
          total_price REAL NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (receipt_id) REFERENCES receipts (id) ON DELETE CASCADE
        )
      `);

      // 库存表
      db.run(`
        CREATE TABLE IF NOT EXISTS inventory (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          item_name TEXT UNIQUE NOT NULL,
          current_stock INTEGER DEFAULT 0,
          unit_price REAL,
          last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // 操作日志表
      db.run(`
        CREATE TABLE IF NOT EXISTS operation_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER,
          username TEXT,
          action TEXT NOT NULL,
          resource TEXT NOT NULL,
          details TEXT,
          ip_address TEXT,
          user_agent TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users (id)
        )
      `);

      // 添加数据库索引优化
      // 为receipts表的created_at字段添加索引以优化日期范围查询
      db.run(`CREATE INDEX IF NOT EXISTS idx_receipts_created_at ON receipts (created_at)`);
      
      // 为receipt_items表的item_name字段添加索引以优化商品搜索
      db.run(`CREATE INDEX IF NOT EXISTS idx_receipt_items_name ON receipt_items (item_name)`);
      
      // 为receipt_items表的receipt_id字段添加索引以优化关联查询
      db.run(`CREATE INDEX IF NOT EXISTS idx_receipt_items_receipt_id ON receipt_items (receipt_id)`);
      
      // 为inventory表的item_name字段添加索引以优化库存查询
      db.run(`CREATE INDEX IF NOT EXISTS idx_inventory_item_name ON inventory (item_name)`);
      
      // 为operation_logs表的created_at和username字段添加复合索引
      db.run(`CREATE INDEX IF NOT EXISTS idx_operation_logs_created_username ON operation_logs (created_at, username)`);
      
      // 为operation_logs表的user_id字段添加索引
      db.run(`CREATE INDEX IF NOT EXISTS idx_operation_logs_user_id ON operation_logs (user_id)`);

      // 创建默认管理员账户
      db.run(`
        INSERT OR IGNORE INTO users (username, password, role) 
        VALUES ('admin', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'admin')
      `, (err) => {
        if (err) {
          reject(err);
        } else {
          console.log('默认管理员账户已创建 (用户名: admin, 密码: password)');
          resolve();
        }
      });
    });

    db.close();
  });
}