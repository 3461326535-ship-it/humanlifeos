const express = require('express');
const router = express.Router();
const db = require('../models/db');
const { validate } = require('../../middleware/validate');
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
//
// 为什么显式写 created_at 而不用 DEFAULT CURRENT_TIMESTAMP：
// 那是 UTC，而战报按「本地日期前缀」查（`created_at LIKE '2026-11-17%'`）。
// 北京时间清早 7 点写的随手记会被记到前一天，晚上 11 点写的会跑到第二天 ——
// 「我明明是今天写的」。所以这里一律写本地时间串，写入和读取同一套日期语义。
// date 可选：在战报里翻到前几天、想把当时漏记的一句补上，就得能落到那一天。
router.post('/', validate({
  content: { rule: (v) => typeof v === 'string' && v.length > 0 && v.length <= 500, message: 'content 必须是 1–500 字的字符串' },
  event_id: { rule: (v) => Number.isInteger(v), message: 'event_id 必须是整数', optional: true },
  project_id: { rule: (v) => Number.isInteger(v), message: 'project_id 必须是整数', optional: true },
  date: { rule: (v) => /^\d{4}-\d{2}-\d{2}$/.test(v), message: 'date 必须是 YYYY-MM-DD', optional: true }
}), (req, res) => {
  const userId = uid(req);
  const { content, event_id = null, project_id = null, date = null } = req.body;

  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const clock = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  // 记到未来没有意义：战报按天回看，未来的条目永远看不到
  if (date && date > today) return res.status(400).json({ error: '不能给未来的日期写随手记' });
  const createdAt = `${date || today} ${clock}`;

  db.run(
    `INSERT INTO activities (user_id, event_id, project_id, type, content, created_at) VALUES (?, ?, ?, 'note', ?, ?)`,
    [userId != null ? userId : null, event_id, project_id, content, createdAt],
    function (err) {
      if (err) return res.status(500).json({ error: sanitizeError(err) });
      db.get(`SELECT * FROM activities WHERE id = ?`, [this.lastID], (err2, row) => {
        if (err2) return res.status(500).json({ error: sanitizeError(err2) });
        res.status(201).json(row);
      });
    }
  );
});

// 删掉一条随手记。写错字、记重了都只能删了重来 —— 没有编辑，
// 因为它本来就是「一句话」，改一个字和重说一遍成本一样。
// 只允许删自己的 note：动态流里还有 complete/status_change 这类由系统写的事件，
// 那些是任务的历史，不该被随手抹掉。
router.delete('/:id', (req, res) => {
  const userId = uid(req);
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'id 无效' });

  db.run(
    `DELETE FROM activities WHERE ${scope(userId)} AND id = ? AND type = 'note'`,
    scopeParams(userId, [id]),
    function (err) {
      if (err) return res.status(500).json({ error: sanitizeError(err) });
      if (this.changes === 0) return res.status(404).json({ error: '没有这条随手记' });
      res.json({ ok: true });
    }
  );
});

module.exports = router;
