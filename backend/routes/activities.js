const express = require('express');
const router = express.Router();
const db = require('../models/db');
const { validate, RULES } = require('../../middleware/validate');
const { sanitizeError } = require('../../middleware/sanitizeError');

function uid(req) { return req.user ? req.user.userId : null; }
function scope(userId) {
  return userId != null ? 'user_id = ?' : 'user_id IS NULL';
}
function scopeParams(userId, extra) {
  return userId != null ? [userId, ...extra] : extra;
}

// 动态流：倒序分页（limit 默认 50，before 用于向下翻页）
router.get('/', (req, res) => {
  const userId = uid(req);
  const limit = Math.min(parseInt(req.query.limit) || 50, 200);
  const before = req.query.before || null;

  const where = before
    ? `${scope(userId)} AND created_at < ?`
    : scope(userId);
  const params = before ? scopeParams(userId, [before, limit]) : scopeParams(userId, [limit]);

  db.all(
    `SELECT * FROM activities WHERE ${where} ORDER BY created_at DESC, id DESC LIMIT ?`,
    params,
    (err, rows) => {
      if (err) return res.status(500).json({ error: sanitizeError(err) });
      res.json(rows);
    }
  );
});

// 随手记：发布一条 note
router.post('/', validate({
  content: { rule: RULES.string, message: 'content 必须是字符串' },
  event_id: { rule: (v) => Number.isInteger(v), message: 'event_id 必须是整数', optional: true },
  project_id: { rule: (v) => Number.isInteger(v), message: 'project_id 必须是整数', optional: true }
}), (req, res) => {
  const userId = uid(req);
  const { content, event_id = null, project_id = null } = req.body;
  db.run(
    `INSERT INTO activities (user_id, event_id, project_id, type, content) VALUES (?, ?, ?, 'note', ?)`,
    [userId != null ? userId : null, event_id, project_id, content],
    function (err) {
      if (err) return res.status(500).json({ error: sanitizeError(err) });
      db.get(`SELECT * FROM activities WHERE id = ?`, [this.lastID], (err2, row) => {
        if (err2) return res.status(500).json({ error: sanitizeError(err2) });
        res.status(201).json(row);
      });
    }
  );
});

module.exports = router;
