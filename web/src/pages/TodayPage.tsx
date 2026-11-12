import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { TodoEvent } from '../lib/types';
import EventDialog from '../components/EventDialog';
import EventRow from '../components/EventRow';

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

export default function TodayPage() {
  const [date, setDate] = useState(todayStr());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<TodoEvent | null>(null);
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

  const doneCount = dayEvents.filter((e) => e.completed).length;
  const pct = dayEvents.length > 0 ? Math.round((doneCount / dayEvents.length) * 100) : 0;
  const { md, weekday, relative } = dateParts(date);
  const isToday = date === todayStr();

  return (
    <div className="mx-auto max-w-4xl">
      {/* ── 页头：大日期 + 进度 ── */}
      <div className="mb-5 flex items-end justify-between">
        <div>
          <div className="flex items-baseline gap-2.5">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">{md}</h1>
            <span className="text-sm font-medium text-slate-400">{weekday}</span>
            {!isToday && (
              <span className="rounded-full bg-slate-200/70 px-2 py-0.5 text-[11px] font-medium text-slate-500">
                {relative}
              </span>
            )}
          </div>
          <p className="mt-1 text-[13px] text-slate-400">
            {dayEvents.length === 0
              ? '还没有安排，加一个吧'
              : `${dayEvents.length} 项任务 · 已完成 ${doneCount}`}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <button className="btn-ghost" onClick={() => setDate(addDays(date, -1))} aria-label="前一天">←</button>
          <button
            className="btn-ghost text-xs"
            onClick={() => setDate(todayStr())}
            disabled={isToday}
          >
            今天
          </button>
          <button className="btn-ghost" onClick={() => setDate(addDays(date, 1))} aria-label="后一天">→</button>
          <input
            type="date"
            className="input w-[130px] text-xs"
            value={date}
            onChange={(e) => e.target.value && setDate(e.target.value)}
          />
          <button
            className="btn-primary"
            onClick={() => {
              setEditing(null);
              setDialogOpen(true);
            }}
          >
            + 新任务
          </button>
        </div>
      </div>

      {/* ── 进度条 ── */}
      {dayEvents.length > 0 && (
        <div className="mb-5 h-1 overflow-hidden rounded-full bg-slate-200/80">
          <div
            className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-indigo-400 transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
      )}

      {/* ── 任务列表 ── */}
      {isLoading ? (
        <p className="py-24 text-center text-sm text-slate-400">加载中…</p>
      ) : error ? (
        <p className="py-24 text-center text-sm text-red-500">加载失败：{(error as Error).message}</p>
      ) : dayEvents.length === 0 ? (
        <div className="card flex flex-col items-center justify-center border-dashed py-24 text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-2xl">
            ☀️
          </div>
          <p className="text-sm font-medium text-slate-500">这一天还没有任务</p>
          <p className="mt-1 text-xs text-slate-400">点击右上角「+ 新任务」开始安排</p>
        </div>
      ) : (
        <ul className="space-y-1.5">
          {dayEvents.map((event) => (
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
