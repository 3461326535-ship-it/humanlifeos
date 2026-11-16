import { useEffect, useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api } from '../lib/api';
import type {
  TodoEvent, EventInput, Subtask, Recurrence, Priority, TaskStatus,
  RuleChange, RuleChangePreview,
} from '../lib/types';
import { DEFAULT_CATEGORIES, STATUS_LABELS } from '../lib/types';
import { doneDate, doneStamp } from '../lib/spans';
import { cadenceOf, parseRRuleLite, rruleLabel } from '../lib/recurring';
import { rule } from '../lib/ruleActions';
import EventTimer from './EventTimer';

const RRULE_DAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
const WEEK_LABEL = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

/** RRULE 的 FREQ 反推成旧枚举（只用于把只读选择器显示对） */
function rruleFreq(rrule?: string | null): Recurrence | '' {
  const f = (parseRRuleLite(rrule).FREQ || '').toLowerCase();
  return f === 'daily' || f === 'weekly' || f === 'monthly' || f === 'yearly' ? f : '';
}

interface Draft {
  title: string;
  date: string;
  end_date: string;
  milestone: boolean;
  time: string;
  category: string;
  description: string;
  status: TaskStatus;
  priority: Priority | '';
  recurrence: Recurrence | '';
  recurrence_end_date: string;
  subtasks: { title: string; completed: boolean }[];
  /** 已完成的任务：完成于哪一天（可改，补记到实际做完的那天） */
  completed_date: string;
}

function toDraft(
  event: TodoEvent | null,
  defaultDate: string,
  defaultStatus: TaskStatus = 'todo',
  defaultRecurrence: Recurrence | '' = '',
  defaultEndDate = '',
  defaultMilestone = false,
  defaultTime = ''
): Draft {
  if (event) {
    const milestone = !!event.is_milestone;
    return {
      title: event.title,
      date: event.date,
      end_date: milestone ? '' : event.end_date && event.end_date > event.date ? event.end_date : '',
      milestone,
      time: event.time || '',
      category: event.category || '',
      description: event.description || '',
      status: event.status,
      priority: event.priority || '',
      // 实例行自己没有 recurrence（懒补时刻意不写），只读框会显示成「不重复」，
      // 等于在详情里说这条任务根本不重复 —— 从所属规则的 rrule 反推回来
      recurrence: event.recurrence || rruleFreq(event.rule_rrule),
      recurrence_end_date: event.recurrence_end_date || event.rule_until || '',
      subtasks: (event.subtasks || []).map((s) => ({ title: s.title, completed: s.completed })),
      completed_date: event.completed ? doneDate(event) : '',
    };
  }
  return {
    title: '',
    date: defaultDate,
    end_date: defaultMilestone ? '' : defaultEndDate,
    milestone: defaultMilestone,
    time: defaultTime,
    category: '',
    description: '',
    status: defaultStatus,
    priority: '',
    recurrence: defaultRecurrence,
    recurrence_end_date: '',
    subtasks: [],
    completed_date: '',
  };
}

function toInput(d: Draft): EventInput {
  return {
    title: d.title.trim(),
    date: d.date,
    // 甘特：跨天任务才有结束日；里程碑/未填/单日 → null
    end_date: !d.milestone && d.end_date && d.end_date > d.date ? d.end_date : null,
    is_milestone: d.milestone ? 1 : 0,
    time: d.time || '',
    category: d.category || '其他',
    description: d.description,
    status: d.status,
    subtasks: d.subtasks.filter((s) => s.title.trim()),
    recurrence: d.recurrence || null,
    recurrence_end_date: d.recurrence ? d.recurrence_end_date || null : null,
    priority: d.priority || null,
  };
}

/**
 * 改规则面板：把「只读的节律选择器」换成一次显式的、说清后果的动作。
 *
 * 为什么不做成「直接放开那个重复下拉框」：
 *   下拉框改的是一期任务的字段，而改节律动的是整条规则和未来所有排期
 *   —— 一个控件两种后果，正是上一轮被指出的那个毛病。
 *
 * 背后不是「删了重来」：后端按新节奏重排明天之后的实例，今天及以前不动、
 * 已完成的保留，统计口径不会断。
 */
function RuleChangePanel({
  event,
  onSaved,
}: {
  event: TodoEvent;
  onSaved: () => void;
}) {
  const ruleId = event.rule_id as number;
  // 用规则自己的 rrule 回填，而不是实例的日期猜 —— 猜出来的默认值最容易「点确认就改了」
  const seed = useMemo(() => {
    const p = parseRRuleLite(event.rule_rrule);
    const anchor = new Date((event.occurrence_date || event.date) + 'T00:00:00');
    const freq = (p.FREQ || 'WEEKLY').toLowerCase() as Recurrence;
    const byday = RRULE_DAYS.indexOf(p.BYDAY || '');
    return {
      recurrence: (['daily', 'weekly', 'monthly', 'yearly'].includes(freq) ? freq : 'weekly') as Recurrence,
      interval: Math.max(1, Number(p.INTERVAL || 1)),
      weekday: byday >= 0 ? byday : anchor.getDay(),
      monthday: p.BYMONTHDAY ? Number(p.BYMONTHDAY) : anchor.getDate(),
    };
  }, [event.rule_rrule, event.occurrence_date, event.date]);

  const [recurrence, setRecurrence] = useState<Recurrence>(seed.recurrence);
  const [interval, setInterval] = useState(seed.interval);
  const [weekday, setWeekday] = useState(seed.weekday);
  const [monthday, setMonthday] = useState(seed.monthday);
  const [until, setUntil] = useState(event.rule_until || '');
  const [preview, setPreview] = useState<RuleChangePreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const patch: RuleChange = {
    recurrence,
    interval,
    until_date: until || null,
    ...(recurrence === 'weekly' ? { weekday } : {}),
    ...(recurrence === 'monthly' ? { monthday } : {}),
  };

  // 每次改选项都先问后端「会怎样」：收走几期、下一期哪天。
  // 让人在按下去之前就知道后果，而不是按完再去日历上找少没少。
  useEffect(() => {
    let alive = true;
    setErr('');
    rule
      .preview(ruleId, patch)
      .then((p) => { if (alive) setPreview(p); })
      .catch((e: Error) => { if (alive) { setPreview(null); setErr(e.message); } });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ruleId, recurrence, interval, weekday, monthday, until]);

  const label = preview ? rruleLabel(preview.rrule, event.date) : rruleLabel(
    recurrence === 'daily' ? 'FREQ=DAILY' : recurrence === 'weekly' ? `FREQ=WEEKLY;BYDAY=${RRULE_DAYS[weekday]}` : recurrence === 'monthly' ? `FREQ=MONTHLY;BYMONTHDAY=${monthday}` : 'FREQ=YEARLY',
    event.date
  );

  async function submit() {
    setBusy(true);
    setErr('');
    try {
      await rule.change(ruleId, patch);
      onSaved();
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="mt-2.5 space-y-2.5 rounded-lg border border-coral/25 bg-white/70 p-2.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-[11.5px] text-ink-soft">频率</span>
        {(['daily', 'weekly', 'monthly', 'yearly'] as Recurrence[]).map((r) => (
          <button
            key={r}
            type="button"
            className={`rounded-full px-2 py-0.5 text-[11.5px] ring-1 transition-colors ${
              recurrence === r ? 'bg-moss text-white ring-moss' : 'text-ink-mid ring-line hover:bg-paper-deep'
            }`}
            onClick={() => { setRecurrence(r); setInterval(1); }}
          >
            {{ daily: '每天', weekly: '每周', monthly: '每月', yearly: '每年' }[r]}
          </button>
        ))}
      </div>

      {/* 周几 / 几号 —— 「周报改双周、洗澡从周五改周日」就是改这一行 */}
      {recurrence === 'weekly' && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-[11.5px] text-ink-soft">星期</span>
          {WEEK_LABEL.map((w, i) => (
            <button
              key={w}
              type="button"
              className={`h-6 min-w-[26px] rounded-full px-1.5 text-[11.5px] ring-1 transition-colors ${
                weekday === i ? 'bg-moss text-white ring-moss' : 'text-ink-mid ring-line hover:bg-paper-deep'
              }`}
              onClick={() => setWeekday(i)}
            >
              {w.slice(1)}
            </button>
          ))}
        </div>
      )}

      {recurrence === 'monthly' && (
        <div className="flex items-center gap-2">
          <span className="text-[11.5px] text-ink-soft">日期</span>
          <input
            type="number"
            min={1}
            max={31}
            className="w-16 rounded-md border border-line bg-white px-1.5 py-0.5 text-[11.5px] text-ink outline-none focus:border-moss/40"
            value={monthday === -1 ? '' : monthday}
            onChange={(e) => setMonthday(Math.min(31, Math.max(1, Number(e.target.value) || 1)))}
            aria-label="每月几号"
          />
          <button
            type="button"
            className={`rounded-full px-2 py-0.5 text-[11.5px] ring-1 transition-colors ${
              monthday === -1 ? 'bg-moss text-white ring-moss' : 'text-ink-mid ring-line hover:bg-paper-deep'
            }`}
            onClick={() => setMonthday(-1)}
          >
            月末
          </button>
        </div>
      )}

      {(recurrence === 'weekly' || recurrence === 'monthly') && (
        <div className="flex items-center gap-2">
          <span className="text-[11.5px] text-ink-soft">间隔</span>
          <select
            className="rounded-md border border-line bg-white px-1.5 py-0.5 text-[11.5px] text-ink-mid outline-none focus:border-moss/40"
            value={interval}
            onChange={(e) => setInterval(Number(e.target.value))}
            aria-label="间隔"
          >
            {[1, 2, 3, 4, 6, 12].map((n) => (
              <option key={n} value={n}>
                {recurrence === 'weekly'
                  ? n === 1 ? '每周' : `每${n === 2 ? '两' : n}周`
                  : n === 1 ? '每月' : n === 3 ? '每季度' : `每${n === 2 ? '两' : n}个月`}
              </option>
            ))}
          </select>
          <span className="text-[11.5px] text-ink-soft">重复截止</span>
          <input
            type="date"
            className="rounded-md border border-line bg-white px-1.5 py-0.5 text-[11.5px] text-ink-mid outline-none focus:border-moss/40"
            value={until}
            onChange={(e) => setUntil(e.target.value)}
            aria-label="重复截止"
          />
        </div>
      )}

      {/* 后果先说清：改的是明天之后，历史不动 */}
      <p className="text-[11.5px] leading-relaxed text-ink-soft">
        明天起改按 <span className="font-medium text-ink">{label}</span>
        {preview?.next_dates?.length ? `（下一期 ${preview.next_dates[0].slice(5).replace('-', '/')}）` : ''}
        {preview && preview.will_close > 0 ? `，收走 ${preview.will_close} 期旧的未完成排期` : '，没有已铺出去的旧排期要收'}
        。今天及以前、已完成的都不动。
      </p>
      {preview?.next_dates?.length ? (
        <p className="text-[11px] text-ink-faint">
          接下来：{preview.next_dates.map((d) => d.slice(5).replace('-', '/')).join(' · ')}
        </p>
      ) : null}
      {err && <p className="text-[11.5px] text-coral">{err}</p>}

      <div className="flex items-center gap-1.5">
        <button
          type="button"
          className="rounded-md bg-coral px-2.5 py-1 text-[11.5px] text-white transition-opacity hover:opacity-90 disabled:opacity-40"
          disabled={busy || !preview?.cadence_changed}
          onClick={submit}
          title={preview && !preview.cadence_changed ? '节律没变' : '按新节奏重排明天之后的排期'}
        >
          {busy ? '正在重排…' : `改成「${label}」`}
        </button>
        <span className="text-[11px] text-ink-faint">历史统计不受影响，规则还是同一条</span>
      </div>
    </div>
  );
}

export default function EventDialog({
  event,
  defaultDate,
  defaultStatus,
  defaultRecurrence = '',
  defaultEndDate = '',
  defaultMilestone = false,
  defaultTime = '',
  openRulePanel = false,
  onClose,
  onSaved,
}: {
  event: TodoEvent | null;
  defaultDate: string;
  defaultStatus?: TaskStatus;
  defaultRecurrence?: Recurrence | '';
  defaultEndDate?: string;
  defaultMilestone?: boolean;
  /** 新建时的默认时间 HH:MM（日历「实际」视图双击空白补记用） */
  defaultTime?: string;
  /**
   * 一打开就展开「改规则」面板。
   * 回顾页的「改节奏」需要——那儿的人已经决定要改频率了，
   * 再让他进来点一次「改规则…」等于把同一个问题问两遍。
   */
  openRulePanel?: boolean;
  onClose: () => void;
  /** 保存成功回调；新建时带回刚创建的任务，编辑时为 undefined */
  onSaved?: (created?: TodoEvent) => void;
}) {
  const [draft, setDraft] = useState<Draft>(() =>
    toDraft(event, defaultDate, defaultStatus, defaultRecurrence, defaultEndDate, defaultMilestone, defaultTime)
  );
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [rulePanel, setRulePanel] = useState(openRulePanel);
  const [error, setError] = useState('');
  const isEdit = !!event;
  // 这条是某条周期规则的一期（不是规则本身）
  const isRuleInstance = isEdit && !!event!.rule_id;
  const cadence = event ? cadenceOf(event) : '';

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload: EventInput = toInput(draft);
      // 周期实例：节律属于整条规则，回写实例行只会造出「一条自认为在重复的实例」。
      // 界面上那个只读框是为了显示正确，不是用来编辑的
      if (isRuleInstance) {
        payload.recurrence = null;
        payload.recurrence_end_date = null;
      }
      // 完成日期被改过才传 —— 不传的时候后端保留原来的时间戳（编辑不该刷新完成日）
      if (isEdit && event!.completed && draft.completed_date && draft.completed_date !== doneDate(event!)) {
        payload.completed_at = doneStamp(draft.completed_date);
      }
      return isEdit ? api.updateEvent(event!.id, payload) : api.createEvent(payload);
    },
    onSuccess: (data) => onSaved?.(isEdit ? undefined : (data as TodoEvent)),
    onError: (e: Error) => setError(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (chain: boolean) => api.deleteEvent(event!.id, chain),
    onSuccess: () => onSaved?.(),
    onError: (e: Error) => setError(e.message),
  });

  // 「不做」是终态，不是删除：数据留着，统计里算一次取消，随时能恢复
  const cancelMutation = useMutation({
    mutationFn: (next: boolean) => api.cancelEvent(event!.id, next),
    onSuccess: () => onSaved?.(),
    onError: (e: Error) => setError(e.message),
  });

  // 停掉整条周期：明天起不再生成，未来没做的实例一起归档（已在做的和做完的保留）
  const stopRuleMutation = useMutation({
    mutationFn: () => api.stopRecurringRule(event!.rule_id as number),
    onSuccess: () => onSaved?.(),
    onError: (e: Error) => setError(e.message),
  });
  const onStopRule = () => {
    const ok = window.confirm(
      `停掉「${event!.title}」这条周期？\n\n明天起不再生成新的，已经铺到日历上的未来几期会一起收走；` +
        `已经做完的保留，今天及以前的不受影响。`
    );
    if (ok) stopRuleMutation.mutate();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.title.trim()) return setError('标题不能为空');
    if (!draft.date) return setError('日期不能为空');
    setError('');
    saveMutation.mutate();
  };

  const setSubtask = (i: number, patch: Partial<{ title: string; completed: boolean }>) =>
    setDraft((d) => ({
      ...d,
      subtasks: d.subtasks.map((s, j) => (j === i ? { ...s, ...patch } : s)),
    }));

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-ink/25 p-4 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={isEdit ? '编辑任务' : '新任务'}
        className="max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-line/60 bg-white p-6 shadow-pop"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-base font-semibold text-ink">
            {isEdit ? (draft.milestone ? '编辑里程碑' : '编辑任务') : draft.milestone ? '新建里程碑' : '新任务'}
          </h2>
          <button className="btn-ghost -mr-2" onClick={onClose} aria-label="关闭">✕</button>
        </div>

        <form className="space-y-4" onSubmit={handleSubmit}>
          {/* 标题 */}
          <div>
            <label className="label" htmlFor="ev-title">标题 *</label>
            <input
              id="ev-title"
              className="input"
              value={draft.title}
              onChange={(e) => set('title', e.target.value)}
              placeholder="要做什么？"
              autoFocus
            />
          </div>

          {/* 日期 / 结束日期（甘特：跨天任务填结束日；里程碑只有一个达成日） */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="ev-date">{draft.milestone ? '达成日 *' : '开始日期 *'}</label>
              <input
                id="ev-date"
                type="date"
                className="input"
                value={draft.date}
                onChange={(e) => {
                  const v = e.target.value;
                  setDraft((d) => ({
                    ...d,
                    date: v,
                    end_date: d.end_date && d.end_date < v ? v : d.end_date,
                  }));
                }}
              />
            </div>
            <div>
              <label className="label" htmlFor="ev-end-date">结束日期（可选）</label>
              {draft.milestone ? (
                <div className="input flex items-center text-[12.5px] text-ink-faint">里程碑不占工期</div>
              ) : (
                <input
                  id="ev-end-date"
                  type="date"
                  className="input"
                  value={draft.end_date}
                  min={draft.date}
                  onChange={(e) => set('end_date', e.target.value)}
                />
              )}
            </div>
          </div>

          <label className="flex cursor-pointer select-none items-center gap-2 text-[12.5px] text-ink-mid">
            <input
              type="checkbox"
              className="h-3.5 w-3.5 accent-[#2F6B4F]"
              checked={draft.milestone}
              onChange={(e) => {
                const v = e.target.checked;
                setDraft((d) => ({ ...d, milestone: v, end_date: v ? '' : d.end_date }));
              }}
            />
            <span className="flex items-center gap-1.5">
              <span className="text-moss-deep">◆</span>
              里程碑 —— 只有一个达成日，不占工期
            </span>
          </label>

          {/* 时间 / 分类 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="ev-time">时间（可选）</label>
              <input
                id="ev-time"
                type="time"
                className="input"
                value={draft.time}
                onChange={(e) => set('time', e.target.value)}
              />
            </div>
            <div>
              <label className="label" htmlFor="ev-category">分类</label>
              <input
                id="ev-category"
                className="input"
                list="category-list"
                value={draft.category}
                onChange={(e) => set('category', e.target.value)}
                placeholder="其他"
              />
              <datalist id="category-list">
                {DEFAULT_CATEGORIES.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>
          </div>

          {/* 状态 / 优先级 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="ev-status">状态</label>
              <select
                id="ev-status"
                className="input"
                value={draft.status}
                onChange={(e) => set('status', e.target.value as TaskStatus)}
              >
                {(['todo', 'in_progress', 'review', 'done'] as TaskStatus[]).map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="ev-priority">优先级</label>
              <select
                id="ev-priority"
                className="input"
                value={draft.priority}
                onChange={(e) => set('priority', e.target.value as Priority | '')}
              >
                <option value="">无</option>
                <option value="low">低</option>
                <option value="medium">中</option>
                <option value="high">高</option>
              </select>
            </div>
          </div>

          {/* 重复 / 重复截止 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="ev-recurrence">重复</label>
              <select
                id="ev-recurrence"
                className="input disabled:bg-paper-deep/60 disabled:text-ink-soft"
                value={draft.recurrence}
                disabled={isRuleInstance}
                title={isRuleInstance ? '周期任务的节律属于整条规则，不能按某一期单独改' : undefined}
                onChange={(e) => set('recurrence', e.target.value as Recurrence | '')}
              >
                <option value="">不重复</option>
                <option value="daily">每天</option>
                <option value="weekly">每周</option>
                <option value="monthly">每月</option>
                <option value="yearly">每年</option>
              </select>
            </div>
            {draft.recurrence ? (
              <div>
                <label className="label" htmlFor="ev-rec-end">重复截止（可选）</label>
                <input
                  id="ev-rec-end"
                  type="date"
                  className="input"
                  value={draft.recurrence_end_date}
                  onChange={(e) => set('recurrence_end_date', e.target.value)}
                />
              </div>
            ) : (
              <div />
            )}
          </div>

          {/* 周期实例：说清「这一期」和「整条规则」的区别，并把改/停规则放在这里 */}
          {isRuleInstance && (
            <div className="rounded-lg bg-paper-deep/45 px-3 py-2.5 ring-1 ring-line/60">
              <p className="text-[12px] leading-relaxed text-ink-mid">
                这是周期任务的<span className="font-medium text-ink">其中一期</span>
                {cadence ? `（${cadence}）` : ''}。勾完成、点不做，都只作用于这一期，规则照旧往下走。
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
                <button
                  type="button"
                  className={`rounded-md px-2 py-1 text-[11.5px] ring-1 transition-colors disabled:opacity-40 ${
                    rulePanel
                      ? 'bg-coral-soft text-coral ring-coral/40'
                      : 'text-coral ring-coral/25 hover:bg-coral-soft'
                  }`}
                  onClick={() => setRulePanel((v) => !v)}
                  title="改整条规则的节奏：周报改双周、洗澡从周五改周日"
                >
                  {rulePanel ? '收起' : '改规则…'}
                </button>
                <button
                  type="button"
                  className="rounded-md px-2 py-1 text-[11.5px] text-coral ring-1 ring-coral/25 transition-colors hover:bg-coral-soft disabled:opacity-40"
                  onClick={onStopRule}
                  disabled={stopRuleMutation.isPending}
                >
                  {stopRuleMutation.isPending ? '正在停…' : '停掉整条周期'}
                </button>
                <span className="text-[11px] text-ink-faint">
                  这两个动的是整条规则，明天起生效；已完成的不受影响
                </span>
              </div>
              {rulePanel && <RuleChangePanel event={event!} onSaved={() => onSaved?.()} />}
            </div>
          )}

          {/* 已完成的任务：完成日期可改（补记到实际做完的那天） */}
          {isEdit && event!.completed && (
            <div>
              <label className="label" htmlFor="ev-done-date">完成于</label>
              <input
                id="ev-done-date"
                type="date"
                className="input"
                value={draft.completed_date}
                max={new Date().toISOString().slice(0, 10)}
                onChange={(e) => set('completed_date', e.target.value)}
              />
              <p className="mt-1 text-[11px] text-ink-faint">
                改这里不会影响任务本身，只把这次完成记到那一天（补记旧账用，免得算进今天的完成数）
              </p>
            </div>
          )}

          {/* 备注 */}
          <div>
            <label className="label" htmlFor="ev-desc">备注</label>
            <textarea
              id="ev-desc"
              className="input min-h-[72px] resize-y"
              value={draft.description}
              onChange={(e) => set('description', e.target.value)}
              placeholder="补充说明…"
            />
          </div>

          {/* 子任务 */}
          <div>
            <label className="label">子任务</label>
            <ul className="space-y-1.5">
              {draft.subtasks.map((st, i) => (
                <li key={i} className="flex items-center gap-2">
                  <button
                    type="button"
                    className={`flex h-4 w-4 flex-none items-center justify-center rounded-[4px] border ${
                      st.completed ? 'border-moss bg-moss text-white' : 'border-ink-faint'
                    }`}
                    onClick={() => setSubtask(i, { completed: !st.completed })}
                    aria-label="切换子任务完成"
                  >
                    {st.completed && <span className="text-[9px]">✓</span>}
                  </button>
                  <input
                    className="input flex-1 py-1.5"
                    value={st.title}
                    onChange={(e) => setSubtask(i, { title: e.target.value })}
                  />
                  <button
                    type="button"
                    className="btn-ghost px-2 py-1 text-ink-faint hover:text-ink-soft"
                    onClick={() => set('subtasks', draft.subtasks.filter((_, j) => j !== i))}
                    aria-label="删除子任务"
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
            <button
              type="button"
              className="btn-ghost mt-1 text-xs"
              onClick={() => set('subtasks', [...draft.subtasks, { title: '', completed: false }])}
            >
              + 添加子任务
            </button>
          </div>

          {isEdit && <EventTimer eventId={event!.id} />}

          {error && <p className="rounded-lg bg-coral-soft px-3 py-2 text-sm text-coral">{error}</p>}

          {/* 操作区 */}
          <div className="-mx-6 flex items-center gap-2 border-t border-line-soft px-6 pt-4">
            {isEdit && (
              <div className="flex-none">
                {confirmDelete ? (
                  <div className="flex items-center gap-1">
                    {/* 「删除此后所有」只对旧链式周期任务有意义：v0.4 的实例是按规则懒补的，
                        按标题批量删会把同名任务一起卷进去。想停规则请用上面的「停掉整条周期」。 */}
                    {event.recurrence && !event.rule_id ? (
                      <button
                        type="button"
                        className="btn-danger text-xs"
                        onClick={() => deleteMutation.mutate(true)}
                      >
                        删除此后所有
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="btn-danger text-xs"
                      onClick={() => deleteMutation.mutate(false)}
                    >
                      确认删除
                    </button>
                    <button type="button" className="btn-ghost text-xs" onClick={() => setConfirmDelete(false)}>
                      取消
                    </button>
                  </div>
                ) : (
                  <button type="button" className="btn-danger" onClick={() => setConfirmDelete(true)}>
                    删除
                  </button>
                )}
              </div>
            )}

            {/* 介于「留着」和「删掉」之间的那个决定 —— 大部分陈旧任务其实该走这里 */}
            {isEdit && (
              <button
                type="button"
                className="btn-ghost text-xs text-ink-soft"
                onClick={() => cancelMutation.mutate(!event!.canceled_at)}
                disabled={cancelMutation.isPending}
                title={
                  event!.canceled_at
                    ? '重新放回待办'
                    : isRuleInstance
                      ? '这一期不做了，规则照旧（下次照常出现）；想彻底停掉用上面的「停掉整条周期」'
                      : '决定不做了：离开待办但不删除，统计里算一次「取消」，随时可恢复'
                }
              >
                {event!.canceled_at ? '恢复' : isRuleInstance ? '跳过这一期' : '不做'}
              </button>
            )}
            <div className="ml-auto flex gap-2">
              <button type="button" className="btn-ghost" onClick={onClose}>
                取消
              </button>
              <button type="submit" className="btn-primary" disabled={saveMutation.isPending}>
                {saveMutation.isPending ? '保存中…' : '保存'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
