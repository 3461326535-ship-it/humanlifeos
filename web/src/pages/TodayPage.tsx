import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { TodoEvent } from '../lib/types';
import EventDialog from '../components/EventDialog';
import EventRow from '../components/EventRow';
import ActiveTimer from '../components/ActiveTimer';

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function addDays(dateStr: string, n: number) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

function dateParts(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00');
  const diff = Math.round((d.getTime() - new Date(todayStr() + 'T00:00:00').getTime()) / 86400000);
  return {
    md: `${d.getMonth() + 1}月${d.getDate()}日`,
    weekday: WEEKDAYS[d.getDay()],
    relative: diff === 0 ? '今天' : diff === 1 ? '明天' : diff === -1 ? '昨天' : diff > 0 ? `${diff} 天后` : `${-diff} 天前`,
  };
}

// ── 按时间段分组（图纸上的上午 / 下午 / 晚上 / 未排时间）──
const SLOTS = [
  { key: 'morning', label: '上午' },
  { key: 'afternoon', label: '下午' },
  { key: 'evening', label: '晚上' },
  { key: 'none', label: '未排时间' },
] as const;

function slotOf(time: string): (typeof SLOTS)[number]['key'] {
  if (!time) return 'none';
  if (time < '12:00') return 'morning';
  if (time < '18:00') return 'afternoon';
  return 'evening';
}

export default function TodayPage() {
  const [date, setDate] = useState(todayStr());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<TodoEvent | null>(null);
  const [doneOpen, setDoneOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data: allEvents, isLoading, error } = useQuery({
    queryKey: ['events'],
    queryFn: api.getEvents,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['events'] });

  const toggleMutation = useMutation({
    mutationFn: (id: number) => api.toggleEvent(id),
    // 乐观更新：先改缓存，失败自动回滚
    onMutate: async (id: number) => {
      await queryClient.cancelQueries({ queryKey: ['events'] });
      const prev = queryClient.getQueryData<TodoEvent[]>(['events']);
      if (prev) {
        queryClient.setQueryData<TodoEvent[]>(
          ['events'],
          prev.map((e) => (e.id === id ? { ...e, completed: !e.completed } : e))
        );
      }
      return { prev };
    },
    onError: (_e, _id, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(['events'], ctx.prev);
    },
    onSettled: invalidate,
  });

  const dayEvents = useMemo(() => {
    if (!allEvents) return [];
    return allEvents
      .filter((e) => e.date === date)
      .sort((a, b) => {
        if (a.completed !== b.completed) return a.completed ? 1 : -1;
        return (a.time || '99:99').localeCompare(b.time || '99:99');
      });
  }, [allEvents, date]);

  const openEvents = dayEvents.filter((e) => !e.completed);
  const doneEvents = dayEvents.filter((e) => e.completed);
  const doneCount = doneEvents.length;
  const pct = dayEvents.length > 0 ? Math.round((doneCount / dayEvents.length) * 100) : 0;
  const { md, weekday, relative } = dateParts(date);
  const isToday = date === todayStr();

  // 分组
  const groups = useMemo(
    () =>
      SLOTS.map((s) => ({
        ...s,
        items: openEvents.filter((e) => slotOf(e.time) === s.key),
      })).filter((g) => g.items.length > 0),
    [openEvents]
  );

  // 右栏速览：逾期来自全量数据，其余仅当日
  const overdue = useMemo(() => {
    const t = todayStr();
    return (allEvents || []).filter((e) => !e.completed && e.date < t).length;
  }, [allEvents]);

  const openNew = () => {
    setEditing(null);
    setDialogOpen(true);
  };

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
      {/* ── 主列 ── */}
      <div className="min-w-0">
        {/* 日期工具条 */}
        <div className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-2">
          <div className="flex items-center gap-0.5">
            <button
              className="btn-ghost h-8 w-8 px-0 text-[15px]"
              onClick={() => setDate(addDays(date, -1))}
              aria-label="前一天"
            >
              ‹
            </button>
            <span className="min-w-[104px] text-center text-[13px] font-medium text-ink">
              {md}
              <span className="ml-1.5 font-normal text-ink-soft">{weekday}</span>
            </span>
            <button
              className="btn-ghost h-8 w-8 px-0 text-[15px]"
              onClick={() => setDate(addDays(date, 1))}
              aria-label="后一天"
            >
              ›
            </button>
          </div>

          {!isToday && (
            <button className="btn-ghost h-7 px-2 text-[12px]" onClick={() => setDate(todayStr())}>
              回到今天
              <span className="ml-1 text-ink-faint">{relative}</span>
            </button>
          )}

          <input
            type="date"
            className="input h-8 w-[132px] px-2 text-[12px]"
            value={date}
            onChange={(e) => e.target.value && setDate(e.target.value)}
          />

          <button className="btn-primary ml-auto h-8 text-[12.5px]" onClick={openNew}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
            新任务
          </button>
        </div>

        {/* 进度 */}
        {dayEvents.length > 0 && (
          <div className="mb-3 flex items-center gap-3">
            <div className="h-1 flex-1 overflow-hidden rounded-full bg-line">
              <div className="h-full rounded-full bg-moss transition-all duration-500" style={{ width: `${pct}%` }} />
            </div>
            <span className="flex-none text-[11.5px] tabular-nums text-ink-soft">
              {doneCount}/{dayEvents.length}
            </span>
          </div>
        )}

        {/* 任务卡 */}
        {isLoading ? (
          <div className="card py-20 text-center text-[13px] text-ink-soft">加载中…</div>
        ) : error ? (
          <div className="card py-20 text-center text-[13px] text-coral">加载失败：{(error as Error).message}</div>
        ) : dayEvents.length === 0 ? (
          <div className="card flex flex-col items-center justify-center gap-2 border-dashed py-20 text-center">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-paper-deep text-xl">☀️</div>
            <p className="text-[13px] font-medium text-ink-mid">这一天还没有任务</p>
            <p className="text-[12px] text-ink-soft">点右上角「新任务」开始安排</p>
          </div>
        ) : (
          <div className="card overflow-hidden">
            {groups.map((g) => (
              <div key={g.key}>
                <div className="flex items-center gap-2 px-4 pb-2 pt-3.5">
                  <span className="text-[12px] font-semibold tracking-[0.02em] text-ink-mid">{g.label}</span>
                  <span className="text-[11px] text-ink-soft">{g.items.length}</span>
                  <span className="h-px flex-1 bg-line-soft" />
                </div>
                <ul>
                  {g.items.map((event) => (
                    <EventRow
                      key={event.id}
                      event={event}
                      onToggle={() => toggleMutation.mutate(event.id)}
                      onEdit={() => {
                        setEditing(event);
                        setDialogOpen(true);
                      }}
                    />
                  ))}
                </ul>
              </div>
            ))}

            {/* 已完成：默认折叠 */}
            {doneEvents.length > 0 && (
              <div className="border-t border-line-soft">
                <button
                  className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-[12px] text-ink-soft transition-colors hover:bg-paper-deep/50"
                  onClick={() => setDoneOpen((v) => !v)}
                >
                  <span className={`text-[9px] transition-transform ${doneOpen ? 'rotate-90' : ''}`}>▶</span>
                  已完成 {doneEvents.length} 项
                  <span className="text-ink-faint">·</span>
                  <span className="truncate">{doneEvents.map((e) => e.title).join('、')}</span>
                </button>
                {doneOpen && (
                  <ul className="border-t border-line-soft">
                    {doneEvents.map((event) => (
                      <EventRow
                        key={event.id}
                        event={event}
                        onToggle={() => toggleMutation.mutate(event.id)}
                        onEdit={() => {
                          setEditing(event);
                          setDialogOpen(true);
                        }}
                      />
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── 右栏：辅助卡（不是导航，窄屏落到列表下方）── */}
      <aside className="space-y-3.5">
        <ActiveTimer />

        <div className="card p-4">
          <div className="s-head">
            <span className="s-title">今日概览</span>
          </div>
          <div className="space-y-1.5">
            <div className="flex items-baseline justify-between text-[12.5px] text-ink-mid">
              <span>待办</span>
              <b className="text-[15px] font-semibold tabular-nums text-ink">{openEvents.length}</b>
            </div>
            <div className="h-px bg-line-soft" />
            <div className="flex items-baseline justify-between text-[12.5px] text-ink-mid">
              <span>已完成</span>
              <b className="text-[15px] font-semibold tabular-nums text-moss">{doneCount}</b>
            </div>
            <div className="h-px bg-line-soft" />
            <div className="flex items-baseline justify-between text-[12.5px] text-ink-mid">
              <span>逾期（全部）</span>
              <b className={`text-[15px] font-semibold tabular-nums ${overdue > 0 ? 'text-coral' : 'text-ink'}`}>
                {overdue}
              </b>
            </div>
            <div className="h-px bg-line-soft" />
            <div className="flex items-baseline justify-between text-[12.5px] text-ink-mid">
              <span>当日完成率</span>
              <b className="text-[15px] font-semibold tabular-nums text-ink">{pct}%</b>
            </div>
          </div>
        </div>
      </aside>

      {/* 创建/编辑弹窗 */}
      {dialogOpen && (
        <EventDialog
          event={editing}
          defaultDate={date}
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
