import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { TodoEvent, TaskStatus } from '../lib/types';
import { STATUS_LABELS } from '../lib/types';
import EventDialog from '../components/EventDialog';

const WEEK_LABELS = ['一', '二', '三', '四', '五', '六', '日'];

const CHIP_CLASS: Record<TaskStatus, string> = {
  todo: 'bg-line-soft text-ink-mid',
  in_progress: 'bg-lagoon-soft text-lagoon',
  review: 'bg-clay-soft text-clay',
  done: 'bg-moss-soft text-moss',
};

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function fmt(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function monthCells(y: number, m0: number): Date[] {
  const first = new Date(y, m0, 1);
  const startOffset = first.getDay() === 0 ? 6 : first.getDay() - 1; // 周一为起点
  const start = new Date(y, m0, 1 - startOffset);
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

export default function CalendarPage() {
  const [view, setView] = useState(() => {
    const n = new Date();
    return { y: n.getFullYear(), m: n.getMonth() };
  });
  const [track, setTrack] = useState<'plan' | 'actual'>('plan');
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<TodoEvent | null>(null);
  const [defaultStatus, setDefaultStatus] = useState<TaskStatus>('todo');
  const [defaultDate, setDefaultDate] = useState(todayStr());

  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ['events'] });
  const { data: allEvents, isLoading } = useQuery({ queryKey: ['events'], queryFn: api.getEvents });

  // 按轨道把事件归到具体日期
  const byDate = useMemo(() => {
    const map: Record<string, TodoEvent[]> = {};
    (allEvents || []).forEach((e) => {
      let key: string | null = null;
      if (track === 'plan') key = e.date;
      else if (e.status === 'done' && e.completed_at) key = e.completed_at.slice(0, 10);
      if (key) (map[key] ||= []).push(e);
    });
    return map;
  }, [allEvents, track]);

  const cells = monthCells(view.y, view.m);
  const tStr = todayStr();

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

  const selectedEvents = selectedDay ? (byDate[selectedDay] || []).slice().sort((a, b) => (a.time || '').localeCompare(b.time || '')) : [];

  return (
    <div className="min-w-0">
      {/* 工具栏 */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1.5">
          <button className="btn-ghost h-8 px-2" onClick={() => setView((v) => ({ ...v, m: v.m - 1 < 0 ? 11 : v.m - 1, y: v.m - 1 < 0 ? v.y - 1 : v.y }))} aria-label="上个月">‹</button>
          <span className="min-w-[88px] text-center text-[13.5px] font-semibold text-ink">
            {view.y}年{view.m + 1}月
          </span>
          <button className="btn-ghost h-8 px-2" onClick={() => setView((v) => ({ ...v, m: v.m + 1 > 11 ? 0 : v.m + 1, y: v.m + 1 > 11 ? v.y + 1 : v.y }))} aria-label="下个月">›</button>
          <button className="btn-ghost h-7 px-2 text-xs" onClick={() => { const n = new Date(); setView({ y: n.getFullYear(), m: n.getMonth() }); }}>今天</button>
        </div>

        {/* 双轨切换 */}
        <div className="seg">
          <button
            onClick={() => { setTrack('plan'); setSelectedDay(null); }}
            className={`seg-item ${track === 'plan' ? 'seg-item-on' : ''}`}
          >
            计划
          </button>
          <button
            onClick={() => { setTrack('actual'); setSelectedDay(null); }}
            className={`seg-item ${track === 'actual' ? 'seg-item-on' : ''}`}
          >
            实际
          </button>
        </div>
        <span className="text-[12px] text-ink-soft">
          {track === 'plan' ? '按计划日期排布' : '按实际完成日期排布（仅已完成）'}
        </span>
      </div>

      {/* 月格 */}
      {isLoading ? (
        <p className="py-24 text-center text-sm text-ink-soft">加载中…</p>
      ) : (
        <div className="overflow-hidden rounded-xl ring-1 ring-line/60">
          {/* 周头 */}
          <div className="grid grid-cols-7 border-b border-line/60 bg-paper-deep/70 text-center text-[12px] font-medium text-ink-soft">
            {WEEK_LABELS.map((w) => (
              <div key={w} className="py-2">{w}</div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {cells.map((d, i) => {
              const ds = fmt(d);
              const inMonth = d.getMonth() === view.m;
              const isToday = ds === tStr;
              const evs = byDate[ds] || [];
              return (
                <div
                  key={i}
                  className={`group min-h-[104px] border-b border-r border-line-soft p-1.5 ${i % 7 === 6 ? 'border-r-0' : ''} ${inMonth ? 'bg-white' : 'bg-paper-deep/40'}`}
                >
                  <div className="flex items-center justify-between">
                    <button
                      onClick={() => setSelectedDay(ds === selectedDay ? null : ds)}
                      className={`flex h-6 w-6 items-center justify-center rounded-md text-[12px] font-medium ${
                        isToday
                          ? 'bg-moss text-white'
                          : inMonth
                          ? 'text-ink-mid hover:bg-line-soft'
                          : 'text-ink-faint hover:bg-line-soft'
                      }`}
                    >
                      {d.getDate()}
                    </button>
                    <button
                      className="flex h-5 w-5 items-center justify-center rounded text-ink-faint opacity-0 transition hover:bg-line-soft hover:text-ink-soft group-hover:opacity-100"
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
                        className={`block w-full truncate rounded px-1.5 py-0.5 text-left text-[11px] font-medium ${CHIP_CLASS[e.status]}`}
                        title={e.title}
                      >
                        {e.time ? `${e.time} ` : ''}
                        {e.title}
                      </button>
                    ))}
                    {evs.length > 3 && (
                      <div className="px-1.5 text-[10px] text-ink-soft">+{evs.length - 3} 更多</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 日详情面板 */}
      {selectedDay && (
        <div className="mt-4 card p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-ink">
              {selectedDay}
              <span className="ml-2 text-[12px] font-normal text-ink-soft">
                {selectedEvents.length} 项（{track === 'plan' ? '计划' : '实际'}）
              </span>
            </h3>
            <div className="flex items-center gap-2">
              <button className="btn-primary text-xs" onClick={() => openAdd(selectedDay)}>+ 新任务</button>
              <button className="btn-ghost text-xs" onClick={() => setSelectedDay(null)}>收起</button>
            </div>
          </div>
          {selectedEvents.length === 0 ? (
            <p className="py-6 text-center text-[13px] text-ink-soft">这一天没有任务</p>
          ) : (
            <ul className="space-y-1.5">
              {selectedEvents.map((e) => (
                <li
                  key={e.id}
                  onClick={() => openEdit(e)}
                  className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-paper-deep"
                >
                  <span className={`h-2 w-2 flex-none rounded-full ${dotColor(e.status)}`} />
                  <span className="w-12 flex-none font-mono text-[12px] text-ink-soft">{e.time || '—'}</span>
                  <span className="flex-1 truncate text-[13px] text-ink-mid">{e.title}</span>
                  <span className="text-[11px] text-ink-soft">{STATUS_LABELS[e.status]}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* 创建/编辑弹窗 */}
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

function dotColor(status: TaskStatus): string {
  return {
    todo: 'bg-ink-soft',
    in_progress: 'bg-lagoon',
    review: 'bg-clay',
    done: 'bg-moss',
  }[status];
}
