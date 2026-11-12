const express = require('express');
const router = express.Router();
const db = require('../models/db');
const { sanitizeError } = require('../../middleware/sanitizeError');

function uid(req) { return req.user ? req.user.userId : null; }
function scope(userId) {
  return userId != null ? 'user_id = ?' : 'user_id IS NULL';
}
function scopeParams(userId, extra) {
  return userId != null ? [userId, ...extra] : extra;
}

// 概览统计：GET /api/stats/overview?range=7|30
router.get('/overview', (req, res) => {
  const userId = uid(req);
  const range = [7, 30, 90].includes(parseInt(req.query.range)) ? parseInt(req.query.range) : 7;

  // 1) 状态分布 + 总量（全部事件）
  db.all(
    `SELECT status, COUNT(*) AS n FROM events WHERE ${scope(userId)} GROUP BY status`,
    scopeParams(userId, []),
    (err, statusRows) => {
      if (err) return res.status(500).json({ error: sanitizeError(err) });

      const statusDistribution = { todo: 0, in_progress: 0, review: 0, done: 0 };
      statusRows.forEach(r => {
        statusDistribution[r.status || 'todo'] = r.n;
      });
      const total = statusRows.reduce((sum, r) => sum + r.n, 0);

      // 2) 近 N 天完成趋势（按 completed_at）
      db.all(
        `SELECT substr(completed_at, 1, 10) AS day, COUNT(*) AS n
         FROM events
         WHERE ${scope(userId)} AND completed_at IS NOT NULL
           AND completed_at >= datetime('now', '-' || ? || ' days')
         GROUP BY day ORDER BY day`,
        scopeParams(userId, [range]),
        (err2, trendRows) => {
          if (err2) return res.status(500).json({ error: sanitizeError(err2) });

          // 3) 近 N 天新建数
          db.get(
            `SELECT COUNT(*) AS n FROM events
             WHERE ${scope(userId)} AND created_at >= datetime('now', '-' || ? || ' days')`,
            scopeParams(userId, [range]),
            (err3, createdRow) => {
              if (err3) return res.status(500).json({ error: sanitizeError(err3) });

              // 4) 项目工时（time_entries 聚合，分钟）
              db.all(
                `SELECT p.id, p.name, p.color, COALESCE(SUM(t.duration_min), 0) AS minutes, COUNT(t.id) AS entries
                 FROM projects p
                 LEFT JOIN events e ON e.project_id = p.id
                 LEFT JOIN time_entries t ON t.event_id = e.id
                 WHERE p.${scope(userId)} AND p.status != 'deleted'
                 GROUP BY p.id ORDER BY minutes DESC`,
                scopeParams(userId, []),
                (err4, projectRows) => {
                  if (err4) return res.status(500).json({ error: sanitizeError(err4) });

                  res.json({
                    range,
                    totals: {
                      all: total,
                      ...statusDistribution,
                      completionRate: total > 0 ? Math.round(statusDistribution.done / total * 100) : 0,
                      createdInRange: createdRow ? createdRow.n : 0
                    },
                    trend: trendRows,
                    statusDistribution,
                    projectHours: projectRows
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
// v0.4 三套统计口径（新 UI 用）
//   /overview 保持原样以兼容旧前端；新 UI 走 /v04，三块分别算，
//   不把习惯打卡和周期交付混进「任务完成率」。
//   excused 从习惯分母扣除（effective = due - excused），
//   统计一律不加 archived_at 过滤（看长期表现，见方案 §4.6）。
// ══════════════════════════════════════════════════════════════
router.get('/v04', (req, res) => {
  const R = require('../models/rrule');
  const HabitModel = require('../models/habitModel')(db);
  const RuleModel = require('../models/recurringRuleModel')(db);

  const userId = uid(req);
  const range = [7, 30, 90].includes(parseInt(req.query.range)) ? parseInt(req.query.range) : 7;
  const to = R.todayStr();
  const from = R.addDays(to, -(range - 1));

  const asPromise = (fn) => new Promise((resolve, reject) => {
    fn((err, data) => err ? reject(err) : resolve(data));
  });

  const tasksQuery = (cb) => db.get(
    `SELECT COUNT(*) AS total,
            SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) AS done
     FROM events
     WHERE ${scope(userId)} AND rule_id IS NULL AND date BETWEEN ? AND ?`,
    scopeParams(userId, [from, to]),
    (err, row) => cb(err, row || { all: 0, done: 0 })
  );

  Promise.all([
    asPromise(tasksQuery),
    asPromise((cb) => HabitModel.getStats(userId, null, from, to, cb)),
    asPromise((cb) => RuleModel.getStats(userId, from, to, cb)),
  ]).then(([taskRow, habitStats, ruleStats]) => {
    const all = taskRow.total || 0;
    const done = taskRow.done || 0;
    res.json({
      range, from, to,
      tasks: {
        all, done,
        completionRate: all > 0 ? Math.round((done / all) * 1000) / 1000 : 0,
      },
      habits: {
        due: habitStats.due,
        done: habitStats.done,
        skipped: habitStats.skipped,
        excused: habitStats.excused,      // 战报单列，透明披露请假次数
        effective: habitStats.effective,
        rate: habitStats.rate,
        note: '聚合口径不含 streak；单习惯 streak 请查 /api/habits/stats?habit_id=',
      },
      recurring: ruleStats,
    });
  }).catch((err) => res.status(500).json({ error: sanitizeError(err) }));
});

module.exports = router;
