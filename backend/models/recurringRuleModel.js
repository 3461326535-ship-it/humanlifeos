'use strict';

// ══════════════════════════════════════════════════════════════
// Recurring Task 模型：规则 + 窗口物化 events 实例
//
//  · 与旧实现的根本区别：不再一次生成 90~1095 行，只按查询窗口懒补，
//    用 UNIQUE(rule_id, occurrence_date) + INSERT OR IGNORE 防重复。
//  · 新实例刻意不写 events.recurrence：旧 catchUp 看到非空会继续写重复行；
//    迁移后的历史实例保留非空仅供双读一周，之后清理。
//  · 改期只改 date，occurrence_date 不变（实例身份不变，见方案 §4.4）。
//  · 归档 = 软标记 archived_at，绝不物理删除（工时 / subtasks 外键考虑）。
//
// 导出工厂 createRecurringRuleModel(db)：路由注入真实 db，测试可注入 stub。
// ══════════════════════════════════════════════════════════════

const R = require('./rrule');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const STATUSES = ['todo', 'in_progress', 'review', 'done'];

function createRecurringRuleModel(db) {
  function scope(userId, alias) {
    const p = alias ? alias + '.' : '';
    return userId != null ? `${p}user_id = ?` : `${p}user_id IS NULL`;
  }
  function sp(userId, extra) {
    return userId != null ? [userId, ...extra] : extra;
  }
  function bad(msg, cb) { return process.nextTick(() => cb(new Error(msg), null)); }

  function getRule(userId, id, cb) {
    db.get(`SELECT * FROM recurring_rules WHERE ${scope(userId)} AND id = ?`,
      sp(userId, [id]), (err, row) => cb(err || null, row || null));
  }

  function listRules(userId, from, to, cb) {
    db.all(
      `SELECT * FROM recurring_rules
       WHERE ${scope(userId)} AND archived_at IS NULL
         AND valid_from <= ? AND (valid_to IS NULL OR valid_to >= ?)
       ORDER BY COALESCE(NULLIF(start_time, ''), '99:99'), id`,
      sp(userId, [to, from]),
      (err, rows) => cb(err || null, rows || [])
    );
  }

  function createRule(userId, data, cb) {
    if (!data || !String(data.title || '').trim()) return bad('title 不能为空', cb);
    if (!DATE_RE.test(data.dtstart || '')) return bad('dtstart 必须是 YYYY-MM-DD', cb);
    try { R.assertAllowed(data.rrule, 'recurring_task'); }
    catch (e) { return bad(e.message, cb); }
    if (data.default_status && !STATUSES.includes(data.default_status)) {
      return bad('default_status 非法', cb);
    }

    db.run(
      `INSERT INTO recurring_rules
         (user_id, title, rrule, dtstart, until_date, start_time, end_time,
          estimate_minutes, project_id, priority, default_status, timezone,
          valid_from, valid_to, archived_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL)`,
      sp(userId, [
        String(data.title).trim(), data.rrule, data.dtstart,
        data.until_date || null, data.start_time || '', data.end_time || null,
        data.estimate_minutes || null, data.project_id || null, data.priority || null,
        data.default_status || 'todo', data.timezone || 'Asia/Shanghai',
        data.valid_from || data.dtstart,
      ]),
      function (err) {
        if (err) return cb(err, null);
        getRule(userId, this.lastID, cb);
      }
    );
  }

  // 改规则：就地更新。已有实例的 occurrence_date / date 一律不动，
  // 新窗口按新规则懒补；「改这一次 vs 改规则」由前端弹层区分。
  function updateRule(userId, id, patch, cb) {
    getRule(userId, id, (err, old) => {
      if (err) return cb(err, null);
      if (!old) return cb(null, null);
      if (patch.rrule !== undefined) {
        try { R.assertAllowed(patch.rrule, 'recurring_task'); }
        catch (e) { return bad(e.message, cb); }
      }
      const allowed = ['title', 'rrule', 'start_time', 'end_time', 'estimate_minutes',
        'project_id', 'priority', 'default_status', 'until_date', 'valid_to'];
      const sets = [];
      const vals = [];
      allowed.forEach((k) => {
        if (patch[k] !== undefined) { sets.push(`${k} = ?`); vals.push(patch[k]); }
      });
      if (!sets.length) return getRule(userId, id, cb);
      sets.push('updated_at = CURRENT_TIMESTAMP');
      db.run(`UPDATE recurring_rules SET ${sets.join(', ')} WHERE id = ?`,
        [...vals, id],
        (e) => e ? cb(e, null) : getRule(userId, id, cb));
    });
  }

  // 归档规则 = 停止生成新实例（封 valid_to），已有实例全部保留
  function archiveRule(userId, id, cb) {
    const today = R.todayStr();
    db.run(
      `UPDATE recurring_rules
       SET valid_to = ?, archived_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE ${scope(userId)} AND id = ?`,
      (userId != null ? [today, userId, id] : [today, id]),
      function (e) { cb(e || null, { success: !e, changes: this.changes }); }
    );
  }

  // ── 窗口懒补：只补 [from, to] 且规则有效期内的实例 ──
  function ensureWindow(userId, from, to, cb) {
    if (!DATE_RE.test(from || '') || !DATE_RE.test(to || '')) {
      return bad('from / to 必须是 YYYY-MM-DD', cb);
    }
    listRules(userId, from, to, (err, rules) => {
      if (err) return cb(err, null);
      const pairs = [];
      rules.forEach((rule) => {
        let dates;
        try { dates = R.occurrences(rule.rrule, rule.dtstart, from, to, rule.until_date); }
        catch (e) { return; }
        dates
          .filter((d) => d >= rule.valid_from && (!rule.valid_to || d <= rule.valid_to))
          .forEach((date) => pairs.push({ rule, date }));
      });
      if (!pairs.length) return cb(null, { checked: 0, inserted: 0 });

      let i = 0;
      let inserted = 0;
      const sql = `INSERT OR IGNORE INTO events
        (user_id, title, date, time, category, description, status,
         start_time, end_time, project_id, priority,
         rule_id, occurrence_date, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, '', ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`;
      const next = () => {
        if (i >= pairs.length) return cb(null, { checked: pairs.length, inserted });
        const { rule, date } = pairs[i++];
        db.run(sql, sp(userId, [
          rule.title, date, rule.start_time || '', rule.category || '其他',
          rule.default_status || 'todo', rule.start_time || null, rule.end_time || null,
          rule.project_id || null, rule.priority || null,
          rule.id, date,
        ]), function (e) {
          if (e) return cb(e, null);
          inserted += this.changes || 0;
          next();
        });
      };
      next();
    });
  }

  function listInstances(userId, from, to, includeArchived, cb) {
    const archiveFilter = includeArchived ? '' : ' AND archived_at IS NULL';
    db.all(
      `SELECT * FROM events
       WHERE ${scope(userId)} AND rule_id IS NOT NULL
         AND date BETWEEN ? AND ?${archiveFilter}
       ORDER BY date, time, id`,
      sp(userId, [from, to]),
      (err, rows) => cb(err || null, rows || [])
    );
  }

  // 改期：只改 date / time，occurrence_date 保持原值（实例身份不变）
  function patchInstance(userId, id, payload, cb) {
    if (payload.date !== undefined && !DATE_RE.test(payload.date)) {
      return bad('date 必须是 YYYY-MM-DD', cb);
    }
    db.get(
      `SELECT id, date, occurrence_date, rule_id FROM events
       WHERE ${scope(userId)} AND id = ? AND rule_id IS NOT NULL`,
      sp(userId, [id]),
      (err, row) => {
        if (err) return cb(err, null);
        if (!row) return cb(null, null);
        const sets = [];
        const vals = [];
        if (payload.date !== undefined) { sets.push('date = ?'); vals.push(payload.date); }
        if (payload.time !== undefined) {
          sets.push('time = ?'); vals.push(payload.time);
          sets.push('start_time = ?'); vals.push(payload.time || null);
        }
        if (!sets.length) return cb(null, row);
        sets.push('updated_at = CURRENT_TIMESTAMP');
        db.run(`UPDATE events SET ${sets.join(', ')} WHERE id = ?`,
          [...vals, id], (e) => {
            if (e) return cb(e, null);
            db.get('SELECT * FROM events WHERE id = ?', [id], (e2, full) => cb(e2 || null, full || null));
          });
      }
    );
  }

  // 软归档：只归档「已完成 + 完成时间早于 N 天」的周期实例；
  // 未完成逾期项必须留在看板上，一次性 Task 完全不动。
  function archiveOldInstances(userId, days, limit, cb) {
    const d = Number.isInteger(days) && days > 0 ? days : 90;
    const lim = Number.isInteger(limit) && limit > 0 ? limit : 500;
    db.run(
      `UPDATE events SET archived_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id IN (
         SELECT e.id FROM events e
         WHERE ${scope(userId, 'e')} AND e.rule_id IS NOT NULL
           AND e.archived_at IS NULL AND e.status = 'done'
           AND e.completed_at IS NOT NULL
           AND e.completed_at < datetime('now', ?)
         ORDER BY e.completed_at LIMIT ?
       )`,
      sp(userId, [`-${d} days`, lim]),
      function (e) { cb(e || null, { success: !e, archived: this.changes || 0 }); }
    );
  }

  function unarchive(userId, id, cb) {
    db.run(
      `UPDATE events SET archived_at = NULL, updated_at = CURRENT_TIMESTAMP
       WHERE ${scope(userId)} AND id = ? AND rule_id IS NOT NULL`,
      sp(userId, [id]),
      function (e) { cb(e || null, { success: !e, changes: this.changes || 0 }); }
    );
  }

  // 周期任务按时交付率：统计口径不加 archived 过滤（看长期表现）
  function getStats(userId, from, to, cb) {
    db.get(
      `SELECT COUNT(*) AS due,
              SUM(CASE WHEN e.status = 'done' THEN 1 ELSE 0 END) AS done,
              SUM(CASE WHEN e.status = 'done' AND e.completed_at IS NOT NULL
                        AND substr(e.completed_at, 1, 10) <= e.date THEN 1 ELSE 0 END) AS on_time,
              SUM(CASE WHEN e.archived_at IS NOT NULL THEN 1 ELSE 0 END) AS archived
       FROM events e
       WHERE ${scope(userId, 'e')} AND e.rule_id IS NOT NULL
         AND e.date BETWEEN ? AND ?`,
      sp(userId, [from, to]),
      (err, row) => {
        if (err) return cb(err, null);
        const due = row ? row.due : 0;
        const onTime = row && row.on_time ? row.on_time : 0;
        cb(null, {
          from, to, due,
          done: row && row.done ? row.done : 0,
          on_time: onTime,
          archived: row && row.archived ? row.archived : 0,
          on_time_rate: due > 0 ? Math.round((onTime / due) * 1000) / 1000 : 0,
        });
      }
    );
  }

  return {
    getRule, listRules, createRule, updateRule, archiveRule,
    ensureWindow, listInstances, patchInstance,
    archiveOldInstances, unarchive, getStats,
    STATUSES,
  };
}

module.exports = createRecurringRuleModel;
