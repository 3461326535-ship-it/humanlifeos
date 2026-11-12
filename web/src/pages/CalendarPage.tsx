import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { TodoEvent, TaskStatus } from '../lib/types';
import EventDialog from '../components/EventDialog';

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

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function fmt(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
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

export default function CalendarPage() {
  const [mode, setMode] = useState<'week' | 'month'>('week');
  const [anchor, setAnchor] = useState(todayStr());
  const [monthView, setMonthView] = useState(() => {
    const n = new Date();
    return { y: n.getFullYear(), m: n.getMonth() };
  });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<TodoEvent | null>(null);
  const [defaultStatus, setDefaultStatus] = useState<TaskStatus>('todo');
  const [defaultDate, setDefaultDate] = useState(todayStr());

  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ['events'] });
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

  const openAdd = (date: string, status: TaskStatus = 'todo') => {
    setEditing(null);
    setDefaultStatus(status);
    setDefaultDate(date);
    setDialogOpen(true);
  };
  const openEdit = (e: TodoEvent) => {
    setEditing(e);
    setDefaultStatus(e.status);
    setDefaultDate(e.date);
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

        <div className="seg ml-auto">
          <button className={`seg-item ${mode === 'month' ? 'seg-item-on' : ''}`} onClick={() => setMode('month')}>
            月
          </button>
          <button className={`seg-item ${mode === 'week' ? 'seg-item-on' : ''}`} onClick={() => setMode('week')}>
            周
          </button>
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
              return (
                <div
                  key={di}
                  className={`relative border-l border-line/60 ${isToday ? 'bg-moss-soft/25' : ''}`}
                  style={{ height: TOTAL_H }}
                  onDoubleClick={() => openAdd(ds)}
                >
                  {/* 小时线 */}
                  {hourLines.map((h, i) => (
                    <div key={h} className="absolute inset-x-0 border-t border-line/40" style={{ top: i * HOUR_H }} />
                  ))}

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

                  {/* 时间块 */}
                  {timed.map((e) => {
                    const span = eventSpan(e)!;
                    const top = ((span.startMin - DAY_START * 60) / 60) * HOUR_H;
                    if (top < 0 || top > TOTAL_H) return null;
                    const height = Math.max(22, ((span.endMin - span.startMin) / 60) * HOUR_H - 2);
                    return (
                      <button
                        key={e.id}
                        onClick={(ev) => {
                          ev.stopPropagation();
                          openEdit(e);
                        }}
                        className={`absolute inset-x-1 z-10 overflow-hidden rounded-md border-l-[3px] px-1.5 py-1 text-left transition-shadow hover:shadow-card-hover ${STATUS_BLOCK[e.status]}`}
                        style={{ top, height }}
                        title={`${e.title} ${span.start}`}
                      >
                        <p className="truncate text-[11.5px] font-medium leading-tight">{e.title}</p>
                        <p className="mt-0.5 truncate text-[10px] opacity-80">{span.start}</p>
                      </button>
                    );
                  })}

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
              return (
                <div
                  key={i}
                  className={`group min-h-[104px] border-b border-r border-line-soft p-1.5 ${
                    i % 7 === 6 ? 'border-r-0' : ''
                  } ${inMonth ? 'bg-white' : 'bg-paper/60'}`}
                  onDoubleClick={() => openAdd(ds)}
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
                    <button
                      className="flex h-5 w-5 items-center justify-center rounded text-ink-faint opacity-0 transition hover:bg-paper-deep hover:text-ink-mid group-hover:opacity-100"
                      onClick={() => openAdd(ds)}
                      aria-label="新建"
                    >
                      +
                    </button>
                  </div>
                  <div className="mt-1 space-y-1">
                    {evs.slice(0, 3).map((e) => (
                      <button
                        key={e.id}
                        onClick={() => openEdit(e)}
                        className={`block w-full truncate rounded border-l-2 px-1.5 py-0.5 text-left text-[10.5px] font-medium ${STATUS_BLOCK[e.status]}`}
                        title={e.title}
                      >
                        {e.time ? `${e.time} ` : ''}
                        {e.title}
                      </button>
                    ))}
                    {evs.length > 3 && <div className="px-1.5 text-[10px] text-ink-soft">+{evs.length - 3} 更多</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <p className="mt-2.5 text-[11.5px] text-ink-soft">
        双击空白格新建 · 时间块颜色对应状态：<span className="text-ink-mid">待开始</span>
        <span className="text-clay"> · 进行中</span>
        <span className="text-lagoon"> · 待审核</span>
        <span className="text-moss"> · 已完成</span>
      </p>

      {dialogOpen && (
        <EventDialog
          event={editing}
          defaultDate={defaultDate}
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
