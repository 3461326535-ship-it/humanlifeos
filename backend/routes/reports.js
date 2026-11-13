const express = require('express');
const router = express.Router();
const db = require('../models/db');
const { sanitizeError } = require('../../middleware/sanitizeError');
const { unionSeconds } = require('../utils/timeWindow');

function uid(req) { return req.user ? req.user.userId : null; }
function scope(userId) {
  return userId != null ? 'user_id = ?' : 'user_id IS NULL';
}
function scopeParams(userId, extra) {
  return userId != null ? [userId, ...extra] : extra;
}

function todayStr() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

// 每日战报：GET /api/reports/daily?date=YYYY-MM-DD（缺省今天，按请求时聚合）
router.get('/daily', (req, res) => {
  const userId = uid(req);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(req.query.date || '') ? req.query.date : todayStr();
  const dayPrefix = date + '%';

  // 1) 当日完成的任务（按 completed_at）
  db.all(
    `SELECT id, title, category, project_id, completed_at FROM events
     WHERE ${scope(userId)} AND completed_at LIKE ?
     ORDER BY completed_at`,
    scopeParams(userId, [dayPrefix]),
    (err, completed) => {
      if (err) return res.status(500).json({ error: sanitizeError(err) });

      // 2) 当日新建
      db.get(
        `SELECT COUNT(*) AS n FROM events
         WHERE ${scope(userId)} AND created_at LIKE ?`,
        scopeParams(userId, [dayPrefix]),
        (err2, createdRow) => {
          if (err2) return res.status(500).json({ error: sanitizeError(err2) });

          // 3) 当日计时汇总（按时间轴去重：同时开多个计时时重叠段只算一次）
          db.all(
            `SELECT started_at, ended_at FROM time_entries
             WHERE user_id ${userId != null ? '= ?' : 'IS NULL'} AND started_at LIKE ?`,
            scopeParams(userId, [dayPrefix]),
            (err3, segRows) => {
              if (err3) return res.status(500).json({ error: sanitizeError(err3) });

              // 4) 当日随手记
              db.all(
                `SELECT * FROM activities
                 WHERE ${scope(userId)} AND type = 'note' AND created_at LIKE ?
                 ORDER BY created_at DESC`,
                scopeParams(userId, [dayPrefix]),
                (err4, notes) => {
                  if (err4) return res.status(500).json({ error: sanitizeError(err4) });

                  const union = unionSeconds(segRows);
                  const minutes = Math.round(union.seconds / 60);
                  res.json({
                    date,
                    completedCount: completed.length,
                    completed,
                    createdCount: createdRow ? createdRow.n : 0,
                    time: {
                      entries: (segRows || []).length,
                      minutes,
                      hours: Math.round((minutes / 60) * 10) / 10
                    },
                    notes,
                    summary: `完成 ${completed.length} 项，新建 ${createdRow ? createdRow.n : 0} 项，计时 ${Math.round((minutes / 60) * 10) / 10} 小时，随手记 ${notes.length} 条。`
                  });
                }
              );
            }
          );
        }
      );
    }
  );
});

// ══════════════════════════════════════════════════════════════
// v0.4 战报：三类分开算，并单列「请假次数 + 原因」防止滥用
//   /daily 保持原样兼容旧前端，新 UI 走 /v04。
// ══════════════════════════════════════════════════════════════
router.get('/v04', (req, res) => {
  const R = require('../models/rrule');
  const HabitModel = require('../models/habitModel')(db);
  const RuleModel = require('../models/recurringRuleModel')(db);

  const userId = uid(req);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(req.query.date || '') ? req.query.date : todayStr();
  const dayPrefix = date + '%';

  const asPromise = (fn) => new Promise((resolve, reject) => {
    fn((err, data) => err ? reject(err) : resolve(data));
  });

  const taskQuery = (cb) => db.get(
    `SELECT COUNT(*) AS n FROM events
     WHERE ${scope(userId)} AND rule_id IS NULL AND completed_at LIKE ?`,
    scopeParams(userId, [dayPrefix]),
    (err, row) => cb(err, row ? row.n : 0)
  );

  // 请假明细：title + reason + 记录时间（用于识别事后补记）
  const excuseQuery = (cb) => db.all(
    `SELECT h.title, o.date, o.reason, o.created_at
     FROM habit_overrides o
     JOIN habits h ON h.id = o.habit_id
     WHERE h.${scope(userId)} AND o.date = ? AND o.status = 'excused'
     ORDER BY o.created_at`,
    scopeParams(userId, [date]),
    (err, rows) => cb(err, rows || [])
  );

  Promise.all([
    asPromise(taskQuery),
    asPromise(excuseQuery),
    asPromise((cb) => HabitModel.getOccurrences(userId, date, date, cb)),
    asPromise((cb) => RuleModel.getStats(userId, date, date, cb)),
  ]).then(([taskDone, excuses, occurrences, ruleStats]) => {
    const habitDone = occurrences.filter((o) => o.status === 'done').length;
    const habitSkipped = occurrences.filter((o) => o.status === 'skipped').length;
    const habitExcused = occurrences.filter((o) => o.status === 'excused').length;
    res.json({
      date,
      tasks: { completed: taskDone },
      habits: {
        due: occurrences.length,
        done: habitDone,
        skipped: habitSkipped,
        excused: habitExcused,
        effective: occurrences.length - habitExcused,
        rate: occurrences.length - habitExcused > 0
          ? Math.round((habitDone / (occurrences.length - habitExcused)) * 1000) / 1000 : 0,
        excuseDetails: excuses,   // 单列透明披露
      },
      recurring: ruleStats,
      summary: `任务完成 ${taskDone} 项；习惯打卡 ${habitDone}/${occurrences.length - habitExcused}`
        + `（断签 ${habitSkipped}，请假 ${habitExcused}）；`
        + `周期任务按时 ${ruleStats.on_time}/${ruleStats.due}。`,
    });
  }).catch((err) => res.status(500).json({ error: sanitizeError(err) }));
});

module.exports = router;
