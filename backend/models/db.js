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
  // 注意：只能 CREATE IF NOT EXISTS，切勿 DROP —— 否则每次进程重启都会清空聊天记录。
  db.serialize(() => {
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

  // ── 迁移：recurrence 和 recurrence_end_date 列（如果旧表不存在）──
  db.run(`ALTER TABLE events ADD COLUMN recurrence TEXT`, () => {});
  db.run(`ALTER TABLE events ADD COLUMN recurrence_end_date TEXT`, () => {});

  // ── 部分唯一索引：阻止同一链条同一天出现重复事件 ──
  // v0.4 修订：原空回调 () => {} 把建索引失败静默吞掉。线上真实库因此
  // 从未有这个索引，catchUpRecurringEvents 持续写入 86 组同日重复行。
  // 现在显式打日志；迁移去重完成前该失败属预期，迁移后应自动成功。
  db.run(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_events_chain_unique
    ON events(title, date, recurrence, user_id)
    WHERE recurrence IS NOT NULL AND recurrence != ''
  `, (err) => {
    if (err) {
      console.warn('[DB] idx_events_chain_unique 未建成（多为存量同日重复行所致，'
        + 'v0.4 迁移去重后会自动恢复）:', err.message);
    } else {
      console.log('[DB] idx_events_chain_unique 已就绪');
    }
  });

  // ══════════════════════════════════════════════════════════════
  // 迁移 v2（2026-11）：看板四态 / 时间区间 / 项目 / 计时 / 动态流
  // 原则：只加列不改旧列；completed 保留，由 status 单点派生（见 eventModel）
  // 幂等：ALTER 重复列报错已忽略（沿用本文件既有模式）；回填均带 WHERE IS NULL 守卫
  // ══════════════════════════════════════════════════════════════
  db.serialize(() => {
    // 新表先建（events.project_id 引用 projects）
    db.run(`CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      name TEXT NOT NULL,
      color TEXT,
      status TEXT DEFAULT 'active',
      start_date TEXT,
      end_date TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`, (err) => {
      if (err) console.error('[DB] projects 建表失败:', err.message);
      else console.log('[DB] projects 表已就绪');
    });

    db.run(`CREATE TABLE IF NOT EXISTS time_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      user_id INTEGER,
      started_at TEXT NOT NULL,
      ended_at TEXT,
      duration_min INTEGER,
      source TEXT DEFAULT 'manual',
      note TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`, (err) => {
      if (err) console.error('[DB] time_entries 建表失败:', err.message);
      else console.log('[DB] time_entries 表已就绪');
    });

    db.run(`CREATE TABLE IF NOT EXISTS activities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      event_id INTEGER,
      project_id INTEGER,
      type TEXT NOT NULL,
      content TEXT,
      meta TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`, (err) => {
      if (err) console.error('[DB] activities 建表失败:', err.message);
      else console.log('[DB] activities 表已就绪');
    });

    // 甘特关键路径用，第 4 阶段才启用（先建空表无成本）
    db.run(`CREATE TABLE IF NOT EXISTS task_dependencies (
      event_id INTEGER NOT NULL,
      depends_on INTEGER NOT NULL,
      PRIMARY KEY (event_id, depends_on)
    )`, (err) => {
      if (err) console.error('[DB] task_dependencies 建表失败:', err.message);
      else console.log('[DB] task_dependencies 表已就绪');
    });

    // events 新列（重复执行时 "duplicate column" 报错按既有模式静默忽略）
    db.run(`ALTER TABLE events ADD COLUMN status TEXT`, () => {});          // todo / in_progress / review / done
    db.run(`ALTER TABLE events ADD COLUMN start_time TEXT`, () => {});      // 'HH:MM' 计划开始（time 保留为旧端兼容字段）
    db.run(`ALTER TABLE events ADD COLUMN end_time TEXT`, () => {});        // 'HH:MM' 计划结束（时间块/甘特用）
    db.run(`ALTER TABLE events ADD COLUMN project_id INTEGER REFERENCES projects(id)`, () => {});
    db.run(`ALTER TABLE events ADD COLUMN position REAL`, () => {});        // 看板列内排序（REAL 便于取中值插入）
    db.run(`ALTER TABLE events ADD COLUMN completed_at TEXT`, () => {});    // 实际完成时间（战报/统计用）
    db.run(`ALTER TABLE events ADD COLUMN sort_date TEXT`, () => {});       // 实际层日期（双轨，第 4 阶段启用）
    db.run(`ALTER TABLE events ADD COLUMN priority TEXT`, () => {});        // low / medium / high
    db.run(`ALTER TABLE events ADD COLUMN end_date TEXT`, () => {});         // 甘特：计划结束日（NULL = 单日任务）
    db.run(`ALTER TABLE events ADD COLUMN is_milestone INTEGER DEFAULT 0`, () => {}); // 甘特：里程碑（只占一个日期点，不占工期）

    // 甘特：依赖类型（FS 完成→开始 / SS 开始→开始 / FF 完成→完成 / SF 开始→完成）+ 滞后天数
    db.run(`ALTER TABLE task_dependencies ADD COLUMN type TEXT DEFAULT 'FS'`, () => {});
    db.run(`ALTER TABLE task_dependencies ADD COLUMN lag_days INTEGER DEFAULT 0`, () => {});

    // 旧数据一次性回填（WHERE IS NULL 守卫 → 幂等）
    db.run(`UPDATE events SET status = CASE WHEN completed = 1 THEN 'done' ELSE 'todo' END WHERE status IS NULL`, (err) => {
      if (err) console.error('[DB] status 回填失败:', err.message);
      else console.log('[DB] events.status 旧数据回填完成');
    });
    db.run(`UPDATE events SET start_time = time WHERE start_time IS NULL AND time IS NOT NULL AND time != ''`, () => {});
    db.run(`UPDATE events SET position = id WHERE position IS NULL`, () => {});
    db.run(`UPDATE events SET completed_at = updated_at WHERE completed = 1 AND completed_at IS NULL`, () => {});

    // 索引
    db.run(`CREATE INDEX IF NOT EXISTS idx_events_status ON events(status)`, () => {});
    db.run(`CREATE INDEX IF NOT EXISTS idx_events_project ON events(project_id)`, () => {});
    db.run(`CREATE INDEX IF NOT EXISTS idx_time_entries_event ON time_entries(event_id)`, () => {});
    db.run(`CREATE INDEX IF NOT EXISTS idx_activities_created ON activities(created_at)`, () => {});
  });

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

  // ══════════════════════════════════════════════════════════════
  // 迁移 v0.4（2026-11）：Task / Habit / Recurring Task 三分类数据层
  //
  // 三条硬约束（见 docs/task-habit-rrule-design.md §8 / §12）：
  //  1. UNIQUE 必须在空表阶段建好，再写任何数据。绝不能重蹈
  //     idx_events_chain_unique「先写后建 + 空回调吞错」的覆辙。
  //  2. 每条 DDL 的错误都要显形；只允许忽略 ALTER 的 duplicate column。
  //  3. 不执行 PRAGMA foreign_keys = ON：deleteEventChain 仍在物理删
  //     events，启用会真的触发 CASCADE 删掉工时与子任务。清理子表由
  //     backend/migrations/migrate_v04.py 显式负责。
  //
  // 本块只建结构，不搬数据。数据迁移由 migrate_v04.py 单独执行。
  // 三表一旦存在，v04Schema.js 的闸门会让旧 recurrence 写放大立刻停写，
  // 因此「新代码启动 → 停旧写入 → 跑迁移」的顺序天然成立。
  // ══════════════════════════════════════════════════════════════
  db.serialize(() => {
    const v04Run = (label, sql) => db.run(sql, (err) => {
      if (err) console.error(`[DB][v0.4] ${label} 失败:`, err.message);
      else console.log(`[DB][v0.4] ${label} 已就绪`);
    });
    const v04AddColumn = (name, decl) => db.run(
      `ALTER TABLE events ADD COLUMN ${name} ${decl}`, (err) => {
        if (err) {
          if (/duplicate column/i.test(err.message)) return; // 幂等：列已存在
          console.error(`[DB][v0.4] events.${name} 加列失败:`, err.message);
        } else {
          console.log(`[DB][v0.4] events.${name} 已添加`);
        }
      });

    // ① 习惯规则：一条 RRULE，零物化
    v04Run('habits', `CREATE TABLE IF NOT EXISTS habits (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id      INTEGER NOT NULL,
      title        TEXT NOT NULL,
      rrule        TEXT NOT NULL,
      dtstart      TEXT NOT NULL,
      until_date   TEXT,
      start_time   TEXT, end_time TEXT,
      timezone     TEXT NOT NULL DEFAULT 'Asia/Shanghai',
      valid_from   TEXT NOT NULL, valid_to TEXT,
      category     TEXT DEFAULT '其他',
      archived_at  TEXT,
      created_at   TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at   TEXT DEFAULT CURRENT_TIMESTAMP
    )`);

    // ② 习惯按次状态：UNIQUE(habit_id, date) 同时是 UPSERT 的冲突目标
    v04Run('habit_overrides', `CREATE TABLE IF NOT EXISTS habit_overrides (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      habit_id      INTEGER NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
      date          TEXT NOT NULL,
      status        TEXT NOT NULL DEFAULT 'pending',
      reason        TEXT,
      completed_at  TEXT,
      created_at    TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at    TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (habit_id, date),
      CHECK (status IN ('pending', 'done', 'skipped', 'excused'))
    )`);

    // ③ 周期任务规则（实例仍落 events）
    v04Run('recurring_rules', `CREATE TABLE IF NOT EXISTS recurring_rules (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id           INTEGER NOT NULL,
      title             TEXT NOT NULL,
      rrule             TEXT NOT NULL,
      dtstart           TEXT NOT NULL,
      until_date        TEXT,
      start_time        TEXT, end_time TEXT,
      estimate_minutes  INTEGER,
      project_id        INTEGER,
      priority          TEXT,
      default_status    TEXT DEFAULT 'todo',
      timezone          TEXT NOT NULL DEFAULT 'Asia/Shanghai',
      valid_from        TEXT NOT NULL, valid_to TEXT,
      archived_at       TEXT,
      created_at        TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at        TEXT DEFAULT CURRENT_TIMESTAMP
    )`);

    // ④ events 加三列（顺序在索引之前）
    v04AddColumn('rule_id', 'INTEGER REFERENCES recurring_rules(id)');
    v04AddColumn('occurrence_date', 'TEXT');
    v04AddColumn('archived_at', 'TEXT');

    // ⑤ 索引：新表空、rule_id 全 NULL 时建，必然成功
    v04Run('idx_events_rule_occurrence', `CREATE UNIQUE INDEX IF NOT EXISTS
      idx_events_rule_occurrence ON events(rule_id, occurrence_date)
      WHERE rule_id IS NOT NULL`);
    v04Run('idx_events_active', `CREATE INDEX IF NOT EXISTS
      idx_events_active ON events(user_id, status, date)
      WHERE archived_at IS NULL`);
    v04Run('idx_events_rule_archived', `CREATE INDEX IF NOT EXISTS
      idx_events_rule_archived ON events(rule_id, completed_at)
      WHERE rule_id IS NOT NULL`);
    v04Run('idx_habits_user_valid', `CREATE INDEX IF NOT EXISTS
      idx_habits_user_valid ON habits(user_id, valid_from, valid_to)`);
    v04Run('idx_rrules_user_valid', `CREATE INDEX IF NOT EXISTS
      idx_rrules_user_valid ON recurring_rules(user_id, valid_from, valid_to)`);
  });
}

module.exports = db;