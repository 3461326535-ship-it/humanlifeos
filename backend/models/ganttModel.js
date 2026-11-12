/**
 * 甘特图模型
 *
 * 职责：
 *  - 读：把 events（含 end_date 计划结束日）+ task_dependencies（含 type / lag）拼成一张图
 *  - 算：CPM（最早/最晚开始、浮动时间、关键路径）
 *  - 写：移动/拉伸任务条 → 依赖它的后续任务自动顺延（级联）；纯 SQLite，无外部依赖
 *
 * 依赖类型（与 MS Project 一致的四种）：
 *  FS 完成后开始（默认）  SS 开始后开始  FF 完成后完成  SF 开始后完成
 *
 * 时间一律用「天序号」(day index = UTC 毫秒 / 86400000) 计算，避免本地时区与夏令时偏移。
 */
'use strict';

const db = require('./db');

const DAY_MS = 86400000;
const DEP_TYPES = ['FS', 'SS', 'FF', 'SF'];
const MAX_TASKS = 800; // 单人工作台量级，防极端数据把一次 GET 拖死

// ── sqlite3 回调 → Promise ──
const all = (sql, params = []) =>
  new Promise((resolve, reject) => db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows || []))));
const getRow = (sql, params = []) =>
  new Promise((resolve, reject) => db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row || null))));
const runSql = (sql, params = []) =>
  new Promise((resolve, reject) =>
    db.run(sql, params, function (err) {
      return err ? reject(err) : resolve(this);
    })
  );

// ── 日期工具 ──
function dayIndex(dateStr) {
  const [y, m, d] = String(dateStr).slice(0, 10).split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / DAY_MS);
}
function isoFromIndex(i) {
  return new Date(i * DAY_MS).toISOString().slice(0, 10);
}
function addDays(dateStr, n) {
  return isoFromIndex(dayIndex(dateStr) + n);
}
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function isDateStr(s) {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s.slice(0, 10));
}

// ── 列存在性探测（只缓存 true：db.js 的 ALTER 是启动时异步跑的，首次可能还没落库）──
const colCache = new Map();
async function hasColumn(table, col) {
  const key = `${table}.${col}`;
  if (colCache.get(key)) return true;
  try {
    const rows = await all(`PRAGMA table_info(${table})`);
    const ok = rows.some((r) => r.name === col);
    if (ok) colCache.set(key, true);
    return ok;
  } catch (e) {
    return false;
  }
}

function scopeWhere(userId, alias = 'e') {
  return userId != null ? `${alias}.user_id = ?` : `${alias}.user_id IS NULL`;
}

// ── 读整张图 ──
async function loadBoard(userId, { projectId = null, includeRecurring = false } = {}) {
  const hasArchived = await hasColumn('events', 'archived_at');
  const hasRule = await hasColumn('events', 'rule_id');
  const hasEndDate = await hasColumn('events', 'end_date');
  const hasMilestone = await hasColumn('events', 'is_milestone');

  const wheres = [scopeWhere(userId)];
  const params = userId != null ? [userId] : [];
  if (hasArchived) wheres.push('e.archived_at IS NULL');
  // 周期任务的实体化实例（如「每天喝水」铺到 2027 年）默认不进甘特：
  // 甘特看的是长周期、有依赖的活，不是重复打卡。需要时用 include_recurring=1 打开。
  if (hasRule && !includeRecurring) wheres.push('e.rule_id IS NULL');
  if (projectId) {
    wheres.push('e.project_id = ?');
    params.push(projectId);
  }

  const rows = await all(
    `SELECT e.id, e.title, e.date, e.status, e.priority, e.category, e.project_id,
            e.start_time, e.end_time, e.completed, e.description
            ${hasEndDate ? ', e.end_date' : ', NULL AS end_date'}
            ${hasMilestone ? ', e.is_milestone' : ', 0 AS is_milestone'}
       FROM events e
      WHERE ${wheres.join(' AND ')}
      ORDER BY e.date, e.id
      LIMIT ${MAX_TASKS}`,
    params
  );

  const subs = await all(
    `SELECT event_id, COUNT(*) AS total, SUM(CASE WHEN completed = 1 THEN 1 ELSE 0 END) AS done
       FROM subtasks GROUP BY event_id`
  );
  const subMap = new Map(subs.map((s) => [s.event_id, { total: Number(s.total) || 0, done: Number(s.done) || 0 }]));

  const today = todayStr();
  const todayIdx = dayIndex(today);

  const tasks = rows.map((r) => {
    const start = String(r.date).slice(0, 10);
    const rawEnd = r.end_date ? String(r.end_date).slice(0, 10) : null;
    const end = rawEnd && rawEnd > start ? rawEnd : start; // 脏数据收敛：结束不早于开始
    const status = r.status || (r.completed ? 'done' : 'todo');
    const s = subMap.get(r.id) || { total: 0, done: 0 };
    const progress = s.total > 0
      ? Math.round((s.done / s.total) * 100)
      : status === 'done' ? 100 : 0;
    const milestone = !!Number(r.is_milestone);
    return {
      id: r.id,
      title: r.title,
      start,
      end,
      duration: dayIndex(end) - dayIndex(start) + 1,
      status,
      priority: r.priority || null,
      category: r.category || '',
      project_id: r.project_id != null ? r.project_id : null,
      start_time: r.start_time || null,
      end_time: r.end_time || null,
      description: r.description || '',
      progress,
      subtasks: { done: s.done, total: s.total },
      milestone,                                  // 用户显式标的里程碑（菱形，不占工期）
      singleDay: dayIndex(end) === dayIndex(start), // 只是恰好排了一天，仍是普通任务
      overdue: status !== 'done' && dayIndex(end) < todayIdx,
      // 下面由 CPM 填
      isCritical: false,
      slack: null,
      deps: [],
      successors: [],
    };
  });

  const projects = await all(
    `SELECT id, name, color, status, start_date, end_date FROM projects
      WHERE ${scopeWhere(userId, 'projects')} AND (status IS NULL OR status != 'deleted')
      ORDER BY created_at`,
    userId != null ? [userId] : []
  );

  const taskMap = new Map(tasks.map((t) => [t.id, t]));
  const projectMap = new Map(projects.map((p) => [p.id, p]));
  tasks.forEach((t) => {
    const p = t.project_id != null ? projectMap.get(t.project_id) : null;
    t.project_name = p ? p.name : null;
    t.project_color = p ? p.color : null;
  });

  const depRows = await all(
    `SELECT event_id, depends_on,
            COALESCE(NULLIF(type, ''), 'FS') AS type,
            COALESCE(lag_days, 0) AS lag_days
       FROM task_dependencies`
  );

  const deps = [];
  depRows.forEach((d) => {
    const to = taskMap.get(d.event_id);
    const from = taskMap.get(d.depends_on);
    if (!to || !from) return; // 端点不在当前作用域（跨用户/已归档），整条忽略
    const type = DEP_TYPES.includes(d.type) ? d.type : 'FS';
    const lag = Number(d.lag_days) || 0;
    const edge = { from: from.id, to: to.id, type, lag };
    deps.push(edge);
    to.deps.push({ id: from.id, type, lag });
    from.successors.push({ id: to.id, type, lag });
  });

  computeCpm(tasks, deps);

  const stats = {
    total: tasks.length,
    done: tasks.filter((t) => t.status === 'done').length,
    overdue: tasks.filter((t) => t.overdue).length,
    critical: tasks.filter((t) => t.isCritical).length,
    withDependencies: tasks.filter((t) => t.deps.length > 0).length,
    milestones: tasks.filter((t) => t.milestone).length,
  };

  return { today, tasks, projects, deps, stats };
}

// ── CPM：正向求最早开始，反向求最晚开始，浮动为 0 即关键路径 ──
function computeCpm(tasks, deps) {
  if (tasks.length === 0) return;
  const map = new Map(tasks.map((t) => [t.id, t]));
  const preds = new Map(tasks.map((t) => [t.id, []]));
  const succs = new Map(tasks.map((t) => [t.id, []]));
  deps.forEach((d) => {
    if (!map.has(d.from) || !map.has(d.to)) return;
    preds.get(d.to).push(d);
    succs.get(d.from).push(d);
  });

  // Kahn 拓扑排序：万一存量数据里有环，环上的任务按原样处理（不参与关键路径）
  const indeg = new Map(tasks.map((t) => [t.id, preds.get(t.id).length]));
  const queue = tasks.filter((t) => indeg.get(t.id) === 0).map((t) => t.id);
  const order = [];
  while (queue.length) {
    const id = queue.shift();
    order.push(id);
    succs.get(id).forEach((d) => {
      indeg.set(d.to, indeg.get(d.to) - 1);
      if (indeg.get(d.to) === 0) queue.push(d.to);
    });
  }
  const cyclic = new Set(tasks.filter((t) => !order.includes(t.id)).map((t) => t.id));

  const ES = new Map();
  const EF = new Map();
  tasks.forEach((t) => {
    ES.set(t.id, 0);
    EF.set(t.id, t.duration - 1);
  });

  order.forEach((id) => {
    const t = map.get(id);
    let es = 0;
    preds.get(id).forEach((d) => {
      const p = map.get(d.from);
      if (!p) return;
      let bound;
      if (d.type === 'SS') bound = ES.get(p.id) + d.lag;
      else if (d.type === 'FF') bound = EF.get(p.id) + d.lag - (t.duration - 1);
      else if (d.type === 'SF') bound = ES.get(p.id) + d.lag - (t.duration - 1);
      else bound = EF.get(p.id) + d.lag + 1; // FS
      if (bound > es) es = bound;
    });
    ES.set(id, es);
    EF.set(id, es + t.duration - 1);
  });

  const projectEnd = Math.max(...tasks.map((t) => EF.get(t.id)));
  const LS = new Map();
  const LF = new Map();
  tasks.forEach((t) => {
    LF.set(t.id, projectEnd);
    LS.set(t.id, projectEnd - t.duration + 1);
  });

  // 逆拓扑序回推
  [...order].reverse().forEach((id) => {
    const t = map.get(id);
    let lf = projectEnd;
    succs.get(id).forEach((d) => {
      const s = map.get(d.to);
      if (!s) return;
      let bound;
      if (d.type === 'SS') bound = LS.get(s.id) - d.lag + (t.duration - 1);
      else if (d.type === 'FF') bound = LF.get(s.id) - d.lag;
      else if (d.type === 'SF') bound = LF.get(s.id) - d.lag + (t.duration - 1);
      else bound = LS.get(s.id) - 1 - d.lag; // FS
      if (bound < lf) lf = bound;
    });
    LF.set(id, lf);
    LS.set(id, lf - t.duration + 1);
  });

  tasks.forEach((t) => {
    if (cyclic.has(t.id)) {
      t.slack = null;
      t.isCritical = false;
      return;
    }
    const slack = LS.get(t.id) - ES.get(t.id);
    t.slack = slack;
    // 关键路径 = 浮动为 0 且真的在链上（孤立任务不算）
    t.isCritical = slack <= 0 && (t.deps.length > 0 || t.successors.length > 0);
  });
}

// ── 依赖图（用于顺延/环检测）──
function buildMaps(tasks, deps) {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const preds = new Map(tasks.map((t) => [t.id, []]));
  const succs = new Map(tasks.map((t) => [t.id, []]));
  deps.forEach((d) => {
    if (!byId.has(d.from) || !byId.has(d.to)) return;
    preds.get(d.to).push(d);
    succs.get(d.from).push(d);
  });
  return { byId, preds, succs };
}

/** 某任务的后续最早可行开始（天序号） */
function requiredStart(duration, predStart, predEnd, type, lag) {
  switch (type) {
    case 'SS': return predStart + lag;
    case 'FF': return predEnd + lag - (duration - 1);
    case 'SF': return predStart + lag - (duration - 1);
    case 'FS':
    default: return predEnd + lag + 1;
  }
}

/**
 * 迭代松弛：把违反依赖的后续任务顺延到最早可行日。
 * allowPull=false（级联默认）只往后推，绝不提前 — 用户手动移动的任务不应被"吸"到前面；
 * allowPull=true（自动排程）允许提前，按最早可行时间紧凑排列。
 */
function relax(graph, { allowPull = false } = {}) {
  const moved = new Map();
  let guard = 0;
  let changed = true;
  while (changed && guard++ < 60) {
    changed = false;
    for (const t of graph.byId.values()) {
      const ps = graph.preds.get(t.id) || [];
      if (ps.length === 0) continue;
      let req = -Infinity;
      for (const d of ps) {
        const p = graph.byId.get(d.from);
        if (!p) continue;
        const r = requiredStart(t.duration, dayIndex(p.start), dayIndex(p.end), d.type, d.lag);
        if (r > req) req = r;
      }
      if (!Number.isFinite(req)) continue;
      const cur = dayIndex(t.start);
      if (req > cur || (allowPull && req < cur)) {
        const delta = req - cur;
        t.start = addDays(t.start, delta);
        t.end = addDays(t.end, delta);
        moved.set(t.id, t);
        changed = true;
      }
    }
  }
  return [...moved.values()];
}

async function persistMoved(moved) {
  for (const t of moved) {
    await runSql(
      `UPDATE events SET date = ?, end_date = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [t.start, dayIndex(t.end) > dayIndex(t.start) ? t.end : null, t.id]
    );
  }
}

// 单连接 sqlite3 上并发 BEGIN 会互相踩（cannot start a transaction within a transaction），
// 用一条 Promise 链把写事务串起来。
let txChain = Promise.resolve();
function withTx(fn) {
  const job = txChain.then(async () => {
    await runSql('BEGIN IMMEDIATE');
    try {
      const out = await fn();
      await runSql('COMMIT');
      return out;
    } catch (err) {
      try { await runSql('ROLLBACK'); } catch (e) { /* 回滚失败不覆盖原始错误 */ }
      throw err;
    }
  });
  txChain = job.then(() => {}, () => {});
  return job;
}

function httpError(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}

// ── 写：移动 / 拉伸任务条 + 级联顺延 ──
// milestone: true → 转成里程碑（强制单日）；false → 转回普通任务；不传 → 保持原状
async function moveTask(userId, id, { start, end, cascade = true, milestone } = {}) {
  if (!isDateStr(start)) throw httpError('BAD_INPUT', 'start 必须是 YYYY-MM-DD');
  let s = start.slice(0, 10);
  let e = isDateStr(end) ? end.slice(0, 10) : s;
  if (e < s) e = s;

  const board = await loadBoard(userId, { includeRecurring: true });
  const task = board.tasks.find((t) => t.id === id);
  if (!task) throw httpError('NOT_FOUND', '任务不存在');

  const wantMilestone = milestone === undefined ? !!task.milestone : !!milestone;
  if (wantMilestone) e = s; // 里程碑只占一个日期点
  const hasMsCol = await hasColumn('events', 'is_milestone');

  const movedTitles = [];
  const result = await withTx(async () => {
    await runSql(
      `UPDATE events SET date = ?, end_date = ?${hasMsCol ? ', is_milestone = ?' : ''}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      hasMsCol
        ? [s, e > s ? e : null, wantMilestone ? 1 : 0, id]
        : [s, e > s ? e : null, id]
    );
    task.start = s;
    task.end = e;
    task.duration = dayIndex(e) - dayIndex(s) + 1;
    task.milestone = wantMilestone;

    if (!cascade) return { moved: [] };
    const graph = buildMaps(board.tasks, board.deps);
    const moved = relax(graph, { allowPull: false });
    await persistMoved(moved);
    moved.forEach((t) => movedTitles.push({ id: t.id, title: t.title, start: t.start, end: t.end }));
    return { moved };
  });

  return {
    success: true,
    task: { id, start: s, end: e, milestone: wantMilestone },
    cascaded: result.moved.length,
    moved: movedTitles,
  };
}

// ── 写：自动排程（所有有依赖的任务按最早可行时间紧凑排，可提前）──
async function autoSchedule(userId) {
  const board = await loadBoard(userId, { includeRecurring: true });
  const graph = buildMaps(board.tasks, board.deps);
  return withTx(async () => {
    const moved = relax(graph, { allowPull: true });
    await persistMoved(moved);
    return {
      success: true,
      cascaded: moved.length,
      moved: moved.map((t) => ({ id: t.id, title: t.title, start: t.start, end: t.end })),
    };
  });
}

// ── 环检测：从 from 沿后继能否走到 to ──
function reaches(succs, from, to) {
  const seen = new Set([from]);
  const stack = [from];
  while (stack.length) {
    const cur = stack.pop();
    if (cur === to) return true;
    for (const d of succs.get(cur) || []) {
      if (!seen.has(d.to)) {
        seen.add(d.to);
        stack.push(d.to);
      }
    }
  }
  return false;
}

async function addDependency(userId, { event_id, depends_on, type = 'FS', lag_days = 0 }) {
  const to = Number(event_id);
  const from = Number(depends_on);
  if (!Number.isInteger(to) || !Number.isInteger(from)) throw httpError('BAD_INPUT', '任务 id 不合法');
  if (to === from) throw httpError('BAD_INPUT', '不能依赖自己');
  const depType = DEP_TYPES.includes(type) ? type : 'FS';
  const lag = Math.trunc(Number(lag_days) || 0);

  const board = await loadBoard(userId, { includeRecurring: true });
  if (!board.tasks.some((t) => t.id === to)) throw httpError('NOT_FOUND', '任务不存在');
  if (!board.tasks.some((t) => t.id === from)) throw httpError('NOT_FOUND', '前置任务不存在');

  const graph = buildMaps(board.tasks, board.deps);
  if (reaches(graph.succs, to, from)) throw httpError('CYCLE', '这条依赖会形成循环（A→B→A），已拦下');

  const existing = await getRow(
    `SELECT 1 FROM task_dependencies WHERE event_id = ? AND depends_on = ?`,
    [to, from]
  );
  await runSql(
    `INSERT OR REPLACE INTO task_dependencies (event_id, depends_on, type, lag_days) VALUES (?, ?, ?, ?)`,
    [to, from, depType, lag]
  );

  // 新增依赖后，若后续任务已违约，立刻顺延
  const moved = await withTx(async () => {
    const fresh = await loadBoard(userId, { includeRecurring: true });
    const g = buildMaps(fresh.tasks, fresh.deps);
    const m = relax(g, { allowPull: false });
    await persistMoved(m);
    return m;
  });

  return {
    success: true,
    updated: !!existing,
    cascaded: moved.length,
    moved: moved.map((t) => ({ id: t.id, title: t.title, start: t.start, end: t.end })),
  };
}

async function updateDependency(userId, { event_id, depends_on, type, lag_days }) {
  const to = Number(event_id);
  const from = Number(depends_on);
  const board = await loadBoard(userId, { includeRecurring: true });
  if (!board.tasks.some((t) => t.id === to)) throw httpError('NOT_FOUND', '任务不存在');
  const depType = DEP_TYPES.includes(type) ? type : 'FS';
  const lag = Math.trunc(Number(lag_days) || 0);
  const r = await runSql(
    `UPDATE task_dependencies SET type = ?, lag_days = ? WHERE event_id = ? AND depends_on = ?`,
    [depType, lag, to, from]
  );
  if (!r.changes) throw httpError('NOT_FOUND', '依赖不存在');
  const moved = await withTx(async () => {
    const fresh = await loadBoard(userId, { includeRecurring: true });
    const g = buildMaps(fresh.tasks, fresh.deps);
    const m = relax(g, { allowPull: false });
    await persistMoved(m);
    return m;
  });
  return { success: true, cascaded: moved.length };
}

async function removeDependency(userId, eventId, dependsOn) {
  const to = Number(eventId);
  const from = Number(dependsOn);
  const board = await loadBoard(userId, { includeRecurring: true });
  if (!board.tasks.some((t) => t.id === to)) throw httpError('NOT_FOUND', '任务不存在');
  const r = await runSql(
    `DELETE FROM task_dependencies WHERE event_id = ? AND depends_on = ?`,
    [to, from]
  );
  return { success: true, deleted: r.changes };
}

module.exports = {
  DEP_TYPES,
  loadBoard,
  moveTask,
  autoSchedule,
  addDependency,
  updateDependency,
  removeDependency,
  // 供测试
  _internals: { computeCpm, relax, buildMaps, requiredStart, dayIndex, addDays },
};
