'use strict';

// 周期实例归档定时任务（软归档，见方案 §4.6）
//  · 每天一次，批量上限 500 行；只归档「已完成 + 完成超过 N 天」的周期实例
//  · 未完成逾期项必须留在看板；一次性 Task 完全不动
//  · 统计 / 战报查询不加 archived 过滤，归档不影响长期数据
//  · 导出 runOnce 供测试与手动触发，不依赖定时器即可验证

const DEFAULT_DAYS = 90;
const DEFAULT_LIMIT = 500;
const DAY_MS = 86400000;

function createArchiveTask(db) {
  const createRuleModel = require('./recurringRuleModel');
  const RuleModel = createRuleModel(db);

  function allUserIds(cb) {
    db.all(
      `SELECT user_id FROM recurring_rules WHERE user_id IS NOT NULL
       UNION
       SELECT user_id FROM events WHERE user_id IS NOT NULL AND rule_id IS NOT NULL`,
      [],
      (err, rows) => {
        if (err) return cb(err, null);
        // null 代表 guest 数据，也必须归档
        cb(null, [...new Set((rows || []).map((r) => r.user_id)), null]);
      }
    );
  }

  function runOnce(options, cb) {
    const opts = typeof options === 'function' ? {} : (options || {});
    const done = typeof options === 'function' ? options : cb;
    const days = opts.days || DEFAULT_DAYS;
    const limit = opts.limit || DEFAULT_LIMIT;

    allUserIds((err, users) => {
      if (err) return done(err, null);
      let i = 0;
      let total = 0;
      const result = { days, limit, users: users.length, archived: 0, errors: [] };
      const next = () => {
        if (i >= users.length) {
          result.archived = total;
          return done(null, result);
        }
        const userId = users[i++];
        RuleModel.archiveOldInstances(userId, days, limit, (e, r) => {
          if (e) result.errors.push({ userId, message: e.message });
          else total += r.archived || 0;
          next();
        });
      };
      next();
    });
  }

  // 启动后立即跑一次（延迟 10s，避开应用启动高峰），之后每 24h 一次
  function start(options) {
    const opts = options || {};
    const interval = opts.intervalMs || DAY_MS;
    const initialDelay = opts.initialDelayMs == null ? 10000 : opts.initialDelayMs;
    const run = () => runOnce(opts, (err, r) => {
      if (err) console.error('[v0.4][archive] 归档失败:', err.message);
      else console.log(`[v0.4][archive] 完成：归档 ${r.archived} 行 / ${r.users} 个用户范围`);
    });
    setTimeout(run, initialDelay);
    const timer = setInterval(run, interval);
    if (timer.unref) timer.unref();
    return timer;
  }

  return { runOnce, start, DEFAULT_DAYS, DEFAULT_LIMIT };
}

module.exports = createArchiveTask;
