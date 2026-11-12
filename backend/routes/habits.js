'use strict';

// /api/habits —— Habit（习惯打卡）规则与按日状态
// 零物化：这里任何接口都不会往 events 写行。

const express = require('express');
const router = express.Router();
const db = require('../models/db');
const HabitModel = require('../models/habitModel')(db);
const { sanitizeError } = require('../../middleware/sanitizeError');
const R = require('../models/rrule');

function uid(req) { return req.user ? req.user.userId : null; }
function fail(res, err) { return res.status(500).json({ error: sanitizeError(err) }); }
function windowOf(req) {
  const today = R.todayStr();
  const from = /^\d{4}-\d{2}-\d{2}$/.test(req.query.from || '') ? req.query.from : R.addDays(today, -30);
  const to = /^\d{4}-\d{2}-\d{2}$/.test(req.query.to || '') ? req.query.to : R.addDays(today, 30);
  return { from, to };
}

// 日历投影：窗口内 habit × override 合并后的四态 occurrence
router.get('/occurrences', (req, res) => {
  const { from, to } = windowOf(req);
  HabitModel.getOccurrences(uid(req), from, to, (err, list) => {
    if (err) return fail(res, err);
    res.json({ from, to, items: list });
  });
});

// 统计：effective = due - excused；rate = done / effective；streak 遇 excused 暂停
router.get('/stats', (req, res) => {
  const { from, to } = windowOf(req);
  const habitId = req.query.habit_id ? Number(req.query.habit_id) : null;
  HabitModel.getStats(uid(req), habitId, from, to, (err, stats) => {
    if (err) return fail(res, err);
    res.json(stats);
  });
});

router.get('/', (req, res) => {
  const { from, to } = windowOf(req);
  HabitModel.listHabits(uid(req), from, to, (err, list) => {
    if (err) return fail(res, err);
    res.json(list);
  });
});

router.post('/', (req, res) => {
  HabitModel.createHabit(uid(req), req.body || {}, (err, habit) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!habit) return res.status(500).json({ error: '创建失败' });
    res.status(201).json(habit);
  });
});

// 打卡 / 断签 / 请假：UPSERT 到 (habit_id, date)
router.put('/:id/overrides/:date', (req, res) => {
  HabitModel.setOverride(uid(req), Number(req.params.id), req.params.date, req.body || {}, (err, row) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!row) return res.status(404).json({ error: '习惯不存在' });
    res.json(row);
  });
});

// 撤销某天状态 → 回到自动推断（过去 = 断签，未来 = 待办）
router.delete('/:id/overrides/:date', (req, res) => {
  HabitModel.deleteOverride(uid(req), Number(req.params.id), req.params.date, (err, result) => {
    if (err) return fail(res, err);
    if (!result) return res.status(404).json({ error: '习惯不存在' });
    res.json(result);
  });
});

// 改规则（rrule / dtstart / start_time）会封旧规则并从今天起新建一条
router.put('/:id', (req, res) => {
  HabitModel.updateHabit(uid(req), Number(req.params.id), req.body || {}, (err, habit) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!habit) return res.status(404).json({ error: '习惯不存在' });
    res.json(habit);
  });
});

router.delete('/:id', (req, res) => {
  HabitModel.archiveHabit(uid(req), Number(req.params.id), (err, result) => {
    if (err) return fail(res, err);
    res.json(result);
  });
});

module.exports = router;
