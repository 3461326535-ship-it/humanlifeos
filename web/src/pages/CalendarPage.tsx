import { useEffect, useMemo, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { TodoEvent, TaskStatus, HabitOccurrence, HabitStatus } from '../lib/types';
import EventDialog from '../components/EventDialog';
import { dayStr, spanWindow, useActualLoad, type ActualSegment, type ActualHabitSpan } from '../lib/actual';
import { fmtMinutes } from '../lib/timer';

const WEEK_LABELS = ['一', '二', '三', '四', '五', '六', '日'];

// 周视图的时间刻度
const DAY_START = 8; // 08:00
const DAY_END = 21; // 21:00
const HOUR_H = 44;
const TOTAL_H = (DAY_END - DAY_START) * HOUR_H;

const STATUS_BLOCK: Record<TaskStatus, string> = {
  todo: 'border-l-[#9FB3C8] bg-[#E3E9F1] text-[#2B3B4E]',
  in_progress: 'border-l-clay bg-clay-soft text-[#6B4A12]',
  review: 'border-l-lagoon bg-lagoon-soft text-[#26405F]',
  done: 'border-l-moss bg-moss-soft text-[#22493A]',
};

// 「实际」视图：真发生的任务用高饱和实心块
const ACTUAL_BLOCK: Record<TaskStatus, string> = {
  todo: 'bg-[#8FA0B5] text-white',
  in_progress: 'bg-clay text-white',
  review: 'bg-lagoon text-white',
  done: 'bg-moss-deep text-white',
};

// 习惯不抢注意力：低饱和斜线底纹 + 左侧细色带，表示「这段时间被占」
const HABIT_HATCH = {
  backgroundImage:
    'repeating-linear-gradient(45deg, rgba(47,107,79,0.20) 0 5px, rgba(47,107,79,0.04) 5px 10px)',
};
// 多任务并行：斑马纹，强调「这里叠了两件以上」，不横向分栏
const ZEBRA_HATCH = {
  backgroundImage:
    'repeating-linear-gradient(45deg, rgba(47,107,79,0.9) 0 7px, rgba(201,139,46,0.9) 7px 14px)',
};

const pad2 = (n: number) => String(n).padStart(2, '0');

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
function fmt(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
function startOfWeek(d: Date) {
  const x = new Date(d);
  const day = x.getDay();
  x.setDate(x.getDate() + (day === 0 ? -6 : 1 - day));
  x.setHours(0, 0, 0, 0);
  return x;
}
function monthCells(y: number, m0: number): Date[] {
  const first = new Date(y, m0, 1);
  const startOffset = first.getDay() === 0 ? 6 : first.getDay() - 1;
  const start = new Date(y, m0, 1 - startOffset);
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

/** 事件在周视图里的起止（没有具体时间的返回 null，走顶部「全天」条） */
function eventSpan(e: TodoEvent) {
  const start = e.time || (e.start_time ? e.start_time.slice(11, 16) : '');
  if (!start || !start.includes(':')) return null;
  const [h, m] = start.split(':').map(Number);
  const startMin = h * 60 + m;
  let endMin = startMin + 60;
  const endSrc = e.end_time ? e.end_time.slice(11, 16) : '';
  if (endSrc && endSrc.includes(':')) {
    const [eh, em] = endSrc.split(':').map(Number);
    endMin = Math.max(startMin + 20, eh * 60 + em);
  }
  return { startMin, endMin, start };
}

/** 习惯块：只按 start_time 占位，没有时长就按 45 分钟画（和实际层的默认占用一致） */
const HABIT_MIN_LEN = 45;
function habitSpan(o: HabitOccurrence) {
  const t = o.time || '';
  if (!t.includes(':')) return null;
  const [h, m] = t.split(':').map(Number);
  const startMin = h * 60 + m;
  return { startMin, endMin: startMin + HABIT_MIN_LEN, start: t };
}

// ───────────────────────── 实际视图的数据整理 ─────────────────────────

type Rang = { s: number; e: number };

type ActualBlock = {
  key: string;
  event_id: number;
  title: string;
  status: string;
  s: number;
  e: number;
  running: boolean;
  habit?: boolean;
};

const dayStartSec = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() / 1000;

/**
 * 按本地日切开区间：跨零点的计时段两边各画一半（23:00-24:00 归前一天，00:00-02:00 归后一天）。
 * 进行中的段末端延伸到「现在」，不超过当天 24:00。
 */
function splitByLocalDay<T extends Rang>(list: T[], nowSec: number, isRunning?: (x: T) => boolean): Map<string, T[]> {
  const out = new Map<string, T[]>();
  list.forEach((raw) => {
    const startDate = new Date(raw.s * 1000);
    let cursor = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
    let s = raw.s;
    let end = raw.e;
    if (isRunning && isRunning(raw)) {
      const dayEnd = dayStartSec(new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 1));
      end = Math.max(end, Math.min(nowSec, dayEnd));
    }
    while (s < end) {
      const next = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 1);
      const dayEnd = dayStartSec(next);
      const e = Math.min(end, dayEnd);
      if (e > s) {
        const ds = dayStr(cursor);
        const arr = out.get(ds) || [];
        arr.push({ ...raw, s, e });
        out.set(ds, arr);
      }
      s = e;
      cursor = next;
    }
  });
  return out;
}

type Slice = { s: number; e: number; blocks: ActualBlock[] };

/** 把一天的块切成「同一组任务同时进行」的连续切片；重叠时不再左右分栏 */
function buildSlices(blocks: ActualBlock[]): Slice[] {
  const marks = [...new Set(blocks.flatMap((b) => [b.s, b.e]))].sort((a, b) => a - b);
  const raw: Slice[] = [];
  for (let i = 0; i < marks.length - 1; i += 1) {
    const a = marks[i];
    const b = marks[i + 1];
    const active = blocks.filter((x) => x.s <= a && x.e >= b);
    if (active.length) raw.push({ s: a, e: b, blocks: active });
  }
  const merged: (Slice & { sig: string })[] = [];
  raw.forEach((sl) => {
    const sig = sl.blocks.map((x) => x.key).sort().join('|');
    const prev = merged[merged.length - 1];
    if (prev && prev.sig === sig && Math.abs(prev.e - sl.s) < 1) prev.e = sl.e;
    else merged.push({ ...sl, sig });
  });
  return merged;
}

const minOfDay = (sec: number) => {
  const d = new Date(sec * 1000);
  return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60;
};
const topOf = (sec: number) => ((minOfDay(sec) - DAY_START * 60) / 60) * HOUR_H;
const hhmm = (sec: number) => {
  const d = new Date(sec * 1000);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
};

type Tip = { x: number; y: number; rows: { title: string; when: string; min: number }[] };

export default function CalendarPage() {
  const [mode, setMode] = useState<'week' | 'month'>('week');
  const [layer, setLayer] = useState<'plan' | 'actual'>('plan');
  const [anchor, setAnchor] = useState(todayStr());
  const [monthView, setMonthView] = useState(() => {
    const n = new Date();
    return { y: n.getFullYear(), m: n.getMonth() };
  });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<TodoEvent | null>(null);
  const [defaultStatus, setDefaultStatus] = useState<TaskStatus>('todo');
  const [defaultDate, setDefaultDate] = useState(todayStr());
  const [defaultTime, setDefaultTime] = useState('');
  const [tip, setTip] = useState<Tip | null>(null);

  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['events'] });
    qc.invalidateQueries({ queryKey: ['actualLoad'] });
  };
  const { data: allEvents, isLoading } = useQuery({ queryKey: ['events'], queryFn: api.getEvents });

  const byDate = useMemo(() => {
    const map: Record<string, TodoEvent[]> = {};
    (allEvents || []).forEach((e) => {
      if (e.date) (map[e.date] ||= []).push(e);
    });
    return map;
  }, [allEvents]);

  const weekStart = useMemo(() => startOfWeek(new Date(anchor + 'T00:00:00')), [anchor]);
  const weekDays = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => {
        const d = new Date(weekStart);
        d.setDate(weekStart.getDate() + i);
        return d;
      }),
    [weekStart]
  );
  const weekEnd = weekDays[6];

  const tStr = todayStr();
  const cells = monthCells(monthView.y, monthView.m);

  // 习惯：周视图画成时间块，月视图只在日期角上标个数（不铺开，否则天天都有、糊成一片）
  const rangeFrom = mode === 'week' ? fmt(weekStart) : fmt(cells[0]);
  const rangeTo = mode === 'week' ? fmt(weekEnd) : fmt(cells[41]);
  const { data: habitOcc } = useQuery({
    queryKey: ['habitOccurrences', rangeFrom, rangeTo],
    queryFn: () => api.getHabitOccurrences(rangeFrom, rangeTo),
  });

  const habitsByDate = useMemo(() => {
    const map: Record<string, HabitOccurrence[]> = {};
    (habitOcc?.items || []).forEach((it) => {
      (map[it.date] ||= []).push(it);
    });
    return map;
  }, [habitOcc]);

  // ── 实际投入：任务计时 ∪ 已打卡习惯（后端按时间轴去重） ──
  const actualWindow = useMemo(() => spanWindow(rangeFrom, rangeTo), [rangeFrom, rangeTo]);
  const { data: actual } = useActualLoad(actualWindow, layer === 'actual');

  // 进行中的块每秒延长到「现在」
  const [, setTick] = useState(0);
  useEffect(() => {
    if (layer !== 'actual') return;
    const t = setInterval(() => setTick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, [layer]);
  const nowSec = Math.floor(Date.now() / 1000);

  const actualSegs: ActualSegment[] = useMemo(() => actual?.segments ?? [], [actual]);
  const actualHabitSpans: ActualHabitSpan[] = useMemo(() => actual?.habits ?? [], [actual]);

  // 任务段 → 按日切块
  const actualTaskByDay = useMemo(() => {
    const blocks = actualSegs.map((s) => ({
      key: `${s.id}`,
      event_id: s.event_id,
      title: s.title,
      status: s.status,
      running: s.running,
      s: s.start_ts,
      e: s.end_ts,
    }));
    return splitByLocalDay(blocks, nowSec, (b) => b.running);
  }, [actualSegs, nowSec]);

  // 习惯占用 → 按日切块（只含已打卡的）
  const actualHabitByDay = useMemo(() => {
    const spans = actualHabitSpans.map((h) => ({
      key: `h${h.habit_id}-${h.start_ts}`,
      habit_id: h.habit_id,
      title: h.title,
      s: h.start_ts,
      e: h.end_ts,
    }));
    return splitByLocalDay(spans, nowSec);
  }, [actualHabitSpans, nowSec]);

  // 每天的实际投入（任务 ∪ 习惯去重后）+ 真正执行过的任务
  const actualDayInfo = useMemo(() => {
    const map = new Map<string, { minutes: number; events: { id: number; title: string; status: string }[] }>();
    const days = new Set<string>([...actualTaskByDay.keys(), ...actualHabitByDay.keys()]);
    days.forEach((ds) => {
      const tasks: ActualBlock[] = (actualTaskByDay.get(ds) || []).map((b) => ({
        key: b.key,
        event_id: b.event_id,
        title: b.title,
        status: b.status,
        s: b.s,
        e: b.e,
        running: b.running,
      }));
      const habits: ActualBlock[] = (actualHabitByDay.get(ds) || []).map((h) => ({
        key: h.key,
        event_id: -h.habit_id,
        title: h.title,
        status: 'done',
        s: h.s,
        e: h.e,
        running: false,
        habit: true,
      }));
      const slices = buildSlices([...tasks, ...habits]);
      const minutes = slices.reduce((sum, sl) => sum + (sl.e - sl.s) / 60, 0);
      const seen = new Set<number>();
      const events: { id: number; title: string; status: string }[] = [];
      tasks.forEach((t) => {
        if (seen.has(t.event_id)) return;
        seen.add(t.event_id);
        events.push({ id: t.event_id, title: t.title, status: t.status });
      });
      map.set(ds, { minutes: Math.round(minutes), events });
    });
    return map;
  }, [actualTaskByDay, actualHabitByDay]);

  // 日历里点习惯块 = 打卡 / 再点撤销（和右栏习惯卡同一套规则）
  const habitToggle = useMutation({
    mutationFn: ({ habitId, date, clear }: { habitId: number; date: string; clear: boolean }) =>
      clear ? api.clearHabitOverride(habitId, date) : api.setHabitOverride(habitId, date, 'done'),
    onMutate: async ({ habitId, date, clear }) => {
      await qc.cancelQueries({ queryKey: ['habitOccurrences', rangeFrom, rangeTo] });
      const prev = qc.getQueryData<{ items: HabitOccurrence[] }>(['habitOccurrences', rangeFrom, rangeTo]);
      if (prev) {
        const fallback: HabitStatus = date < todayStr() ? 'skipped' : 'pending';
        qc.setQueryData(['habitOccurrences', rangeFrom, rangeTo], {
          ...prev,
          items: prev.items.map((it) =>
            it.habit_id === habitId && it.date === date
              ? { ...it, status: clear ? fallback : ('done' as HabitStatus) }
              : it
          ),
        });
      }
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(['habitOccurrences', rangeFrom, rangeTo], ctx.prev);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['habitOccurrences'] });
      qc.invalidateQueries({ queryKey: ['actualLoad'] });
    },
  });

  const openAdd = (date: string, status: TaskStatus = 'todo', time = '') => {
    setEditing(null);
    setDefaultStatus(status);
    setDefaultDate(date);
    setDefaultTime(time);
    setDialogOpen(true);
  };
  const openEdit = (e: TodoEvent) => {
    setEditing(e);
    setDefaultStatus(e.status);
    setDefaultDate(e.date);
    setDefaultTime('');
    setDialogOpen(true);
  };

  const shiftWeek = (n: number) => {
    const d = new Date(anchor + 'T00:00:00');
    d.setDate(d.getDate() + n * 7);
    setAnchor(fmt(d));
  };

  const now = new Date();
  const nowTop = ((now.getHours() * 60 + now.getMinutes() - DAY_START * 60) / 60) * HOUR_H;
  const showNow = nowTop >= 0 && nowTop <= TOTAL_H;

  // 标签只到 20:00（21:00 是网格下边界，标签会被裁掉）
  const hourLabels = Array.from({ length: DAY_END - DAY_START }, (_, i) => DAY_START + i);
  const hourLines = Array.from({ length: DAY_END - DAY_START + 1 }, (_, i) => DAY_START + i);

  /** 双击空白补记：实际视图按点击位置预填 15 分钟整点 */
  const dblClickCell = (ev: ReactMouseEvent<HTMLDivElement>, ds: string) => {
    if (layer !== 'actual') {
      openAdd(ds);
      return;
    }
    const rect = ev.currentTarget.getBoundingClientRect();
    const raw = DAY_START * 60 + Math.round(((ev.clientY - rect.top) / HOUR_H) * 60 / 15) * 15;
    const mins = Math.min(DAY_END * 60 - 15, Math.max(DAY_START * 60, raw));
    openAdd(ds, 'todo', `${pad2(Math.floor(mins / 60))}:${pad2(mins % 60)}`);
  };

  return (
    <div className="min-w-0">
      {/* 工具栏 */}
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1">
          <button
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-line text-[15px] text-ink-soft transition-colors hover:text-ink"
            onClick={() =>
              mode === 'week'
                ? shiftWeek(-1)
                : setMonthView((v) => ({ ...v, m: v.m - 1 < 0 ? 11 : v.m - 1, y: v.m - 1 < 0 ? v.y - 1 : v.y }))
            }
            aria-label="上一页"
          >
            ‹
          </button>
          <span className="min-w-[152px] text-center text-[13px] font-medium text-ink">
            {mode === 'week'
              ? `${weekStart.getMonth() + 1}月${weekStart.getDate()}日 – ${weekEnd.getMonth() + 1}月${weekEnd.getDate()}日`
              : `${monthView.y}年${monthView.m + 1}月`}
          </span>
          <button
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-line text-[15px] text-ink-soft transition-colors hover:text-ink"
            onClick={() =>
              mode === 'week'
                ? shiftWeek(1)
                : setMonthView((v) => ({ ...v, m: v.m + 1 > 11 ? 0 : v.m + 1, y: v.m + 1 > 11 ? v.y + 1 : v.y }))
            }
            aria-label="下一页"
          >
            ›
          </button>
        </div>

        <button
          className="text-[12px] text-ink-soft underline-offset-4 hover:text-moss hover:underline"
          onClick={() => {
            setAnchor(todayStr());
            const n = new Date();
            setMonthView({ y: n.getFullYear(), m: n.getMonth() });
          }}
        >
          回到今天
        </button>

        <div className="ml-auto flex items-center gap-2">
          <div className="seg" title="计划＝预期安排；实际＝真实发生（任务计时 + 已打卡习惯，重叠去重）">
            <button className={`seg-item ${layer === 'plan' ? 'seg-item-on' : ''}`} onClick={() => setLayer('plan')}>
              计划
            </button>
            <button className={`seg-item ${layer === 'actual' ? 'seg-item-on' : ''}`} onClick={() => setLayer('actual')}>
              实际
            </button>
          </div>
          <div className="seg">
            <button className={`seg-item ${mode === 'month' ? 'seg-item-on' : ''}`} onClick={() => setMode('month')}>
              月
            </button>
            <button className={`seg-item ${mode === 'week' ? 'seg-item-on' : ''}`} onClick={() => setMode('week')}>
              周
            </button>
          </div>
        </div>
      </div>

      {isLoading ? (
        <p className="py-24 text-center text-[13px] text-ink-soft">加载中…</p>
      ) : mode === 'week' ? (
        /* ── 周视图：时间网格 + 彩色块 ── */
        <div className="overflow-hidden rounded-xl border border-line bg-card">
          {/* 列头 */}
          <div className="grid grid-cols-[60px_repeat(7,minmax(0,1fr))] border-b border-line">
            <div />
            {weekDays.map((d, i) => {
              const ds = fmt(d);
              const isToday = ds === tStr;
              return (
                <div key={i} className={`border-l border-line/60 py-2 text-center ${isToday ? 'bg-moss-soft/30' : ''}`}>
                  <p className="text-[11px] text-ink-soft">{WEEK_LABELS[i]}</p>
                  <p
                    className={`mx-auto mt-1 flex h-6 w-6 items-center justify-center rounded-full text-[12.5px] font-medium tabular-nums ${
                      isToday ? 'bg-moss-deep text-white' : 'text-ink-mid'
                    }`}
                  >
                    {d.getDate()}
                  </p>
                </div>
              );
            })}
          </div>

          {/* 网格 */}
          <div className="grid grid-cols-[60px_repeat(7,minmax(0,1fr))]">
            {/* 时间轴 */}
            <div className="relative" style={{ height: TOTAL_H }}>
              {hourLabels.map((h, i) => (
                <div
                  key={h}
                  className="absolute right-2 -translate-y-1/2 text-[10.5px] tabular-nums text-ink-faint"
                  style={{ top: i * HOUR_H }}
                >
                  {String(h).padStart(2, '0')}:00
                </div>
              ))}
            </div>

            {weekDays.map((d, di) => {
              const ds = fmt(d);
              const isToday = ds === tStr;
              const dayList = byDate[ds] || [];
              const timed = dayList.filter((e) => eventSpan(e));
              const allDay = dayList.filter((e) => !eventSpan(e));
              // 同一格里任务和习惯时段撞上时左右分栏，谁也别盖住谁
              const habitSpans = (habitsByDate[ds] || [])
                .map((h) => ({ h, span: habitSpan(h) }))
                .filter((x): x is { h: HabitOccurrence; span: { startMin: number; endMin: number; start: string } } => !!x.span);
              const hitHabit = (a: { startMin: number; endMin: number }) =>
                habitSpans.some((x) => a.startMin < x.span.endMin && x.span.startMin < a.endMin);
              const hitTask = (b: { startMin: number; endMin: number }) =>
                timed.some((e) => {
                  const s = eventSpan(e);
                  return !!s && s.startMin < b.endMin && b.startMin < s.endMin;
                });

              // 实际层：任务块 → 切片；习惯 → 底纹带
              const dayBlocks: ActualBlock[] = (actualTaskByDay.get(ds) || []).map((b) => ({
                key: b.key,
                event_id: b.event_id,
                title: b.title,
                status: b.status,
                s: b.s,
                e: b.e,
                running: b.running,
              }));
              const slices = buildSlices(dayBlocks);
              const dayHabitSpans = actualHabitByDay.get(ds) || [];
              const dayMinutes = actualDayInfo.get(ds)?.minutes ?? 0;

              return (
                <div
                  key={di}
                  className={`relative border-l border-line/60 ${isToday ? 'bg-moss-soft/25' : ''}`}
                  style={{ height: TOTAL_H }}
                  onDoubleClick={(ev) => dblClickCell(ev, ds)}
                >
                  {/* 小时线 */}
                  {hourLines.map((h, i) => (
                    <div key={h} className="absolute inset-x-0 border-t border-line/40" style={{ top: i * HOUR_H }} />
                  ))}

                  {layer === 'plan' && (
                    <>
                      {/* 习惯：虚线带，压在任务块下面（背景层），只为标出「这段时间被占」 */}
                      {(habitsByDate[ds] || []).map((h) => {
                        const span = habitSpan(h);
                        if (!span) return null;
                        const top = ((span.startMin - DAY_START * 60) / 60) * HOUR_H;
                        if (top < 0 || top > TOTAL_H) return null;
                        const height = Math.max(20, ((span.endMin - span.startMin) / 60) * HOUR_H - 2);
                        const done = h.status === 'done';
                        const split = hitTask(span);
                        return (
                          <button
                            key={`habit-${h.habit_id}`}
                            onClick={(ev) => {
                              ev.stopPropagation();
                              habitToggle.mutate({ habitId: h.habit_id, date: ds, clear: done });
                            }}
                            className={`absolute z-[5] overflow-hidden rounded-md border border-dashed px-1.5 py-0.5 text-left transition-colors ${
                              done
                                ? 'border-moss/50 bg-moss-soft/70'
                                : 'border-moss/30 bg-moss-soft/30 hover:bg-moss-soft/50'
                            }`}
                            style={split ? { top, height, left: '56%', right: 8 } : { top, height, left: 8, right: 8 }}
                            title={`${h.title} · 习惯 ${span.start}${done ? ' · 已打卡（点击撤销）' : ' · 点击打卡'}`}
                          >
                            {split ? (
                              <>
                                <p className="truncate text-[10px] font-medium leading-[1.25] text-moss">↻ {h.title}</p>
                                <p className="truncate text-[9px] leading-[1.2] text-moss/70">{span.start}</p>
                              </>
                            ) : (
                              <p className="truncate text-[10.5px] font-medium leading-tight text-moss">
                                ↻ {h.title}
                                <span className="ml-1 font-normal text-moss/70">{span.start}</span>
                              </p>
                            )}
                            {done && (
                              <span className="pointer-events-none absolute right-1 top-0.5 text-[9px] leading-none text-moss">✓</span>
                            )}
                          </button>
                        );
                      })}

                      {/* 无具体时间的任务：贴顶 */}
                      {allDay.length > 0 && (
                        <div className="absolute inset-x-0.5 top-0.5 z-10 space-y-0.5">
                          {allDay.slice(0, 2).map((e) => (
                            <button
                              key={e.id}
                              onClick={(ev) => {
                                ev.stopPropagation();
                                openEdit(e);
                              }}
                              className={`block w-full truncate rounded border-l-2 px-1 py-0.5 text-left text-[10.5px] ${STATUS_BLOCK[e.status]}`}
                              title={e.title}
                            >
                              {e.title}
                            </button>
                          ))}
                        </div>
                      )}

                      {/* 没设时间的习惯：贴顶细条，排在无时间任务之后 */}
                      {(habitsByDate[ds] || []).filter((h) => !habitSpan(h)).length > 0 && (
                        <div
                          className="absolute inset-x-0.5 z-10 space-y-0.5"
                          style={{ top: 4 + Math.min(allDay.length, 2) * 18 }}
                        >
                          {(habitsByDate[ds] || [])
                            .filter((h) => !habitSpan(h))
                            .slice(0, 2)
                            .map((h) => (
                              <button
                                key={`habit-t-${h.habit_id}`}
                                onClick={(ev) => {
                                  ev.stopPropagation();
                                  habitToggle.mutate({
                                    habitId: h.habit_id,
                                    date: ds,
                                    clear: h.status === 'done',
                                  });
                                }}
                                className={`block w-full truncate rounded border border-dashed px-1 py-0.5 text-left text-[10px] ${
                                  h.status === 'done'
                                    ? 'border-moss/50 bg-moss-soft/70 text-moss'
                                    : 'border-moss/30 bg-moss-soft/30 text-moss/80'
                                }`}
                                title={`${h.title} · 习惯（未设时间）`}
                              >
                                ↻ {h.title}
                              </button>
                            ))}
                        </div>
                      )}

                      {/* 时间块 */}
                      {timed.map((e) => {
                        const span = eventSpan(e)!;
                        const top = ((span.startMin - DAY_START * 60) / 60) * HOUR_H;
                        if (top < 0 || top > TOTAL_H) return null;
                        const height = Math.max(22, ((span.endMin - span.startMin) / 60) * HOUR_H - 2);
                        const split = hitHabit(span);
                        return (
                          <button
                            key={e.id}
                            onClick={(ev) => {
                              ev.stopPropagation();
                              openEdit(e);
                            }}
                            className={`absolute left-1 z-10 overflow-hidden rounded-md border-l-[3px] px-1.5 py-1 text-left transition-shadow hover:shadow-card-hover ${STATUS_BLOCK[e.status]}`}
                            style={{ top, height, right: split ? '47%' : 4 }}
                            title={`${e.title} ${span.start}`}
                          >
                            <p className="truncate text-[11.5px] font-medium leading-tight">{e.title}</p>
                            <p className="mt-0.5 truncate text-[10px] opacity-80">{span.start}</p>
                          </button>
                        );
                      })}
                    </>
                  )}

                  {layer === 'actual' && (
                    <>
                      {/* 习惯占用：斜线底纹 + 左细色带，低饱和不抢戏 */}
                      {dayHabitSpans.map((h) => {
                        const top = Math.max(0, topOf(h.s));
                        const bottom = Math.min(TOTAL_H, topOf(h.e));
                        if (bottom <= 0 || top >= TOTAL_H) return null;
                        return (
                          <button
                            key={h.key}
                            onClick={(ev) => {
                              ev.stopPropagation();
                              habitToggle.mutate({ habitId: h.habit_id, date: ds, clear: true });
                            }}
                            onMouseMove={(ev) =>
                              setTip({
                                x: ev.clientX,
                                y: ev.clientY,
                                rows: [
                                  {
                                    title: `↻ ${h.title}（习惯占用）`,
                                    when: `${hhmm(h.s)}–${hhmm(h.e)}`,
                                    min: Math.round((h.e - h.s) / 60),
                                  },
                                ],
                              })
                            }
                            onMouseLeave={() => setTip(null)}
                            className="absolute inset-x-1 z-[3] overflow-hidden rounded-md border-l-2 border-moss/40 px-1.5 py-0.5 text-left"
                            style={{ top, height: Math.max(14, bottom - top - 1), ...HABIT_HATCH }}
                            title={`${h.title} · 习惯占用 ${hhmm(h.s)}–${hhmm(h.e)}`}
                          >
                            <span className="truncate text-[10px] font-medium leading-tight text-moss-deep/80">↻ {h.title}</span>
                          </button>
                        );
                      })}

                      {/* 任务实际执行：单任务实心；多任务并行 → 斑马纹 + 「N 个任务并行」 */}
                      {slices.map((sl) => {
                        const top = Math.max(0, topOf(sl.s));
                        const bottom = Math.min(TOTAL_H, topOf(sl.e));
                        if (bottom <= 0 || top >= TOTAL_H) return null;
                        const n = sl.blocks.length;
                        const live = sl.blocks.some((b) => b.running);
                        const primary = sl.blocks[0];
                        const rows = sl.blocks.map((b) => ({
                          title: b.title,
                          when: `${hhmm(b.s)}–${hhmm(b.e)}${b.running ? '（进行中）' : ''}`,
                          min: Math.round((b.e - b.s) / 60),
                        }));
                        return (
                          <button
                            key={`${sl.s}-${sl.blocks.map((b) => b.key).join('|')}`}
                            onClick={(ev) => {
                              ev.stopPropagation();
                              const evt = (allEvents || []).find((x) => x.id === primary.event_id);
                              if (evt) openEdit(evt);
                            }}
                            onMouseMove={(ev) => setTip({ x: ev.clientX, y: ev.clientY, rows })}
                            onMouseLeave={() => setTip(null)}
                            className={`absolute inset-x-1 z-10 overflow-hidden rounded-md px-1.5 py-1 text-left shadow-sm ${
                              n > 1 ? 'text-white' : ACTUAL_BLOCK[(primary.status as TaskStatus) || 'todo']
                            }`}
                            style={{
                              top,
                              height: Math.max(16, bottom - top - 1),
                              ...(n > 1 ? ZEBRA_HATCH : {}),
                            }}
                            title={n > 1 ? `${n} 个任务并行` : primary.title}
                          >
                            <p className="truncate text-[11px] font-medium leading-tight">
                              {n > 1 ? `${n} 个任务并行` : primary.title}
                            </p>
                            <p className="mt-0.5 truncate text-[9.5px] opacity-90">
                              {hhmm(sl.s)}–{hhmm(sl.e)}
                            </p>
                            {live && <span className="pointer-events-none absolute inset-y-0 right-0 w-[3px] animate-pulse bg-white/90" />}
                          </button>
                        );
                      })}

                      {slices.length === 0 && dayHabitSpans.length === 0 && (
                        <p className="absolute inset-x-2 top-1.5 text-[10px] text-ink-faint">无实际记录 · 双击补记</p>
                      )}

                      {dayMinutes > 0 && (
                        <span className="pointer-events-none absolute right-1.5 top-1 z-20 rounded bg-white/85 px-1 text-[9.5px] tabular-nums text-ink-soft">
                          实际 {fmtMinutes(dayMinutes)}
                        </span>
                      )}
                    </>
                  )}

                  {/* 当前时间线 */}
                  {isToday && showNow && (
                    <div className="pointer-events-none absolute inset-x-0 z-20 flex items-center" style={{ top: nowTop }}>
                      <span className="-ml-[3px] h-1.5 w-1.5 rounded-full bg-clay" />
                      <span className="h-px flex-1 bg-clay/70" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        /* ── 月视图 ── */
        <div className="overflow-hidden rounded-xl border border-line bg-card">
          <div className="grid grid-cols-7 border-b border-line bg-paper-deep/50 text-center text-[12px] text-ink-soft">
            {WEEK_LABELS.map((w) => (
              <div key={w} className="py-2">
                {w}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {cells.map((d, i) => {
              const ds = fmt(d);
              const inMonth = d.getMonth() === monthView.m;
              const isToday = ds === tStr;
              const evs = byDate[ds] || [];
              const info = actualDayInfo.get(ds);
              const actualEvs = info?.events ?? [];
              return (
                <div
                  key={i}
                  className={`group min-h-[104px] border-b border-r border-line-soft p-1.5 ${
                    i % 7 === 6 ? 'border-r-0' : ''
                  } ${inMonth ? 'bg-white' : 'bg-paper/60'}`}
                  onDoubleClick={(ev) => dblClickCell(ev, ds)}
                >
                  <div className="flex items-center justify-between">
                    <button
                      onClick={() => {
                        setAnchor(ds);
                        setMode('week');
                      }}
                      className={`flex h-6 w-6 items-center justify-center rounded-full text-[12px] font-medium tabular-nums ${
                        isToday
                          ? 'bg-moss-deep text-white'
                          : inMonth
                          ? 'text-ink-mid hover:bg-paper-deep'
                          : 'text-ink-faint hover:bg-paper-deep'
                      }`}
                    >
                      {d.getDate()}
                    </button>
                    <span className="flex items-center gap-0.5">
                      {/* 月视图只给个角标：这天有几个习惯，不展开（否则天天都有、糊成一片） */}
                      {layer === 'plan' && inMonth && (habitsByDate[ds] || []).length > 0 && (
                        <span
                          className="text-[9.5px] leading-none text-moss/60"
                          title={`${(habitsByDate[ds] || []).length} 个习惯`}
                        >
                          ↻{(habitsByDate[ds] || []).length}
                        </span>
                      )}
                      {layer === 'actual' && info && info.minutes > 0 && (
                        <span className="text-[9.5px] leading-none text-clay" title="当天实际投入（已去重）">
                          实 {fmtMinutes(info.minutes)}
                        </span>
                      )}
                      <button
                        className="flex h-5 w-5 items-center justify-center rounded text-ink-faint opacity-0 transition hover:bg-paper-deep hover:text-ink-mid group-hover:opacity-100"
                        onClick={() => openAdd(ds)}
                        aria-label="新建"
                      >
                        +
                      </button>
                    </span>
                  </div>
                  <div className="mt-1 space-y-1">
                    {layer === 'plan'
                      ? evs.slice(0, 3).map((e) => (
                          <button
                            key={e.id}
                            onClick={() => openEdit(e)}
                            className={`block w-full truncate rounded border-l-2 px-1.5 py-0.5 text-left text-[10.5px] font-medium ${STATUS_BLOCK[e.status]}`}
                            title={e.title}
                          >
                            {e.time ? `${e.time} ` : ''}
                            {e.title}
                          </button>
                        ))
                      : actualEvs.slice(0, 3).map((e) => (
                          <button
                            key={e.id}
                            onClick={() => {
                              const evt = (allEvents || []).find((x) => x.id === e.id);
                              if (evt) openEdit(evt);
                            }}
                            className={`block w-full truncate rounded px-1.5 py-0.5 text-left text-[10.5px] font-medium ${
                              ACTUAL_BLOCK[(e.status as TaskStatus) || 'todo']
                            }`}
                            title={`${e.title}（实际执行过）`}
                          >
                            {e.title}
                          </button>
                        ))}
                    {layer === 'plan'
                      ? evs.length > 3 && <div className="px-1.5 text-[10px] text-ink-soft">+{evs.length - 3} 更多</div>
                      : actualEvs.length > 3 && (
                          <div className="px-1.5 text-[10px] text-ink-soft">+{actualEvs.length - 3} 更多</div>
                        )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <p className="mt-2.5 text-[11.5px] text-ink-soft">
        {layer === 'plan' ? (
          <>
            双击空白格新建 · 实心块＝任务（<span className="text-ink-mid">待开始</span>
            <span className="text-clay"> · 进行中</span>
            <span className="text-lagoon"> · 待审核</span>
            <span className="text-moss"> · 已完成</span>）· 虚线块＝习惯，点一下打卡、再点撤销
          </>
        ) : (
          <>
            实际视图只画真实发生的：<span className="text-moss">斜线底纹＝习惯占用</span> ·
            <span className="text-ink-mid"> 实心块＝任务实际计时</span> ·
            <span className="text-clay"> 斑马纹＝多任务并行</span>（悬浮看明细）· 双击空白可补记
          </>
        )}
      </p>

      {/* 悬浮详情：并行块里到底有哪几件事 */}
      {tip && (
        <div
          className="pointer-events-none fixed z-50 min-w-[168px] rounded-lg border border-line bg-card px-2.5 py-2 shadow-pop"
          style={{ left: Math.min(tip.x + 14, window.innerWidth - 230), top: tip.y + 14 }}
        >
          {tip.rows.map((r, i) => (
            <p key={i} className="whitespace-nowrap text-[11.5px] leading-5 text-ink-mid">
              <span className="text-ink">{r.title}</span>
              <span className="ml-1.5 tabular-nums text-ink-soft">
                {r.when} ({fmtMinutes(r.min)})
              </span>
            </p>
          ))}
        </div>
      )}

      {dialogOpen && (
        <EventDialog
          event={editing}
          defaultDate={defaultDate}
          defaultTime={defaultTime}
          defaultStatus={defaultStatus}
          onClose={() => setDialogOpen(false)}
          onSaved={() => {
            setDialogOpen(false);
            invalidate();
          }}
        />
      )}
    </div>
  );
}
