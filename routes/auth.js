// routes/auth.js — 登录鉴权 API
// /api/auth/login  /api/auth/status  /api/auth/change-password  /api/auth/logout

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../backend/models/db');
const { validate, RULES } = require('../middleware/validate');
const { optionalAuth, requireAuth } = require('../middleware/auth');

const SECRET = process.env.JWT_SECRET || 'fallback-dev-secret';
const TOKEN_EXPIRY = process.env.TOKEN_EXPIRY || '30d';

// ═══════════════════════════════════════════════
// POST /api/auth/login
// ═══════════════════════════════════════════════
router.post('/login', validate({
  username: { rule: RULES.string, message: 'username 必须是字符串', optional: true },
  password: { rule: RULES.string, message: 'password 必须是字符串' }
}), (req, res) => {
  const { username, password } = req.body;
  const loginName = (username || 'admin').trim();

  db.get('SELECT * FROM users WHERE username = ?', [loginName], (err, user) => {
    if (err) {
      return res.status(500).json({ success: false, message: '服务器错误' });
    }
    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      return res.status(401).json({ success: false, message: '密码错误' });
    }

    const token = jwt.sign(
      { userId: user.id, username: user.username },
      SECRET,
      { expiresIn: TOKEN_EXPIRY }
    );

    res.json({
      success: true,
      token,
      user: {
        username: user.username,
        isDefaultPassword: !!user.is_default_password
      }
    });
  });
});

// ═══════════════════════════════════════════════
// GET /api/auth/status — 验证 token 有效性
// ═══════════════════════════════════════════════
router.get('/status', requireAuth, (req, res) => {
  db.get('SELECT username, is_default_password FROM users WHERE id = ?',
    [req.user.userId], (err, user) => {
      if (err || !user) {
        return res.status(401).json({ success: false, message: '用户不存在' });
      }
      res.json({
        success: true,
        user: {
          username: user.username,
          isDefaultPassword: !!user.is_default_password
        }
      });
    });
});

// ═══════════════════════════════════════════════
// POST /api/auth/change-password
// ═══════════════════════════════════════════════
router.post('/change-password', requireAuth, validate({
  currentPassword: { rule: RULES.string, message: 'currentPassword 必须是字符串' },
  newPassword: { rule: RULES.string, message: 'newPassword 必须是字符串' }
}), (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({ success: false, message: '新密码至少6位' });
  }

  db.get('SELECT * FROM users WHERE id = ?', [req.user.userId], (err, user) => {
    if (err || !user) {
      return res.status(500).json({ success: false, message: '用户查询失败' });
    }

    if (!bcrypt.compareSync(currentPassword, user.password_hash)) {
      return res.status(401).json({ success: false, message: '当前密码错误' });
    }

    const newHash = bcrypt.hashSync(newPassword, 10);

    db.run(
      'UPDATE users SET password_hash = ?, is_default_password = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [newHash, req.user.userId],
      (updateErr) => {
        if (updateErr) {
          return res.status(500).json({ success: false, message: '密码更新失败' });
        }
        res.json({ success: true, message: '密码修改成功' });
      }
    );
  });
});

// ═══════════════════════════════════════════════
// POST /api/auth/register
// ═══════════════════════════════════════════════
router.post('/register', validate({
  username: { rule: RULES.string, message: 'username 必须是字符串' },
  password: { rule: RULES.string, message: 'password 必须是字符串' }
}), (req, res) => {
  const { username, password } = req.body;

  if (!username || username.trim().length < 2) {
    return res.status(400).json({ success: false, message: '用户名至少2个字符' });
  }
  if (!password || password.length < 6) {
    return res.status(400).json({ success: false, message: '密码至少6位' });
  }

  const name = username.trim();

  // 检查用户名唯一
  db.get('SELECT id FROM users WHERE username = ?', [name], (err, row) => {
    if (err) return res.status(500).json({ success: false, message: '服务器错误' });
    if (row) return res.status(409).json({ success: false, message: '用户名已被注册' });

    const hash = bcrypt.hashSync(password, 10);

    db.run(
      'INSERT INTO users (username, password_hash, is_default_password) VALUES (?, ?, 0)',
      [name, hash],
      function (insertErr) {
        if (insertErr) {
          return res.status(500).json({ success: false, message: '注册失败' });
        }

        const token = jwt.sign(
          { userId: this.lastID, username: name },
          SECRET,
          { expiresIn: TOKEN_EXPIRY }
        );

        res.status(201).json({
          success: true,
          token,
          user: { username: name, isDefaultPassword: false }
        });
      }
    );
  });
});

// ═══════════════════════════════════════════════
// POST /api/auth/migrate — 将匿名数据迁移到用户账号
// ═══════════════════════════════════════════════
router.post('/migrate', requireAuth, (req, res) => {
  const userId = req.user.userId;
  let counts = { events: 0, chat: 0 };

  // 迁移 events
  db.run('UPDATE events SET user_id = ? WHERE user_id IS NULL', [userId], function (err) {
    if (!err) counts.events = this.changes;

    // 迁移 chat_history
    db.run('UPDATE chat_history SET user_id = ? WHERE user_id IS NULL', [userId], function (err2) {
      if (!err2) counts.chat = this.changes;

      const total = counts.events + counts.chat;
      res.json({
        success: true,
        message: total > 0 ? `已迁移 ${total} 条数据` : '没有需要迁移的数据',
        counts
      });
    });
  });
});

// ═══════════════════════════════════════════════
// POST /api/auth/logout
// ═══════════════════════════════════════════════
router.post('/logout', optionalAuth, (req, res) => {
  // 客户端清除 token 即完成登出，服务端无需额外操作
  res.json({ success: true, message: '已退出登录' });
});

module.exports = router;
