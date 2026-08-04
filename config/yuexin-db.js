const mysql = require('mysql2/promise');
require('dotenv').config();

// 月信专用数据库连接池
const pool = mysql.createPool({
  host: 'localhost',
  port: 3306,
  user: process.env.YUEXIN_DB_USER || 'yvexin',
  password: process.env.YUEXIN_DB_PASSWORD || '',
  database: process.env.YUEXIN_DB_NAME || 'yvexin',
  waitForConnections: true,
  connectionLimit: 5,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
  dateStrings: true
});

// 初始化表结构
async function initTable() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS yuexin_records (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        start_date DATE NOT NULL,
        end_date DATE DEFAULT NULL,
        flow TINYINT DEFAULT 0,
        symptoms JSON DEFAULT NULL,
        note TEXT DEFAULT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uk_user_start (user_id, start_date)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('✅ 月信数据库表已就绪');
  } catch (err) {
    console.error('❌ 月信数据库表初始化失败:', err.message);
  }
}

initTable();

module.exports = { pool };
