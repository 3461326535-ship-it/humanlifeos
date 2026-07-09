/**
 * 错误消息脱敏工具
 * 防止 SQL 等底层错误信息直接暴露给前端
 */

// SQLite 错误码常见前缀
const DB_ERROR_PATTERNS = [
  /^SQLITE_/,
  /^SQLITE_CONSTRAINT/,
  /^SQLITE_ERROR/,
  /^SQLITE_BUSY/,
  /^SQLITE_MISUSE/,
  /^Error: SQLITE/,
  /UNIQUE constraint failed/,
  /NOT NULL constraint failed/,
  /FOREIGN KEY constraint failed/,
  /no such table/,
  /no such column/,
  /database is locked/,
  /disk I\/O error/,
];

/**
 * 判断是否为数据库/系统级错误（不应暴露给前端）
 */
function isSystemError(err) {
  if (!err) return false;
  const message = (err.message || '').toString();
  return DB_ERROR_PATTERNS.some(pattern => pattern.test(message));
}

/**
 * 脱敏错误消息
 * @param {Error|string} err - 原始错误对象或字符串
 * @param {string} [fallback='服务器内部错误，请稍后重试'] - 脱敏后的兜底消息
 * @returns {string} 安全的消息文本
 */
function sanitizeError(err, fallback) {
  if (!err) return fallback || '服务器内部错误，请稍后重试';

  const message = typeof err === 'string' ? err : (err.message || '');

  // 系统级错误 → 替换为通用消息
  if (isSystemError(err)) {
    // 日志中保留真实错误便于排查
    if (typeof err !== 'string') {
      console.error('[Sanitized Error]', err.message || err);
    } else {
      console.error('[Sanitized Error]', err);
    }
    return fallback || '服务器内部错误，请稍后重试';
  }

  // 非系统错误 → 保留原消息（通常是业务逻辑错误，如"事件不存在"）
  return message || fallback || '操作失败';
}

module.exports = { sanitizeError, isSystemError };
