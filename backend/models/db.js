const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcryptjs');

const dbPath = path.join(__dirname, '../../data/database.sqlite');

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('数据库连接失败:', err.message);
  } else {
    console.log('已连接到SQLite数据库');
    initDatabase();
  }
});

function initDatabase() {
  db.run(`CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    date TEXT NOT NULL,
    time TEXT NOT NULL,
    category TEXT DEFAULT '其他',
    description TEXT,
    completed INTEGER DEFAULT 0,
    reminder INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS subtasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    completed INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
  )`, (err) => {
    if (err) {
      console.error('创建表失败:', err.message);
    }
  });

  // AI 聊天记录表（PC/移动端自动同步，保留7天，单用户全局共享）
  db.serialize(() => {
    db.run(`DROP TABLE IF EXISTS chat_history`);
    db.run(`CREATE TABLE IF NOT EXISTS chat_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
      message TEXT NOT NULL,
      user_id INTEGER REFERENCES users(id),
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`, (err) => {
      if (err) console.error('[DB] chat_history 建表失败:', err.message);
      else console.log('[DB] chat_history 表已就绪（全局同步）');
    });
  });

  // 清理超过7天的记录
  const cleanHistory = () => {
    db.run(`DELETE FROM chat_history WHERE created_at < datetime('now', '-7 days')`, (err) => {
      if (!err) console.log('[DB] 历史清理完成');
    });
  };
  cleanHistory();
  setInterval(cleanHistory, 3600000); // 每小时

  // ── AI 待确认操作表（持久化 confirmId，防止内存丢失/PM2 重启导致"操作已过期"）──
  db.run(`CREATE TABLE IF NOT EXISTS pending_actions (
    confirm_id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    data_json TEXT NOT NULL,
    user_id INTEGER,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`, (err) => {
    if (err) console.error('[DB] pending_actions 建表失败:', err.message);
    else console.log('[DB] pending_actions 表已就绪');
  });

  // 清理超过 30 分钟的待确认操作
  const cleanPending = () => {
    db.run(`DELETE FROM pending_actions WHERE created_at < datetime('now', '-30 minutes')`, (err) => {
      if (!err) console.log('[DB] 过期 pending_actions 已清理');
    });
  };
  cleanPending();
  setInterval(cleanPending, 300000); // 每5分钟清理一次

  // ── 迁移：给旧表加 user_id 列（如果不存在）──
  db.run(`ALTER TABLE events ADD COLUMN user_id INTEGER REFERENCES users(id)`, () => {});

  // ── 用户表（登录鉴权）──
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    is_default_password INTEGER DEFAULT 1,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`, (err) => {
    if (err) {
      console.error('[DB] users 建表失败:', err.message);
      return;
    }
    // 种子默认管理员
    const defaultPassword = process.env.ADMIN_PASSWORD || 'admin123';
    db.get('SELECT id FROM users WHERE username = ?', ['admin'], (err2, row) => {
      if (err2) return;
      if (!row) {
        const hash = bcrypt.hashSync(defaultPassword, 10);
        db.run('INSERT INTO users (username, password_hash, is_default_password) VALUES (?, ?, 1)',
          ['admin', hash], (insertErr) => {
            if (insertErr) console.error('[DB] 创建默认用户失败:', insertErr.message);
            else console.log('[DB] 默认管理员已创建 (admin)');
          });
      }
    });
  });
}

module.exports = db;