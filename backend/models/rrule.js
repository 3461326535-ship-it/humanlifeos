'use strict';

// ══════════════════════════════════════════════════════════════
// RRULE 子集：解析 / 白名单校验 / 按窗口展开
//
// 设计口径（见 docs/task-habit-rrule-design.md §3.4 / §11）：
//  · 所有日期都是「本地日历日字符串」YYYY-MM-DD，内部用 UTC 毫秒做算术，
//    避免服务器时区 / DST 影响天数差。
//  · Habit 白名单：FREQ=DAILY|WEEKLY + INTERVAL [+ BYDAY(WEEKLY)]
//  · Recurring Task 白名单：额外放行 MONTHLY|YEARLY + BYMONTHDAY(-1) + BYSETPOS
//  · 不支持 COUNT / UNTIL 内联（until 用规则的 until_date 列），
//    不支持多值 BYMONTHDAY 之外的复杂组合，遇到未知字段直接拒绝而不是忽略。
// ══════════════════════════════════════════════════════════════

const DAY_CODES = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA']; // JS getUTCDay(): 0=SU
const DAY_MS = 86400000;
const ALLOWED_KEYS = ['FREQ', 'INTERVAL', 'BYDAY', 'BYMONTHDAY', 'BYSETPOS'];
const FREQS = ['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'];

function pad(n) { return String(n).padStart(2, '0'); }

function toMs(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    throw new Error('日期必须是 YYYY-MM-DD：' + s);
  }
  const [y, m, d] = s.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

function fromMs(ms) {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

function addDays(s, n) { return fromMs(toMs(s) + n * DAY_MS); }

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function parseRRule(str) {
  if (typeof str !== 'string' || !str.trim()) throw new Error('RRULE 不能为空');
  const parts = {};
  str.split(';').forEach((seg) => {
    const piece = seg.trim();
    if (!piece) return;
    const eq = piece.indexOf('=');
    if (eq < 1) throw new Error('RRULE 片段格式错误：' + piece);
    const k = piece.slice(0, eq).toUpperCase();
    const v = piece.slice(eq + 1).toUpperCase();
    if (!ALLOWED_KEYS.includes(k)) throw new Error('不支持的 RRULE 字段：' + k);
    parts[k] = v;
  });

  const freq = parts.FREQ;
  if (!FREQS.includes(freq)) throw new Error('FREQ 必须是 DAILY / WEEKLY / MONTHLY / YEARLY');

  const interval = parts.INTERVAL ? Number(parts.INTERVAL) : 1;
  if (!Number.isInteger(interval) || interval < 1 || interval > 365) {
    throw new Error('INTERVAL 必须是 1~365 的整数');
  }

  let byday = null;
  if (parts.BYDAY) {
    byday = parts.BYDAY.split(',').map((x) => x.trim());
    byday.forEach((d) => { if (!DAY_CODES.includes(d)) throw new Error('非法 BYDAY：' + d); });
  }

  let bymonthday = null;
  if (parts.BYMONTHDAY) {
    bymonthday = parts.BYMONTHDAY.split(',').map(Number);
    bymonthday.forEach((n) => {
      if (!Number.isInteger(n) || n === 0 || n < -1 || n > 31) {
        throw new Error('BYMONTHDAY 只支持 1~31 或 -1（月末）');
      }
    });
  }

  let bysetpos = null;
  if (parts.BYSETPOS) {
    bysetpos = Number(parts.BYSETPOS);
    if (!Number.isInteger(bysetpos) || bysetpos === 0 || Math.abs(bysetpos) > 5) {
      throw new Error('BYSETPOS 只支持 -5~-1 / 1~5');
    }
    if (!byday) throw new Error('BYSETPOS 必须配合 BYDAY 使用');
    if (freq !== 'MONTHLY') throw new Error('BYSETPOS 一期只在 MONTHLY 下放行');
  }

  if (freq === 'DAILY' && byday) throw new Error('DAILY 不接受 BYDAY');
  if (freq !== 'MONTHLY' && bymonthday) throw new Error('BYMONTHDAY 只在 MONTHLY 下放行');

  return { freq, interval, byday, bymonthday, bysetpos };
}

// kind: 'habit' | 'recurring_task'
function assertAllowed(rrule, kind) {
  const r = parseRRule(rrule);
  if (kind === 'habit') {
    if (!['DAILY', 'WEEKLY'].includes(r.freq)) {
      throw new Error('Habit 只支持 DAILY / WEEKLY（MONTHLY / YEARLY 请建 Recurring Task）');
    }
    if (r.bysetpos || r.bymonthday) throw new Error('Habit 不支持 BYMONTHDAY / BYSETPOS');
  } else if (kind !== 'recurring_task') {
    throw new Error('未知类型：' + kind);
  }
  return r;
}

// BYSETPOS：如 BYDAY=MO,TU,WE,TH,FR;BYSETPOS=-1 → 每月最后一个工作日
function matchesSetPos(r, ms) {
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const dim = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const list = [];
  for (let dd = 1; dd <= dim; dd++) {
    const cur = Date.UTC(y, m, dd);
    if (r.byday.includes(DAY_CODES[new Date(cur).getUTCDay()])) list.push(cur);
  }
  const pos = r.bysetpos;
  const target = pos > 0 ? list[pos - 1] : list[list.length + pos];
  return target === ms;
}

function matchesDate(r, ms, startMs) {
  const d = new Date(ms);
  const s = new Date(startMs);
  const dayCode = DAY_CODES[d.getUTCDay()];
  const dayDiff = Math.round((ms - startMs) / DAY_MS);

  switch (r.freq) {
    case 'DAILY':
      return dayDiff >= 0 && dayDiff % r.interval === 0;

    case 'WEEKLY': {
      // 以 dtstart 所在周的周日为第 0 周锚点
      const anchorWeek = startMs - s.getUTCDay() * DAY_MS;
      const curWeek = ms - d.getUTCDay() * DAY_MS;
      const weekDiff = Math.round((curWeek - anchorWeek) / (7 * DAY_MS));
      if (weekDiff < 0 || weekDiff % r.interval !== 0) return false;
      if (r.byday) return r.byday.includes(dayCode);
      return dayCode === DAY_CODES[s.getUTCDay()];
    }

    case 'MONTHLY': {
      const monthDiff = (d.getUTCFullYear() - s.getUTCFullYear()) * 12
        + (d.getUTCMonth() - s.getUTCMonth());
      if (monthDiff < 0 || monthDiff % r.interval !== 0) return false;
      if (r.bysetpos) return matchesSetPos(r, ms);
      if (r.bymonthday) {
        const dim = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
        return r.bymonthday.some((n) => d.getUTCDate() === n || (n === -1 && d.getUTCDate() === dim));
      }
      // 无 BYMONTHDAY：按 dtstart 的日；该月没有这一天则跳过（RRULE 标准，不用 setMonth 溢出）
      return d.getUTCDate() === s.getUTCDate();
    }

    case 'YEARLY': {
      const yearDiff = d.getUTCFullYear() - s.getUTCFullYear();
      if (yearDiff < 0 || yearDiff % r.interval !== 0) return false;
      return d.getUTCMonth() === s.getUTCMonth() && d.getUTCDate() === s.getUTCDate();
    }

    default:
      return false;
  }
}

// 展开 [from, to] 窗口内命中的日期（含 dtstart、不超过 untilDate）
function occurrences(rrule, dtstart, from, to, untilDate) {
  const r = typeof rrule === 'string' ? parseRRule(rrule) : rrule;
  const startMs = toMs(dtstart);
  const lo = Math.max(toMs(from), startMs);
  const hi = Math.min(toMs(to), untilDate ? toMs(untilDate) : Infinity);
  if (lo > hi) return [];
  if (hi - lo > 366 * 20 * DAY_MS) throw new Error('展开窗口过大（超过 20 年），请缩小查询范围');

  const out = [];
  // 从 dtstart 起逐日推进，保证 INTERVAL 的锚点永远正确；窗口通常 ≤ 60 天，开销可忽略。
  for (let ms = startMs; ms <= hi; ms += DAY_MS) {
    if (ms >= lo && matchesDate(r, ms, startMs)) out.push(fromMs(ms));
  }
  return out;
}

module.exports = {
  DAY_CODES,
  DAY_MS,
  parseRRule,
  assertAllowed,
  occurrences,
  toMs,
  fromMs,
  addDays,
  todayStr,
};
