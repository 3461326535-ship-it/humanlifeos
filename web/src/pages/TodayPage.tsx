import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { TodoEvent } from '../lib/types';
import EventDialog from '../components/EventDialog';
import EventRow from '../components/EventRow';
import ActiveTimer from '../components/ActiveTimer';
import HabitCard from '../components/HabitCard';

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
  const [doneOpen, setDoneOpen] = useState(true);
  const queryClient = useQueryClient();

  const [params, setParams] = useSearchParams();
  const q = (params.get('q') ?? '').trim();
  const focus = params.get('focus') === '1';
  const newFlag = params.get('new');

  // 顶部「新建」传 ?new=1 过来
  useEffect(() => {
    if (!newFlag) return;
    setEditing(null);
    setDialogOpen(true);
    const next = new URLSearchParams(params);
    next.delete('new');
    setParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newFlag]);

  const { data: allEvents, isLoading, error } = useQuery({
    queryKey: ['events'],
    queryFn: api.getEvents,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['events'] });

  const toggleMutation = useMutation({
    mutationFn: (id: number) => api.toggleEvent(id),
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

  // 行内勾选单条子任务：后端是「整体替换 subtasks」，所以回传全量；先做乐观更新，点下去立刻有反馈
  const toggleSubtask = (event: TodoEvent, subtaskId: number) => {
    const next = (event.subtasks || []).map((s) =>
      s.id === subtaskId ? { ...s, completed: !s.completed } : s
    );
    queryClient.setQueryData<TodoEvent[]>(['events'], (prev) =>
      prev?.map((e) => (e.id === event.id ? { ...e, subtasks: next } : e))
    );
    api
      .updateEvent(event.id, { subtasks: next.map((s) => ({ title: s.title, completed: s.completed })) })
      .then(invalidate)
      .catch(invalidate);
  };

  const dayEvents = useMemo(() => {
    if (!allEvents) return [];
    return allEvents
      .filter((e) => e.date === date)
      .filter((e) => !q || e.title.includes(q) || (e.category || '').includes(q))
      .sort((a, b) => (a.time || '99:99').localeCompare(b.time || '99:99'));
  }, [allEvents, date, q]);

  const openEvents = dayEvents.filter((e) => !e.completed);
  const doneEvents = dayEvents.filter((e) => e.completed);
  const shown = focus ? openEvents : dayEvents;
  const pct = dayEvents.length > 0 ? Math.round((doneEvents.length / dayEvents.length) * 100) : 0;

  const overdue = useMemo(() => {
    const t = todayStr();
    return (allEvents || []).filter((e) => !e.completed && e.date < t).length;
  }, [allEvents]);

  const groups = useMemo(
    () =>
      SLOTS.map((s) => ({
        ...s,
        items: openEvents.filter((e) => slotOf(e.time) === s.key),
      })).filter((g) => g.items.length > 0),
    [openEvents]
  );

  const { md, weekday, relative } = dateParts(date);
  const isToday = date === todayStr();

  const firstOpen = openEvents[0];
  const hasAnything = shown.length > 0 || doneEvents.length > 0;

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
      {/* ── 主列：任务直接铺在纸面上，不套卡片 ── */}
      <div className="min-w-0">
        {/* 日期条 */}
        <div className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-2 text-[12.5px]">
          <button className="text-ink-soft transition-colors hover:text-ink" onClick={() => setDate(addDays(date, -1))} aria-label="前一天">
            ‹
          </button>
          <span className="font-medium text-ink">
            {md}
            <span className="ml-1.5 font-normal text-ink-soft">{weekday}</span>
          </span>
          <button className="text-ink-soft transition-colors hover:text-ink" onClick={() => setDate(addDays(date, 1))} aria-label="后一天">
            ›
          </button>
          {!isToday && (
            <button className="ml-0.5 text-ink-soft underline-offset-4 hover:text-moss hover:underline" onClick={() => setDate(todayStr())}>
              回到今天（{relative}）
            </button>
          )}
          <input
            type="date"
            className="ml-1 rounded-md border border-line bg-white/70 px-1.5 py-0.5 text-[11.5px] text-ink-mid outline-none focus:border-moss/40"
            value={date}
            onChange={(e) => e.target.value && setDate(e.target.value)}
          />
          {(q || focus) && (
            <span className="text-[11.5px] text-ink-soft">
              {q && <>搜索「{q}」</>}
              {q && focus && ' · '}
              {focus && <>只看未完成</>}
            </span>
          )}
        </div>

        {isLoading ? (
          <p className="py-20 text-center text-[13px] text-ink-soft">加载中…</p>
        ) : error ? (
          <p className="py-20 text-center text-[13px] text-coral">加载失败：{(error as Error).message}</p>
        ) : !hasAnything ? (
          <div className="mt-4 flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-line py-16 text-center">
            <span className="text-xl">☀️</span>
            <p className="text-[13px] text-ink-mid">这一天还没有任务</p>
            <p className="text-[12px] text-ink-soft">点右上角「新建」开始安排</p>
          </div>
        ) : (
          <>
            {groups.map((g) => (
              <section key={g.key}>
                <div className="flex items-center gap-3 pb-0.5 pt-4">
                  <span className="flex-none text-[12px] text-ink-soft">{g.label}</span>
                  <span className="h-px flex-1 bg-line/70" />
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
                      onToggleSubtask={(sid) => toggleSubtask(event, sid)}
                    />
                  ))}
                </ul>
              </section>
            ))}

            {!focus && doneEvents.length > 0 && (
              <section className="mb-2 mt-1">
                <button
                  className="flex w-full items-center gap-1.5 py-3 text-left text-[12.5px] text-ink-mid transition-colors hover:text-ink"
                  onClick={() => setDoneOpen((v) => !v)}
                >
                  已完成 {doneEvents.length}
                  <span className={`text-[9px] transition-transform ${doneOpen ? 'inline-block -rotate-90' : 'inline-block rotate-90'}`}>›</span>
                </button>
                {doneOpen && (
                  <ul className="border-t border-line/40">
                    {doneEvents.map((event) => (
                      <EventRow
                        key={event.id}
                        event={event}
                        onToggle={() => toggleMutation.mutate(event.id)}
                        onEdit={() => {
                          setEditing(event);
                          setDialogOpen(true);
                        }}
                        onToggleSubtask={(sid) => toggleSubtask(event, sid)}
                      />
                    ))}
                  </ul>
                )}
              </section>
            )}
          </>
        )}
      </div>

      {/* ── 右栏：三张辅助卡（不是导航）── */}
      <aside className="space-y-4">
        <ActiveTimer taskId={firstOpen?.id} taskTitle={firstOpen?.title} />

        {/* 今日概览：2×2 网格 */}
        <div className="card overflow-hidden">
          <div className="s-title px-4 pb-1 pt-3.5">今日概览</div>
          <div className="grid grid-cols-2">
            <div className="border-b border-r border-line-soft px-4 py-3">
              <p className="text-[11.5px] text-ink-soft">待办</p>
              <p className="mt-1 text-[22px] font-semibold leading-none tabular-nums text-ink">{openEvents.length}</p>
            </div>
            <div className="border-b border-line-soft px-4 py-3">
              <p className="text-[11.5px] text-ink-soft">完成</p>
              <p className="mt-1 text-[22px] font-semibold leading-none tabular-nums text-ink">{doneEvents.length}</p>
            </div>
            <div className="border-r border-line-soft px-4 py-3">
              <p className="text-[11.5px] text-ink-soft">逾期</p>
              <p className={`mt-1 text-[22px] font-semibold leading-none tabular-nums ${overdue > 0 ? 'text-coral' : 'text-ink'}`}>
                {overdue}
              </p>
            </div>
            <div className="px-4 py-3">
              <p className="text-[11.5px] text-ink-soft">完成率</p>
              <p className="mt-1 text-[22px] font-semibold leading-none tabular-nums text-moss">{pct}%</p>
            </div>
          </div>
        </div>

        {/* 习惯打卡：一周 7 格，数据来自 /api/habits/occurrences */}
        <HabitCard />
      </aside>

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
