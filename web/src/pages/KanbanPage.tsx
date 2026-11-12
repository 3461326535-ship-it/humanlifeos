import { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCorners,
  useDroppable,
  type DragStartEvent,
  type DragOverEvent,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { api } from '../lib/api';
import type { TodoEvent, TaskStatus } from '../lib/types';
import { STATUS_LABELS, PRIORITY_LABELS } from '../lib/types';
import EventDialog from '../components/EventDialog';

const COLUMNS: TaskStatus[] = ['todo', 'in_progress', 'review', 'done'];

const STATUS_ACCENT: Record<TaskStatus, string> = {
  todo: 'bg-slate-400',
  in_progress: 'bg-blue-500',
  review: 'bg-amber-500',
  done: 'bg-emerald-500',
};

const PRIORITY_DOT: Record<string, string> = {
  high: 'bg-rose-500',
  medium: 'bg-amber-500',
  low: 'bg-sky-500',
};

type Scope = 'today' | 'week' | 'all';
type Columns = Record<TaskStatus, TodoEvent[]>;

// ── 日期工具 ──
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function addDays(dateStr: string, n: number) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function weekBounds() {
  const now = new Date();
  const diffToMon = now.getDay() === 0 ? -6 : 1 - now.getDay();
  const mon = new Date(now);
  mon.setDate(now.getDate() + diffToMon);
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return { start: fmt(mon), end: fmt(sun) };
}

// ── 排序 / 落点计算 ──
function sortCol(col: TodoEvent[]): TodoEvent[] {
  return [...col].sort((a, b) => {
    const pa = a.position ?? Number.MAX_SAFE_INTEGER;
    const pb = b.position ?? Number.MAX_SAFE_INTEGER;
    if (pa !== pb) return pa - pb;
    return a.id - b.id;
  });
}

// 在同列 siblings（已排除被拖卡）的 insertIndex 处插入，返回新 position：
// 取前后邻居中点（后端有精度自愈兜底），边界则 ±1024
function computePosition(siblings: TodoEvent[], insertIndex: number): number {
  const prev = siblings[insertIndex - 1];
  const next = siblings[insertIndex];
  const prevP = prev?.position ?? null;
  const nextP = next?.position ?? null;
  if (prevP == null && nextP == null) return 1024;
  if (prevP == null) return (nextP as number) - 1024;
  if (nextP == null) return prevP + 1024;
  return (prevP + nextP) / 2;
}

function findColumnOfId(columns: Columns, id: number): TaskStatus | undefined {
  return COLUMNS.find((c) => columns[c].some((e) => e.id === id));
}

// ── 看板卡片（可拖拽）──
function KanbanCard({ event, onOpen }: { event: TodoEvent; onOpen: (e: TodoEvent) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: event.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };
  const doneSub = (event.subtasks || []).filter((s) => s.completed).length;
  const totalSub = (event.subtasks || []).length;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={() => onOpen(event)}
      className="card cursor-grab space-y-1.5 p-3 active:cursor-grabbing"
    >
      <div className="flex items-start gap-2">
        {event.priority && (
          <span className={`mt-1.5 h-2 w-2 flex-none rounded-full ${PRIORITY_DOT[event.priority]}`} />
        )}
        <p className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800">{event.title}</p>
      </div>
      {(event.time || (event.category && event.category !== '其他') || event.recurrence || totalSub > 0) && (
        <div className="flex flex-wrap items-center gap-1.5 pl-4 text-[11px]">
          {event.time && (
            <span className="rounded bg-indigo-50 px-1.5 py-0.5 font-medium text-indigo-600">{event.time}</span>
          )}
          {event.category && event.category !== '其他' && (
            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-500">{event.category}</span>
          )}
          {event.recurrence && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-500">↻</span>}
          {totalSub > 0 && (
            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-500">
              {doneSub}/{totalSub}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// 预览卡（DragOverlay 用，无交互）
function CardPreview({ event }: { event: TodoEvent }) {
  return (
    <div className="card cursor-grabbing space-y-1.5 p-3 shadow-pop">
      <div className="flex items-start gap-2">
        {event.priority && (
          <span className={`mt-1.5 h-2 w-2 flex-none rounded-full ${PRIORITY_DOT[event.priority]}`} />
        )}
        <p className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800">{event.title}</p>
      </div>
      {event.time && (
        <div className="pl-4 text-[11px]">
          <span className="rounded bg-indigo-50 px-1.5 py-0.5 font-medium text-indigo-600">{event.time}</span>
        </div>
      )}
    </div>
  );
}

// ── 单列（可放置区）──
function Column({
  status,
  events,
  onOpen,
  onAdd,
}: {
  status: TaskStatus;
  events: TodoEvent[];
  onOpen: (e: TodoEvent) => void;
  onAdd: (s: TaskStatus) => void;
}) {
  const { setNodeRef } = useDroppable({ id: status });
  return (
    <div className="flex min-w-[260px] flex-1 flex-col rounded-xl bg-slate-50/70 ring-1 ring-slate-200/60">
      {/* 列头 */}
      <div className="flex items-center gap-2 px-3 pb-2 pt-3">
        <span className={`h-2 w-2 rounded-full ${STATUS_ACCENT[status]}`} />
        <span className="text-[13px] font-semibold text-slate-700">{STATUS_LABELS[status]}</span>
        <span className="rounded-full bg-slate-200/70 px-1.5 text-[11px] font-medium text-slate-500">
          {events.length}
        </span>
        <button
          className="ml-auto flex h-6 w-6 items-center justify-center rounded-md text-slate-400 hover:bg-slate-200/70 hover:text-slate-600"
          onClick={() => onAdd(status)}
          aria-label={`在「${STATUS_LABELS[status]}」新建`}
        >
          +
        </button>
      </div>
      {/* 卡片区（放置目标） */}
      <div ref={setNodeRef} className="flex-1 space-y-2 px-2 pb-3">
        <SortableContext items={events.map((e) => e.id)} strategy={verticalListSortingStrategy}>
          {events.map((e) => (
            <KanbanCard key={e.id} event={e} onOpen={onOpen} />
          ))}
        </SortableContext>
        {events.length === 0 && (
          <div className="rounded-lg border border-dashed border-slate-200 py-6 text-center text-[11px] text-slate-400">
            拖拽任务到此处
          </div>
        )}
      </div>
    </div>
  );
}

export default function KanbanPage() {
  const [scope, setScope] = useState<Scope>('today');
  const [date, setDate] = useState(todayStr());
  const [columns, setColumns] = useState<Columns>({ todo: [], in_progress: [], review: [], done: [] });
  const [activeId, setActiveId] = useState<number | null>(null);
  const [originCol, setOriginCol] = useState<TaskStatus | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<TodoEvent | null>(null);
  const [defaultStatus, setDefaultStatus] = useState<TaskStatus>('todo');

  const queryClient = useQueryClient();
  const { data: allEvents, isLoading } = useQuery({ queryKey: ['events'], queryFn: api.getEvents });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['events'] });

  const statusMutation = useMutation({
    mutationFn: ({ id, status, position }: { id: number; status: TaskStatus; position: number }) =>
      api.updateStatus(id, status, position),
    onSettled: invalidate,
  });
  const reorderMutation = useMutation({
    mutationFn: (items: { id: number; position: number }[]) => api.reorder(items),
    onSettled: invalidate,
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // 按范围过滤 + 分列
  const inScope = useMemo(() => {
    if (scope === 'all') return () => true;
    if (scope === 'today') return (e: TodoEvent) => e.date === date;
    const { start, end } = weekBounds();
    return (e: TodoEvent) => e.date >= start && e.date <= end;
  }, [scope, date]);

  useEffect(() => {
    if (!allEvents) return;
    const grouped: Columns = { todo: [], in_progress: [], review: [], done: [] };
    allEvents.forEach((e) => {
      if (inScope(e)) grouped[e.status].push(e);
    });
    COLUMNS.forEach((c) => (grouped[c] = sortCol(grouped[c])));
    setColumns(grouped);
  }, [allEvents, inScope]);

  // ── 拖拽 ──
  function onDragStart(e: DragStartEvent) {
    const id = Number(e.active.id);
    setActiveId(id);
    setOriginCol(findColumnOfId(columns, id) ?? null);
  }

  function onDragOver(e: DragOverEvent) {
    const { active, over } = e;
    if (!over) return;
    const activeId = Number(active.id);
    const overId = over.id;
    const fromCol = findColumnOfId(columns, activeId);
    if (!fromCol) return;
    const toCol: TaskStatus | undefined =
      typeof overId === 'string' ? (overId as TaskStatus) : findColumnOfId(columns, Number(overId));
    if (!toCol || fromCol === toCol) return;

    setColumns((prev) => {
      const moving = prev[fromCol].find((x) => x.id === activeId);
      if (!moving) return prev;
      const fromItems = prev[fromCol].filter((x) => x.id !== activeId);
      const toItems = prev[toCol];
      let insertIndex = toItems.length;
      if (typeof overId === 'number') {
        const idx = toItems.findIndex((x) => x.id === overId);
        if (idx >= 0) insertIndex = idx;
      }
      const newTo = [...toItems.slice(0, insertIndex), moving, ...toItems.slice(insertIndex)];
      return { ...prev, [fromCol]: fromItems, [toCol]: newTo };
    });
  }

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    setActiveId(null);
    setOriginCol(null);
    if (!over) return;
    const id = Number(active.id);
    const overId = over.id;
    const toCol: TaskStatus | undefined =
      typeof overId === 'string' ? (overId as TaskStatus) : findColumnOfId(columns, Number(overId));
    if (!toCol) return;

    const siblings = columns[toCol].filter((x) => x.id !== id);
    let insertIndex = siblings.length;
    if (typeof overId === 'number') {
      const idx = siblings.findIndex((x) => x.id === overId);
      if (idx >= 0) insertIndex = idx;
    }
    const pos = computePosition(siblings, insertIndex);

    if (originCol && originCol !== toCol) {
      statusMutation.mutate({ id, status: toCol, position: pos });
    } else {
      reorderMutation.mutate([{ id, position: pos }]);
    }

    // 乐观更新本地列
    setColumns((prev) => {
      const moving = prev[toCol].find((x) => x.id === id) ?? allEvents?.find((x) => x.id === id);
      if (!moving) return prev;
      const without = prev[toCol].filter((x) => x.id !== id);
      const next = [...without.slice(0, insertIndex), { ...moving, position: pos }, ...without.slice(insertIndex)];
      return { ...prev, [toCol]: sortCol(next) };
    });
  }

  // ── 弹窗 ──
  const openEdit = (e: TodoEvent) => {
    setEditing(e);
    setDefaultStatus(e.status);
    setDialogOpen(true);
  };
  const openAdd = (s: TaskStatus) => {
    setEditing(null);
    setDefaultStatus(s);
    setDialogOpen(true);
  };
  const dialogDefaultDate = scope === 'today' ? date : todayStr();

  const activeEvent = activeId != null ? allEvents?.find((e) => e.id === activeId) ?? null : null;
  const totalCount = COLUMNS.reduce((n, c) => n + columns[c].length, 0);

  return (
    <div className="mx-auto max-w-6xl">
      {/* 工具栏 */}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold tracking-tight text-slate-900">看板</h1>

        {/* 范围切换 */}
        <div className="flex rounded-lg bg-slate-100 p-0.5 text-[13px]">
          {(['today', 'week', 'all'] as Scope[]).map((s) => (
            <button
              key={s}
              onClick={() => setScope(s)}
              className={`rounded-md px-2.5 py-1 ${
                scope === s ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {s === 'today' ? '今天' : s === 'week' ? '本周' : '全部'}
            </button>
          ))}
        </div>

        {scope === 'today' && (
          <div className="flex items-center gap-1.5">
            <button className="btn-ghost" onClick={() => setDate(addDays(date, -1))} aria-label="前一天">
              ←
            </button>
            <input
              type="date"
              className="input w-[130px] text-xs"
              value={date}
              onChange={(e) => e.target.value && setDate(e.target.value)}
            />
            <button className="btn-ghost" onClick={() => setDate(addDays(date, 1))} aria-label="后一天">
              →
            </button>
          </div>
        )}

        <div className="ml-auto flex items-center gap-2">
          <span className="text-[13px] text-slate-400">{totalCount} 个任务</span>
          <button className="btn-primary" onClick={() => openAdd('todo')}>
            + 新任务
          </button>
        </div>
      </div>

      {/* 看板区 */}
      {isLoading ? (
        <p className="py-24 text-center text-sm text-slate-400">加载中…</p>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={onDragStart}
          onDragOver={onDragOver}
          onDragEnd={onDragEnd}
        >
          <div className="flex gap-3 overflow-x-auto pb-4">
            {COLUMNS.map((status) => (
              <Column
                key={status}
                status={status}
                events={columns[status]}
                onOpen={openEdit}
                onAdd={openAdd}
              />
            ))}
          </div>
          <DragOverlay>{activeEvent ? <CardPreview event={activeEvent} /> : null}</DragOverlay>
        </DndContext>
      )}

      {/* 创建/编辑弹窗 */}
      {dialogOpen && (
        <EventDialog
          event={editing}
          defaultDate={dialogDefaultDate}
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
