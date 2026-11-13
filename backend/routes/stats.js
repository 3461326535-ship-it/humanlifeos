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

// 概览统计：GET /api/stats/overview?range=7|30|90&fromDay=&toDay=&fromTs=&toTs=
// 口径：状态分布 / 完成率 / 完成趋势 / 项目工时 一律限定在「所选周期」内，
// 且只统计任务（events 表）。习惯打卡在 habits 表、走 /api/stats/v04，不混进这里的完成率。
router.get('/overview', (req, res) => {
  const userId = uid(req);
  const range = [7, 30, 90].includes(parseInt(req.query.range)) ? parseInt(req.query.range) : 7;

  // 窗口由前端按本地时区算好传进来（服务器时区不可信）；没传就退化成本机 UTC 近 N 天
  const isDay = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
  const isTs = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(v);
  const sqlTs = (d) => d.toISOString().slice(0, 19).replace('T', ' ');
  const now = new Date();
  const fromTs = isTs(req.query.fromTs) ? req.query.fromTs : sqlTs(new Date(now.getTime() - (range - 1) * 86400000));
  const toTs = isTs(req.query.toTs) ? req.query.toTs : sqlTs(new Date(now.getTime() + 86400000));
  const fromDay = isDay(req.query.fromDay) ? req.query.fromDay : fromTs.slice(0, 10);
  const toDay = isDay(req.query.toDay) ? req.query.toDay : toTs.slice(0, 10);

  // 1) 状态分布 + 总量：本周期内的任务 = 计划日期落在窗口内 或 完成于窗口内
  //    （排除软归档的周期实例，否则 155 这种全量数字会把未来的重复实例也算进来）
  db.all(
    `SELECT status, COUNT(*) AS n FROM events
     WHERE ${scope(userId)}
       AND COALESCE(archived_at, '') = ''
       AND (
         (date >= ? AND date <= ?)
         OR (completed_at IS NOT NULL AND completed_at >= ? AND completed_at < ?)
       )
     GROUP BY status`,
    scopeParams(userId, [fromDay, toDay, fromTs, toTs]),
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
           AND completed_at >= ? AND completed_at < ?
         GROUP BY day ORDER BY day`,
        scopeParams(userId, [fromTs, toTs]),
        (err2, trendRows) => {
          if (err2) return res.status(500).json({ error: sanitizeError(err2) });

          // 3) 近 N 天新建数
          db.get(
            `SELECT COUNT(*) AS n FROM events
             WHERE ${scope(userId)} AND created_at >= ? AND created_at < ?`,
            scopeParams(userId, [fromTs, toTs]),
            (err3, createdRow) => {
              if (err3) return res.status(500).json({ error: sanitizeError(err3) });

              // 4) 项目工时：只算落在窗口内的计时段（进行中的按当前时刻算），零工时的项目不列出
              //    注意占位符顺序：SUM(...) 在 SELECT 里、先于 WHERE 的 p.user_id，故时间参数在前
              const projParams = [fromTs, toTs];
              if (userId != null) projParams.push(userId);
              db.all(
                `SELECT p.id, p.name, p.color,
                        COALESCE(SUM(
                          CASE WHEN t.started_at >= ? AND t.started_at < ? THEN
                            CASE WHEN t.ended_at IS NULL
                              THEN (strftime('%s','now') - strftime('%s', t.started_at)) / 60.0
                              ELSE (strftime('%s', t.ended_at) - strftime('%s', t.started_at)) / 60.0
                            END
                          END
                        ), 0) AS minutes,
                        COUNT(t.id) AS entries
                 FROM projects p
                 LEFT JOIN events e ON e.project_id = p.id
                 LEFT JOIN time_entries t ON t.event_id = e.id
                 WHERE p.${scope(userId)} AND p.status != 'deleted'
                 GROUP BY p.id
                 HAVING minutes > 0
                 ORDER BY minutes DESC`,
                projParams,
                (err4, projectRows) => {
                  if (err4) return res.status(500).json({ error: sanitizeError(err4) });

                  res.json({
                    range,
                    window: { fromDay, toDay, fromTs, toTs },
                    totals: {
                      all: total,
                      ...statusDistribution,
                      completionRate: total > 0 ? Math.round(statusDistribution.done / total * 100) : 0,
                      createdInRange: createdRow ? createdRow.n : 0
                    },
                    trend: trendRows,
                    statusDistribution,
                    projectHours: projectRows.map(p => ({ ...p, minutes: Math.round(p.minutes) }))
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
