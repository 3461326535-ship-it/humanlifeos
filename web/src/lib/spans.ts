// 跨天任务（有 end_date 且 > date）在「某一天」上该怎么显示。
//
// 为什么单独抽一层：一个 11/10–11/20 的任务不是 11 条独立的待办，
// 它是一条一直挂在手上的活。所以它在时间轴上占 11 格，但在「今天」页应该
// 每天都出现一次，直到被完成 —— 而且要说清「现在第几天 / 还剩几天」，
// 否则每天都看到同一行会分不清它是新任务还是老任务。

export function endOf(e: { date: string; end_date?: string | null }): string {
  return e.end_date && e.end_date > e.date ? e.end_date : '';
}

/** 本地自然日 'YYYY-MM-DD' */
export function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * 「完成于哪一天」→ 要落库的时间戳。
 *
 * 今天就用此刻（时间点有意义，统计看的是当天）；补录到别的日子用当地正午 ——
 * 不用 00:00 是为了避开时区边界，后端统一按 UTC 存，doneDate() 再转回本地自然日，
 * 两头都稳定地落在同一天。
 */
export function doneStamp(date: string): string {
  if (date === todayStr()) return new Date().toISOString();
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1, 12, 0, 0).toISOString();
}

function toUTC(s: string) {
  const [y, m, d] = s.split('-').map(Number);
  return Date.UTC(y, (m || 1) - 1, d || 1);
}

/** b - a，按自然日算（避开夏令时/时区，全部走 UTC） */
export function diffDays(a: string, b: string): number {
  return Math.round((toUTC(b) - toUTC(a)) / 86400000);
}

export function md(s: string) {
  const [, m, d] = s.split('-');
  return `${Number(m)}/${Number(d)}`;
}

/**
 * completed_at 存的是 UTC（后端用 toISOString 写的），要用「本地自然日」判断
 * 是哪天收的尾，否则凌晨 0–8 点完成的任务会被算到前一天。
 */
export function doneDate(e: { completed_at?: string | null }): string {
  const raw = e.completed_at;
  if (!raw) return '';
  const hasTz = /[zZ]$|[+-]\d{2}:?\d{2}$/.test(raw);
  const iso = raw.includes('T') ? raw : raw.replace(' ', 'T');
  const d = new Date(hasTz ? iso : iso + 'Z');
  if (Number.isNaN(d.getTime())) return raw.slice(0, 10);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export type SpanKind = 'start' | 'ongoing' | 'overdue' | 'range';

export interface SpanInfo {
  kind: SpanKind;
  /** 行内展示的短语 */
  label: string;
  total: number;
  /** 第几天（含首日，从 1 开始；超期时等于 total） */
  dayIndex: number;
}

/** 计划终点：有跨天就用 end_date，否则就是 date 本身 */
export function deadlineOf(e: { date: string; end_date?: string | null }): string {
  return endOf(e) || e.date;
}

/** 这一天是否落在它的工期内（单日任务 = 只有自己那天） */
export function coversDay(e: { date: string; end_date?: string | null }, day: string): boolean {
  return e.date <= day && day <= deadlineOf(e);
}

/** 工期是否与 [from, to] 有交集 —— 看板「本周」用它 */
export function overlaps(
  e: { date: string; end_date?: string | null },
  from: string,
  to: string
): boolean {
  return e.date <= to && deadlineOf(e) >= from;
}

/**
 * view: 正在看的那一天（YYYY-MM-DD）
 * 返回 null = 这条不是跨天任务、也没过期，行内不必额外标注
 */
export function spanInfo(
  e: { date: string; end_date?: string | null; completed?: boolean },
  view: string
): SpanInfo | null {
  const end = endOf(e);

  // 单日任务：只有「已经过了那天还没做完」才需要说话（逾期列表里用）
  if (!end) {
    if (e.completed || view <= e.date) return null;
    return {
      kind: 'overdue',
      label: `原定 ${md(e.date)} · 超期 ${diffDays(e.date, view)} 天`,
      total: 1,
      dayIndex: 1,
    };
  }

  const total = diffDays(e.date, end) + 1;

  // 已完成：只报「原本的区间」，不必再强调第几天
  if (e.completed) {
    return { kind: 'range', label: `${md(e.date)}–${md(end)}`, total, dayIndex: total };
  }

  // 已过计划终点还没完成 —— 仍然每天出现，但把「超期」明说出来
  if (view > end) {
    return {
      kind: 'overdue',
      label: `止 ${md(end)} · 超期 ${diffDays(end, view)} 天`,
      total,
      dayIndex: total,
    };
  }

  const dayIndex = Math.min(total, Math.max(1, diffDays(e.date, view) + 1));

  // 起点那天：告诉人这条不是一天就完的
  if (view === e.date) {
    return { kind: 'start', label: `至 ${md(end)} · 共 ${total} 天`, total, dayIndex };
  }

  return { kind: 'ongoing', label: `第 ${dayIndex}/${total} 天`, total, dayIndex };
}
