const express = require('express');
const router = express.Router();
const EventModel = require('../models/eventModel');

// 从 req 提取 userId（已登录 → 用户ID，未登录 → null=guest）
function uid(req) { return req.user ? req.user.userId : null; }

// 获取当前进行中的计时（顶栏实时计时器轮询此端点）
router.get('/active', (req, res) => {
  EventModel.getActiveTimer(uid(req), (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.json({ running: false });
    const startedMs = new Date(row.started_at.replace(' ', 'T') + 'Z').getTime();
    const elapsed = Math.max(0, Math.round((Date.now() - startedMs) / 1000));
    res.json({
      running: true,
      id: row.id,
      event_id: row.event_id,
      event_title: row.event_title,
      event_status: row.event_status,
      started_at: row.started_at,
      elapsed,
    });
  });
});

module.exports = router;
