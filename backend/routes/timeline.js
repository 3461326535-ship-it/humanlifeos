'use strict';

// /api/timeline —— 时间轴「实际投入」
// 统计面板、每日战报、日历「实际」视图共用同一份去重结果。

const express = require('express');
const router = express.Router();
const { collect } = require('../services/actualLoad');
const { sanitizeError } = require('../../middleware/sanitizeError');

function uid(req) { return req.user ? req.user.userId : null; }

// GET /api/timeline/actual?from=<UTC>&to=<UTC>&fromDay=&toDay=&tz=480
router.get('/actual', (req, res) => {
  const { from, to } = req.query;
  if (!from || !to) {
    return res.status(400).json({ error: 'from / to 必填（UTC 时间字符串，如 2026-11-13 00:00:00）' });
  }
  collect(
    {
      userId: uid(req),
      fromTs: String(from),
      toTs: String(to),
      fromDay: req.query.fromDay ? String(req.query.fromDay) : undefined,
      toDay: req.query.toDay ? String(req.query.toDay) : undefined,
      tzOffsetMin: req.query.tz != null && req.query.tz !== '' ? Number(req.query.tz) : -new Date().getTimezoneOffset(),
    },
    (err, data) => {
      if (err) return res.status(err.statusCode || 400).json({ error: sanitizeError(err) });
      res.json(data);
    }
  );
});

module.exports = router;
