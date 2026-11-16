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
