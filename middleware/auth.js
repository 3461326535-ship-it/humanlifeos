// middleware/auth.js — JWT 鉴权中间件
// optionalAuth: 有 token 就解析，没有也放行（设置 req.user = null）
// requireAuth: 必须有效 token，否则返回 401

const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET || 'fallback-dev-secret';

function optionalAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    req.user = null;
    return next();
  }
  const token = header.split(' ')[1];
  try {
    const decoded = jwt.verify(token, SECRET);
    req.user = { userId: decoded.userId, username: decoded.username };
  } catch (err) {
    req.user = null;
  }
  next();
}

function requireAuth(req, res, next) {
  optionalAuth(req, res, () => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: '请先登录' });
    }
    next();
  });
}

module.exports = { optionalAuth, requireAuth };
