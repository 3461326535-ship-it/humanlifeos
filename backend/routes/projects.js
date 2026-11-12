const express = require('express');
const router = express.Router();
const db = require('../models/db');
const { validate, RULES } = require('../../middleware/validate');
const { sanitizeError } = require('../../middleware/sanitizeError');

function uid(req) { return req.user ? req.user.userId : null; }
// 与 events 一致的用户作用域：登录 → user_id = ?；未登录 → user_id IS NULL
function scope(userId) {
  return userId != null ? 'user_id = ?' : 'user_id IS NULL';
}
function scopeParams(userId, extra) {
  return userId != null ? [userId, ...extra] : extra;
}

// 列表
router.get('/', (req, res) => {
  const userId = uid(req);
  db.all(
    `SELECT * FROM projects WHERE ${scope(userId)} AND status != 'deleted' ORDER BY created_at DESC`,
    scopeParams(userId, []),
    (err, rows) => {
      if (err) return res.status(500).json({ error: sanitizeError(err) });
      res.json(rows);
    }
  );
});

// 创建
router.post('/', validate({
  name: { rule: RULES.string, message: 'name 必须是字符串' },
  color: { rule: RULES.string, message: 'color 必须是字符串', optional: true },
  start_date: { rule: RULES.string, message: 'start_date 必须是字符串', optional: true },
  end_date: { rule: RULES.string, message: 'end_date 必须是字符串', optional: true }
}), (req, res) => {
  const userId = uid(req);
  const { name, color = null, start_date = null, end_date = null } = req.body;
  db.run(
    `INSERT INTO projects (user_id, name, color, start_date, end_date) VALUES (?, ?, ?, ?, ?)`,
    [userId != null ? userId : null, name, color, start_date, end_date],
    function (err) {
      if (err) return res.status(500).json({ error: sanitizeError(err) });
      db.get(`SELECT * FROM projects WHERE id = ?`, [this.lastID], (err2, row) => {
        if (err2) return res.status(500).json({ error: sanitizeError(err2) });
        res.status(201).json(row);
      });
    }
  );
});

// 更新
router.put('/:id', validate({
  name: { rule: RULES.string, message: 'name 必须是字符串', optional: true },
  color: { rule: RULES.string, message: 'color 必须是字符串', optional: true },
  status: { rule: (v) => ['active', 'archived', 'deleted'].includes(v), message: 'status 必须是 active / archived / deleted', optional: true },
  start_date: { rule: RULES.string, message: 'start_date 必须是字符串', optional: true },
  end_date: { rule: RULES.string, message: 'end_date 必须是字符串', optional: true }
}), (req, res) => {
  const userId = uid(req);
  const id = parseInt(req.params.id);
  const allowed = ['name', 'color', 'status', 'start_date', 'end_date'];
  const setClauses = [];
  const values = [];
  allowed.forEach(f => {
    if (f in req.body) { setClauses.push(`${f} = ?`); values.push(req.body[f]); }
  });
  if (setClauses.length === 0) return res.status(400).json({ error: '没有要更新的字段' });
  setClauses.push('updated_at = CURRENT_TIMESTAMP');
  values.push(id);
  if (userId != null) values.push(userId);

  db.run(
    `UPDATE projects SET ${setClauses.join(', ')} WHERE id = ? AND ${scope(userId)}`,
    values,
    (err) => {
      if (err) return res.status(500).json({ error: sanitizeError(err) });
      db.get(`SELECT * FROM projects WHERE id = ?`, [id], (err2, row) => {
        if (err2) return res.status(500).json({ error: sanitizeError(err2) });
        if (!row) return res.status(404).json({ error: '项目不存在' });
        res.json(row);
      });
    }
  );
});

// 删除（软删除：事件解除关联，项目标记 deleted）
router.delete('/:id', (req, res) => {
  const userId = uid(req);
  const id = parseInt(req.params.id);
  db.run(
    `UPDATE projects SET status = 'deleted', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND ${scope(userId)}`,
    scopeParams(userId, [id]),
    function (err) {
      if (err) return res.status(500).json({ error: sanitizeError(err) });
      if (this.changes === 0) return res.status(404).json({ error: '项目不存在' });
      db.run(`UPDATE events SET project_id = NULL WHERE project_id = ?`, [id], (err2) => {
        if (err2) console.error('[Projects] 解除事件关联失败:', err2.message);
        res.json({ success: true, id });
      });
    }
  );
});

module.exports = router;
