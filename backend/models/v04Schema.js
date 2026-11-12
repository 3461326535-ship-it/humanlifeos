/**
 * v0.4 迁移闸门。
 *
 * 三张新表（habits / habit_overrides / recurring_rules）由 db.js 在应用启动时
 * 创建。它们一旦存在，旧的 recurrence 实体化逻辑必须立刻停写 —— 否则
 * migrate_v04.py 刚清理干净的重复行，会在下一次 GET 被
 * catchUpRecurringEvents 重新写回来（真实库里 idx_events_chain_unique 因
 * 存量脏数据从未建成，拦不住）。
 *
 * 这样「新代码启动 → 停旧写入 → 跑迁移」的顺序天然成立，不需要人工编排。
 * 见 docs/task-habit-rrule-design.md §8 的发布顺序硬约束。
 *
 * 只缓存 true：未迁移时保持每次复查，便于迁移在同进程生命周期内完成后
 * 下一次请求自动切换，无需重启。
 */
const db = require('./db');

let ready = false;

function isV04SchemaReady(callback) {
  if (ready) return process.nextTick(() => callback(true));
  db.get(
    "SELECT 1 FROM sqlite_master WHERE type='table' AND name='habit_overrides'",
    [],
    (err, row) => {
      if (err) {
        console.error('[v0.4] 检查 schema 失败（按未迁移处理）:', err.message);
        return callback(false);
      }
      ready = !!row;
      callback(ready);
    }
  );
}

/** 仅供测试使用 */
function _resetCache() { ready = false; }

module.exports = { isV04SchemaReady, _resetCache };
