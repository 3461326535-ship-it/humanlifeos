// middleware/auth.js — JWT 鉴权中间件
// optionalAuth: 有 token 就解析，没有也放行（设置 req.user = null）
// requireAuth: 必须有效 token，否则返回 401
// token 来源双通道：Authorization: Bearer（移动端 Capacitor / 旧版 PC）→ 优先；
//                  httpOnly Cookie 'token'（web React 版，防 XSS 偷 token）→ 兜底

const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET || 'fallback-dev-secret';

function extractToken(req) {
  // 1. Authorization: Bearer <token>
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) {
    return header.split(' ')[1];
  }
  // 2. httpOnly Cookie（不引入 cookie-parser，直接解析，避免新依赖）
  const cookieHeader = req.headers.cookie;
  if (cookieHeader) {
    const m = /(?:^|;\s*)token=([^;]+)/.exec(cookieHeader);
    if (m) {
      try { return decodeURIComponent(m[1]); } catch (e) { return m[1]; }
    }
  }
  return null;
}

function optionalAuth(req, res, next) {
  const token = extractToken(req);
  if (!token) {
    req.user = null;
    return next();
  }
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
