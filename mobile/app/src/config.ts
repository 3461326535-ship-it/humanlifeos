/**
 * 应用全局配置
 *
 * API_BASE — 后端 API 地址
 * - 本地开发时改为 'http://localhost:3000/api'
 * - 生产 APK 中用服务器地址，这样 UI 仍从 APK 本机加载（离线可用），只有数据请求走网络
 */
// 生产环境用域名（有有效 SSL 证书）
// 本地开发用 http://localhost:3000/api
export const API_BASE = 'https://humanlifeos.art/api';

/** 应用版本，与 package.json 保持同步 */
export const APP_VERSION = '2.0.0';
