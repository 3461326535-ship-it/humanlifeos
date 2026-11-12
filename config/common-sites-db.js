const mysql = require('mysql2/promise');
require('dotenv').config();

// 常用网站书签专用数据库连接池（todo 数据库）
const pool = mysql.createPool({
  host: process.env.COMMON_SITES_DB_HOST || 'localhost',
  port: process.env.COMMON_SITES_DB_PORT || 3306,
  user: process.env.COMMON_SITES_DB_USER || 'todo',
  password: process.env.COMMON_SITES_DB_PASSWORD || '',
  database: process.env.COMMON_SITES_DB_NAME || 'todo',
  waitForConnections: true,
  connectionLimit: 5,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0
});

// 初始化表结构
async function initTable() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS bookmarks (
        id INT AUTO_INCREMENT PRIMARY KEY,
        client_id VARCHAR(64) NOT NULL,
        name VARCHAR(255) NOT NULL,
        url VARCHAR(1024) NOT NULL,
        sort_order INT DEFAULT 0,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uk_client_id (client_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // 迁移：为旧表添加 category 列（MySQL 5.7 不支持 ADD COLUMN IF NOT EXISTS）
    const [cols] = await pool.query(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bookmarks' AND COLUMN_NAME = 'category'`
    );
    if (!cols.length) {
      await pool.query(`ALTER TABLE bookmarks ADD COLUMN category VARCHAR(50) DEFAULT '' AFTER url`);
      console.log('✅ bookmarks 表已添加 category 列');
    }

    // 分类表（独立管理分类，支持增删改）
    await pool.query(`
      CREATE TABLE IF NOT EXISTS bookmark_categories (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(50) NOT NULL,
        sort_order INT DEFAULT 0,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uk_name (name)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    console.log('✅ 常用网站书签表已就绪');
  } catch (err) {
    console.error('❌ 常用网站书签表初始化失败:', err.message);
  }
}

initTable();

module.exports = { pool };
