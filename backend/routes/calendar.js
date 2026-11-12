'use strict';

// /api/calendar —— 三分类统一投影
// Task / Habit / Recurring Task 在同一个日历窗口里合并返回，
// 前端按 kind 分轨渲染（Habit 只进日历时间轴，不进看板 / 甘特）。

const express = require('express');
const router = express.Router();
const db = require('../models/db');
const HabitModel = require('../models/habitModel')(db);
const RuleModel = require('../models/recurringRuleModel')(db);
const { sanitizeError } = require('../../middleware/sanitizeError');
const R = require('../models/rrule');

function uid(req) { return req.user ? req.user.userId : null; }
function fail(res, err) { return res.status(500).json({ error: sanitizeError(err) }); }

router.get('/', (req, res) => {
  const userId = uid(req);
  const today = R.todayStr();
  const from = /^\d{4}-\d{2}-\d{2}$/.test(req.query.from || '') ? req.query.from : R.addDays(today, -30);
  const to = /^\d{4}-\d{2}-\d{2}$/.test(req.query.to || '') ? req.query.to : R.addDays(today, 30);
  const scope = userId != null ? 'user_id = ?' : 'user_id IS NULL';
  const params = userId != null ? [userId, from, to] : [from, to];

  // ① 一次性 Task（不含周期实例、不含已归档）
  db.all(
    `SELECT * FROM events
     WHERE ${scope} AND rule_id IS NULL AND archived_at IS NULL
       AND date BETWEEN ? AND ?
     ORDER BY date, time, id`,
    params,
    (err, taskRows) => {
      if (err) return fail(res, err);
      const tasks = (taskRows || []).map((e) => ({ ...e, kind: 'task' }));

      // ② Habit 四态投影（零物化）
      HabitModel.getOccurrences(userId, from, to, (e2, habitRows) => {
        if (e2) return fail(res, e2);
        const habits = (habitRows || []).map((o) => ({
          ...o,
          kind: 'habit',
          id: `habit:${o.habit_id}:${o.date}`, // 虚拟 id，不与 events.id 冲突
        }));

        // ③ Recurring Task：先懒补窗口，再取实例
        RuleModel.ensureWindow(userId, from, to, (e3) => {
          if (e3) return fail(res, e3);
          RuleModel.listInstances(userId, from, to, false, (e4, ruleRows) => {
            if (e4) return fail(res, e4);
            const recurring = (ruleRows || []).map((e) => ({ ...e, kind: 'recurring' }));

            const items = [...tasks, ...habits, ...recurring].sort((a, b) =>
              (a.date || '').localeCompare(b.date || '')
              || (a.time || '').localeCompare(b.time || '')
            );
            res.json({
              from, to,
              counts: { tasks: tasks.length, habits: habits.length, recurring: recurring.length },
              items,
            });
          });
        });
      });
    }
  );
});

module.exports = router;
