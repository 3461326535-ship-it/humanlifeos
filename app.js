require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

// ===== 数据库连接 =====
// MySQL（便签墙）
const { testConnection } = require('./config/database');

// SQLite（日程管理 + AI）— db.js 加载时自动初始化（含 v0.4 三表 / 三列 / 五索引）
const db = require('./backend/models/db');

// ===== 路由模块 =====
const notesRouter = require('./routes/notes');
const eventsRouter = require('./backend/routes/events');
const aiRouter = require('./backend/routes/ai');
const projectsRouter = require('./backend/routes/projects');
const activitiesRouter = require('./backend/routes/activities');
const statsRouter = require('./backend/routes/stats');
const reportsRouter = require('./backend/routes/reports');
const timersRouter = require('./backend/routes/timers');
const timelineRouter = require('./backend/routes/timeline');
// v0.4 三分类：Habit / Recurring Task / 统一日历
const habitsRouter = require('./backend/routes/habits');
const recurringRulesRouter = require('./backend/routes/recurring-rules');
const calendarRouter = require('./backend/routes/calendar');
const ganttRouter = require('./backend/routes/gantt');
const createArchiveTask = require('./backend/models/archiveTask');
const authRouter = require('./routes/auth');
const yuexinRouter = require('./routes/yuexin');
const commonSitesRouter = require('./routes/common-sites');
const { optionalAuth } = require('./middleware/auth');

// ===== 启动前校验 =====
if (!process.env.DEEPSEEK_API_KEY || process.env.DEEPSEEK_API_KEY === 'your-deepseek-api-key') {
  console.warn('⚠️  DEEPSEEK_API_KEY 未配置，AI 日程助手将不可用');
  console.warn('   请在 .env 或系统环境变量中设置 DEEPSEEK_API_KEY');
}

const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// ===== 信任 nginx 反向代理（rate-limit 等中间件需要）=====
app.set('trust proxy', 1);

// ===== 移动端构建目录 =====
const MOBILE_DIST = path.join(__dirname, 'mobile', 'app', 'dist');

// ===== UA 检测工具 =====
function isMobileUA(ua) {
  return /Mobile|Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(ua || '');
}

// ===== 日志目录 =====
const logDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });

// ===== 安全头 (helmet) =====
app.use(helmet({
  contentSecurityPolicy: false,     // 工具页面有内联脚本，CSP 暂不强制
  strictTransportSecurity: false,   // IP 访问无有效 SSL 证书，HSTS 会强制升级到 HTTPS 导致证书错误
  crossOriginResourcePolicy: false, // 关闭 CORP — APK WebView 跨域 fetch 会被 same-origin 阻断
  crossOriginOpenerPolicy: false,   // 关闭 COOP — 同上
}));

// ===== HTTP 请求日志 (morgan) =====
const morganFormat = process.env.NODE_ENV === 'production' ? 'combined' : 'dev';
app.use(morgan(morganFormat));

// ===== CORS 配置 =====
const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost').split(',');
app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    if (origin) { const ts = new Date().toISOString(); fs.appendFileSync(path.join(logDir, 'cors-debug.log'), ts + ' origin=' + origin + '\n'); }
    if (origin === 'null' || /^file:\/\//.test(origin)) return callback(null, true);
    // 允许 Capacitor 本地环境（APK 中加载的 WebView）
    if (/^https?:\/\/localhost(:\d+)?$/.test(origin) || /^capacitor:\/\/localhost(:\d+)?$/.test(origin)) return callback(null, true);
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('不允许的 CORS 请求'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// ===== 请求体解析（Express 内置，替代 body-parser）=====
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// ===== 首页（UA 分流：桌面端 → todo.html，移动端 → mobile 项目）=====
app.get('/', (req, res) => {
  if (isMobileUA(req.headers['user-agent'])) {
    res.sendFile(path.join(MOBILE_DIST, 'index.html'));
  } else {
    res.sendFile(path.join(__dirname, 'todo.html'));
  }
});

// /todo.html 始终返回桌面版
app.get('/todo.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'todo.html'));
});

// ===== Favicon（确保始终可访问）=====
app.get('/favicon.ico', (req, res) => res.sendFile(path.join(__dirname, 'favicon.ico')));
app.get('/favicon.svg', (req, res) => res.sendFile(path.join(__dirname, 'favicon.svg')));

// ===== 静态文件服务 =====
app.use(express.static(MOBILE_DIST));   // 移动端资源（assets/ 等）
app.use(express.static(__dirname));     // 桌面端资源 + 公共文件

// ===== Auth 路由（不需要鉴权）=====
app.use('/api/auth', authRouter);     // 登录: /api/auth/login 等
app.use('/api/yuexin', yuexinRouter); // 月信: /api/yuexin/records, /api/yuexin/sync
app.use('/api/common-sites', commonSitesRouter); // 常用网站: /api/common-sites, /api/common-sites/sync

// ===== API 路由（可选鉴权 → 设置 req.user）=====
app.use('/api', optionalAuth, notesRouter);         // 便签: /api/notes
app.use('/api/events', optionalAuth, eventsRouter); // 日程: /api/events（v2 含 /status /reorder /timer）
app.use('/api/projects', optionalAuth, projectsRouter);   // 项目: /api/projects
app.use('/api/activities', optionalAuth, activitiesRouter); // 动态流: /api/activities
app.use('/api/stats', optionalAuth, statsRouter);    // 统计: /api/stats/overview
app.use('/api/reports', optionalAuth, reportsRouter); // 战报: /api/reports/daily
app.use('/api/timers', optionalAuth, timersRouter);   // 计时: /api/timers/active
app.use('/api/timeline', optionalAuth, timelineRouter); // 时间轴实际投入: /api/timeline/actual
// v0.4 三分类 API（旧 /api/events /overview /daily 保持兼容，不动）
app.use('/api/habits', optionalAuth, habitsRouter);                    // 习惯: 规则、按日状态、统计
app.use('/api/recurring-rules', optionalAuth, recurringRulesRouter);   // 周期任务: 规则、窗口实例、归档
app.use('/api/calendar', optionalAuth, calendarRouter);                // 三分类统一日历投影
app.use('/api/gantt', optionalAuth, ganttRouter);                      // 甘特: 图、依赖、级联排程

// AI 端点限流: 仅作用于 chat / confirm，历史读写不占用额度
const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  message: { success: false, message: '请求太频繁，请稍后再试' }
});
app.use('/api/ai', optionalAuth);
app.use(['/api/ai/chat', '/api/ai/confirm'], aiLimiter);
app.use('/api/ai', aiRouter);         // AI:   /api/ai/chat, /api/ai/confirm

// ===== PC 端 React 版（/app，M1 灰度入口）=====
const WEB_DIST = path.join(__dirname, 'web', 'dist');
// 静态资源（vite 产物带 hash，可长缓存；index 不走 static 以免吃缓存）
app.use('/app', express.static(WEB_DIST, { maxAge: '1y', index: false }));
// SPA fallback：/app/kanban 等前端路由一律回退 index.html（React Router 接管）
app.get(['/app', '/app/*'], (req, res) => {
  res.sendFile(path.join(WEB_DIST, 'index.html'));
});

// ===== 健康检查 =====
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ===== 移动端 SPA 路由兜底 =====
// 移动端访问非 API、非静态文件的路径时，返回 mobile 项目的 index.html
app.get('*', (req, res, next) => {
  if (isMobileUA(req.headers['user-agent']) && !req.path.startsWith('/api')) {
    res.sendFile(path.join(MOBILE_DIST, 'index.html'));
  } else {
    next();
  }
});

// ===== 404 处理 =====
app.use((req, res) => {
  res.status(404).json({ success: false, message: '接口不存在' });
});

// ===== 全局错误处理 =====
app.use((err, req, res, next) => {
  console.error('服务器错误:', err.message || err);
  res.status(500).json({
    success: false,
    message: '服务器内部错误',
    error: process.env.NODE_ENV === 'production' ? undefined : '服务器内部错误，请稍后重试'
  });
});

// ===== 启动服务器 =====
async function startServer() {
  const dbConnected = await testConnection();
  if (!dbConnected) {
    console.warn('⚠️  MySQL 数据库连接失败，便签功能不可用');
    console.warn('   日程管理和 AI 助手仍可正常使用（基于 SQLite）');
  }

  app.listen(PORT, () => {
    // v0.4：每天软归档「已完成且超过 90 天」的周期实例，不删行、不影响统计。
    // 环境变量 V04_ARCHIVE_DISABLED=1 可一键停掉，便于上线回滚。
    if (process.env.V04_ARCHIVE_DISABLED !== '1') {
      createArchiveTask(db).start();
      console.log('📦 v0.4 周期实例归档任务已启动（90 天 / 每 24h）');
    }

    console.log('\n🚀 服务器启动成功！');
    console.log('📍 首页:     http://localhost:' + PORT);
    console.log('📍 便签 API: http://localhost:' + PORT + '/api/notes');
    console.log('📍 日程 API: http://localhost:' + PORT + '/api/events');
    console.log('📍 AI 助手:  http://localhost:' + PORT + '/api/ai/chat');
    console.log('📍 健康检查: http://localhost:' + PORT + '/health\n');
  });
}

startServer();

// ===== 优雅关闭 =====
process.on('SIGTERM', () => {
  console.log('收到 SIGTERM，关闭服务器...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('收到 SIGINT，关闭服务器...');
  process.exit(0);
});
