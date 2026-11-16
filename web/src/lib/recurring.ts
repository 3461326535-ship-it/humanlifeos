import type { TodoEvent } from './types';

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

/**
 * 周期节律的人话：每周五 / 每月 20 日 / 每天。
 *
 * 行内必须报出来 —— 否则「写周报」和一次性任务长得一模一样，
 * 用户点「完成」时根本不知道自己动的是「这一期」还是「整条规则」。
 * daily / weekly 是枚举不是 rrule：旧数据（迁移前）也只有这个字段。
 */
export function cadenceLabel(recurrence: string | null | undefined, date: string): string {
  if (!recurrence) return '';
  const d = new Date(date + 'T00:00:00');
  switch (recurrence) {
    case 'daily':
      return '每天';
    case 'weekly':
      return `每${WEEKDAYS[d.getDay()]}`;
    case 'monthly':
      return `每月 ${d.getDate()} 日`;
    case 'yearly':
      return `每年 ${d.getMonth() + 1}/${d.getDate()}`;
    default:
      return '';
  }
}

const RRULE_WEEKDAY: Record<string, string> = {
  SU: '日', MO: '一', TU: '二', WE: '三', TH: '四', FR: '五', SA: '六',
};
const CN_NUM = ['', '一', '两', '三', '四', '五', '六', '七', '八', '九', '十'];
const cnNum = (n: number) => (n >= 1 && n <= 10 ? CN_NUM[n] : String(n));

/** RRULE 字符串 → 键值对（只解析，不校验；校验在后端） */
export function parseRRuleLite(rrule?: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  (rrule || '').split(';').forEach((seg) => {
    const i = seg.indexOf('=');
    if (i > 0) out[seg.slice(0, i).toUpperCase()] = seg.slice(i + 1).toUpperCase();
  });
  return out;
}

/**
 * 规则节律的人话：每周五 / 每两周的周日 / 每月 20 日 / 每年 3/5。
 *
 * 和 cadenceLabel 的分工：cadenceLabel 读 events.recurrence（旧枚举，只有
 * daily/weekly 这种粗粒度）；这个读规则的 RRULE，说得出「哪一天」「几周一回」。
 * fallbackDate 用来兜底「没有 BYDAY 时的那天」——规则只写了 FREQ=WEEKLY 时，
 * dtstart 那天就是它实际发生的那天。
 */
export function rruleLabel(rrule?: string | null, fallbackDate?: string): string {
  const p = parseRRuleLite(rrule);
  const freq = p.FREQ;
  const interval = Number(p.INTERVAL || 1);
  if (!freq) return '';
  const fallback = fallbackDate ? new Date(fallbackDate + 'T00:00:00') : null;

  if (freq === 'DAILY') {
    return interval === 1 ? '每天' : `每 ${interval} 天`;
  }

  if (freq === 'WEEKLY') {
    // WEEKDAYS 里带「周」字（周一），拼「每周X」时要去掉，否则成了「每周周一」
    const wd = p.BYDAY
      ? RRULE_WEEKDAY[p.BYDAY.split(',')[0]]
      : fallback
      ? WEEKDAYS[fallback.getDay()].slice(1)
      : '';
    if (interval === 1) return wd ? `每周${wd}` : '每周';
    return wd ? `每${cnNum(interval)}周的周${wd}` : `每${cnNum(interval)}周`;
  }

  if (freq === 'MONTHLY') {
    const raw = p.BYMONTHDAY;
    const day = raw === '-1' ? '月末' : raw ? `${Number(raw)} 日` : fallback ? `${fallback.getDate()} 日` : '';
    if (interval === 1) return day ? `每月 ${day}` : '每月';
    return day ? `每${cnNum(interval)}个月的 ${day}` : `每${cnNum(interval)}个月`;
  }

  if (freq === 'YEARLY') {
    const md = fallback ? `${fallback.getMonth() + 1}/${fallback.getDate()}` : '';
    return md ? `每年 ${md}` : '每年';
  }

  return '';
}

/**
 * 一条任务该怎么报节律。
 *
 * 实例行自己没有 recurrence（懒补时刻意不写，免得旧 catchUp 再生成），
 * 所以优先读后端随行带出的 rule_rrule —— 否则界面上只有一个光秃秃的 ↻，
 * 用户看不出「每周五」还是「每月 20 日」。
 */
export function cadenceOf(e: {
  recurrence?: string | null;
  date: string;
  rule_rrule?: string | null;
}): string {
  if (e.rule_rrule) return rruleLabel(e.rule_rrule, e.date);
  return cadenceLabel(e.recurrence, e.date);
}

/**
 * 周期任务「一条规则只露一次」。
 *
 * 后端为了让日历/甘特能看见未来排期，会把周期实例一次铺到 horizon
 * （monthly 铺 365 天、weekly 铺 180 天）。于是看板上「带乖乖洗澡」一次出现 14 张卡，
 * 从 9 月排到明年 —— 全是还没到期的占位，把真正该干的活淹了。
 *
 * 主流做法（Things 3 的 Upcoming / Todoist 的「下一次」）是：
 * **一条重复任务只显示下一次，做完才露出再下一次。**
 * 这里在视图层做折叠，不动数据 —— 数据仍要留着，否则日历看不出未来排期。
 *
 * @param events 已经按窗口/范围筛过的任务
 * @param today  YYYY-MM-DD（判断哪条算「下一次」）
 */
export interface RecurringCollapse {
  /** 该渲染的（每条规则最多 1 条未完成） */
  visible: TodoEvent[];
  /** 被折叠掉、没渲染的实例数 */
  collapsed: number;
  /** 规则 id → 已经错过的次数（连着几期没做，用来提示「这条该处理了」） */
  missed: Record<number, number>;
}

export function collapseRecurring(events: TodoEvent[], today: string): RecurringCollapse {
  const oneoff: TodoEvent[] = [];
  const byRule = new Map<number, TodoEvent[]>();

  for (const e of events) {
    if (!e.rule_id) {
      oneoff.push(e);
      continue;
    }
    const list = byRule.get(e.rule_id);
    if (list) list.push(e);
    else byRule.set(e.rule_id, [e]);
  }

  const picked: TodoEvent[] = [];
  const missed: Record<number, number> = {};
  let collapsed = 0;

  const due = (e: TodoEvent) => e.end_date || e.date;

  for (const [, list] of byRule) {
    // 已完成的历史实例照常保留 —— 「这半年周报写过几次」是有效信息
    const done = list.filter((e) => e.completed);
    picked.push(...done);

    const open = list.filter((e) => !e.completed);
    if (open.length === 0) continue;

    const upcoming = open
      .filter((e) => due(e) >= today)
      .sort((a, b) => due(a).localeCompare(due(b)));

    // 下一次优先取「今天及以后最近的一条」；
    // 如果全都过期了，就留最近错过的那条 —— 连着几期没做，这张卡要露出来让人处置
    const head = upcoming[0] ?? [...open].sort((a, b) => due(b).localeCompare(due(a)))[0];
    picked.push(head);

    const pastMissed = open.filter((e) => e !== head && due(e) < today).length;
    if (pastMissed > 0) missed[head.rule_id as number] = pastMissed;
    collapsed += open.length - 1;
  }

  return { visible: [...oneoff, ...picked], collapsed, missed };
}
