'use strict';

// /api/recurring-rules —— Recurring Task（周期任务）规则与窗口实例
// 看板用的实体行仍落 events，但只在查询窗口内懒补，不再预生成几百上千行。

const express = require('express');
const router = express.Router();
const db = require('../models/db');
const RuleModel = require('../models/recurringRuleModel')(db);
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

// 手动触发窗口懒补（定时任务 / 运维用）
router.post('/ensure-window', (req, res) => {
  const { from, to } = windowOf(req);
  RuleModel.ensureWindow(uid(req), from, to, (err, result) => {
    if (err) return fail(res, err);
    res.json({ from, to, ...result });
  });
});

// 手动触发归档（定时任务会每天调用一次）
router.post('/archive-old', (req, res) => {
  const days = Number(req.body && req.body.days) || 90;
  const limit = Number(req.body && req.body.limit) || 500;
  RuleModel.archiveOldInstances(uid(req), days, limit, (err, result) => {
    if (err) return fail(res, err);
    res.json(result);
  });
});

// 看板 / 日历取实例：先懒补再查，保证窗口内一定有行
router.get('/instances', (req, res) => {
  const { from, to } = windowOf(req);
  const includeArchived = req.query.include_archived === '1';
  RuleModel.ensureWindow(uid(req), from, to, (err) => {
    if (err) return fail(res, err);
    RuleModel.listInstances(uid(req), from, to, includeArchived, (e2, list) => {
      if (e2) return fail(res, e2);
      res.json({ from, to, include_archived: includeArchived, items: list });
    });
  });
});

// 周期任务按时交付率（统计口径不加 archived 过滤）
router.get('/stats', (req, res) => {
  const { from, to } = windowOf(req);
  RuleModel.getStats(uid(req), from, to, (err, stats) => {
    if (err) return fail(res, err);
    res.json(stats);
  });
});

router.get('/', (req, res) => {
  const { from, to } = windowOf(req);
  RuleModel.listRules(uid(req), from, to, (err, list) => {
    if (err) return fail(res, err);
    res.json(list);
  });
});

router.post('/', (req, res) => {
  RuleModel.createRule(uid(req), req.body || {}, (err, rule) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!rule) return res.status(500).json({ error: '创建失败' });
    res.status(201).json(rule);
  });
});

// 改这一次：只改 date / time，occurrence_date 不变
router.patch('/instances/:id', (req, res) => {
  RuleModel.patchInstance(uid(req), Number(req.params.id), req.body || {}, (err, row) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!row) return res.status(404).json({ error: '周期实例不存在' });
    res.json(row);
  });
});

router.post('/instances/:id/unarchive', (req, res) => {
  RuleModel.unarchive(uid(req), Number(req.params.id), (err, result) => {
    if (err) return fail(res, err);
    res.json(result);
  });
});

// 改规则：影响后续窗口懒补，已有实例不动
router.put('/:id', (req, res) => {
  RuleModel.updateRule(uid(req), Number(req.params.id), req.body || {}, (err, rule) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!rule) return res.status(404).json({ error: '规则不存在' });
    res.json(rule);
  });
});

// 归档规则：停止生成新实例，已有实例保留
router.delete('/:id', (req, res) => {
  RuleModel.archiveRule(uid(req), Number(req.params.id), (err, result) => {
    if (err) return fail(res, err);
    res.json(result);
  });
});

module.exports = router;
