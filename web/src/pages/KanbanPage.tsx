import { useEffect, useMemo, useRef, useState } from 'react';
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
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import type { TodoEvent, TaskStatus } from '../lib/types';
import { STATUS_LABELS, PRIORITY_LABELS } from '../lib/types';
import { PRIORITY_TEXT, priorityChipClass } from '../lib/priority';
import { diffDays, doneDate, spanInfo } from '../lib/spans';
import { cadenceOf, collapseRecurring } from '../lib/recurring';
import { occurrence, rule } from '../lib/ruleActions';
import EventDialog from '../components/EventDialog';

const COLUMNS: TaskStatus[] = ['todo', 'in_progress', 'review', 'done'];

const STATUS_ACCENT: Record<TaskStatus, string> = {
  todo: 'bg-ink-faint',
  in_progress: 'bg-clay',
  review: 'bg-lagoon',
  done: 'bg-moss',
};

const PRIORITY_DOT: Record<string, string> = {
  high: 'bg-coral',
  medium: 'bg-clay',
  low: 'bg-lagoon',
};

// 卡片右上角的优先级小牌：样式与今天页共用（lib/priority.ts），
// 「已完成」列里不摘牌子，只压暗 —— 优先级是任务属性，不是待办状态

// 「今天 / 11/14」这种短日期，卡片上比完整 YYYY-MM-DD 好读
function dayLabel(date: string) {
  if (!date) return '';
  if (date === todayStr()) return '今天';
  const [, m, d] = date.split('-');
  return `${Number(m)}/${Number(d)}`;
}

// 看板只做「窗口」，「全部」留给日历/统计/搜索页 ——
// 一个不设边界的看板必然被未来的周期实例填满
type Scope = 'today' | 'week' | 'backlog';

// 每列除了可见卡片，还带两组被收起的东西：
//   future = 未到期（还没到该看它的时候）
//   older  = 更早完成的（Done 列只露最近几条）
//   stale  = 陈年旧账（超期太久，该去回顾页做决定，而不是天天占着今天）
// 阈值与 /review 页保持一致，改一处要改两处
type Folded = { future: TodoEvent[]; older: TodoEvent[]; stale: TodoEvent[]; total: number };

const STALE_DAYS = 14;
type Columns = Record<TaskStatus, TodoEvent[]>;

// 拖进「已完成」但还有未勾子任务时，先把动作挂起，等用户选
type PendingDone = {
  id: number;
  fromCol: TaskStatus;
  position: number;
  event: TodoEvent;
  undone: number;
};

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

function subProgress(event: TodoEvent) {
  const list = event.subtasks || [];
  const done = list.filter((s) => s.completed).length;
  return { done, total: list.length };
}

// ── 看板卡片（可拖拽，卡内可展开子任务）──
function KanbanCard({
  event,
  onOpen,
  onToggleSubtask,
  onContext,
}: {
  event: TodoEvent;
  onOpen: (e: TodoEvent) => void;
  onToggleSubtask: (e: TodoEvent, subtaskId: number) => void;
  onContext: (e: React.MouseEvent, ev: TodoEvent) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: event.id });
  const [expanded, setExpanded] = useState(false);
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };
  const { done: doneSub, total: totalSub } = subProgress(event);
  const pct = totalSub > 0 ? Math.round((doneSub / totalSub) * 100) : 0;
  // 跨天任务：卡片上直接说「第 8/12 天」，跟今天页同一套话术
  const span = spanInfo(event, todayStr());

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={() => onOpen(event)}
      onContextMenu={(e) => onContext(e, event)}
      className="card cursor-grab p-3 active:cursor-grabbing"
    >
      <div className="flex items-start gap-2">
        {event.status === 'done' && (
          <span className="mt-[1px] flex h-[15px] w-[15px] flex-none items-center justify-center rounded-full bg-moss-deep">
            <svg viewBox="0 0 12 12" className="h-2 w-2 fill-none stroke-white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2.5 6.2 4.8 8.5 9.5 3.6" />
            </svg>
          </span>
        )}
        <p
          className={`min-w-0 flex-1 text-[13.5px] leading-[1.45] ${
            event.status === 'done' ? 'text-ink-soft line-through' : 'text-ink'
          }`}
        >
          {event.title}
        </p>
        {event.priority && (
          <span className={`chip flex-none border ${priorityChipClass(event.priority, event.status === 'done')}`}>
            {PRIORITY_TEXT[event.priority]}
          </span>
        )}
      </div>

      <div className="mt-1.5 flex items-center gap-2 text-[11.5px] text-ink-soft">
        <span className="min-w-0 truncate">
          {event.rule_id ? (
            <span className="text-ink-soft" title="周期任务：这里是它的下一期（其余各期折叠了）">
              ↻ {cadenceOf(event) || '周期'} ·{' '}
            </span>
          ) : null}
          {event.category && event.category !== '其他' ? `${event.category} · ` : ''}
          <span className={span?.kind === 'overdue' ? 'text-coral' : undefined}>
            {span ? span.label : dayLabel(event.date)}
          </span>
        </span>
        {totalSub > 0 && (
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              setExpanded((v) => !v);
            }}
            aria-expanded={expanded}
            title="展开子任务"
            className="ml-auto flex flex-none items-center gap-1.5 rounded text-ink-soft transition-colors hover:text-ink-mid"
          >
            <span className="h-1 w-8 overflow-hidden rounded-full bg-line">
              <span className="block h-full rounded-full bg-moss" style={{ width: `${pct}%` }} />
            </span>
            <span className="tabular-nums">
              {doneSub}/{totalSub}
            </span>
          </button>
        )}
      </div>

      {/* 子任务清单：点右上角进度展开，卡内勾选（不跳页、不开弹窗） */}
      {expanded && totalSub > 0 && (
        <ul
          className="mt-2 space-y-0.5 border-t border-line-soft pt-1.5"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
              {(event.subtasks || []).map((st) => (
                <li key={st.id}>
                  <label className="flex cursor-pointer items-start gap-1.5 rounded px-1 py-0.5 hover:bg-paper-deep">
                    <input
                      type="checkbox"
                      className="mt-[3px] h-3 w-3 flex-none accent-moss"
                      checked={st.completed}
                      onChange={() => onToggleSubtask(event, st.id)}
                    />
                    <span
                      className={`min-w-0 break-words text-[11px] leading-4 ${
                        st.completed ? 'text-ink-soft line-through' : 'text-ink-mid'
                      }`}
                    >
                      {st.title}
                    </span>
                  </label>
                </li>
              ))}
      </ul>
      )}
    </div>
  );
}

// 预览卡（DragOverlay 用，无交互）；onOpen 传了就当静态卡用（收起区）
function CardPreview({
  event,
  onOpen,
  dragging,
  onContext,
}: {
  event: TodoEvent;
  onOpen?: (e: TodoEvent) => void;
  dragging?: boolean;
  onContext?: (e: React.MouseEvent, ev: TodoEvent) => void;
}) {
  const { done: doneSub, total: totalSub } = subProgress(event);
  return (
    <div
      onClick={onOpen ? () => onOpen(event) : undefined}
      onContextMenu={onContext ? (e) => onContext(e, event) : undefined}
      className={`card p-3 ${dragging ? 'cursor-grabbing shadow-pop' : 'cursor-pointer opacity-75 hover:opacity-100'}`}
    >
      <div className="flex items-start gap-2">
        <p className="min-w-0 flex-1 text-[13.5px] leading-[1.45] text-ink">
          {event.title}
        </p>
        {event.priority && (
          <span className={`chip flex-none border ${priorityChipClass(event.priority, event.status === 'done')}`}>
            {PRIORITY_TEXT[event.priority]}
          </span>
        )}
      </div>
      <div className="mt-1.5 flex items-center gap-2 text-[11.5px] text-ink-soft">
        <span className="truncate">
          {event.rule_id ? (
            <span title="周期任务：这里是它的下一期（其余各期折叠了）">
              ↻ {cadenceOf(event) || '周期'} ·{' '}
            </span>
          ) : null}
          {event.category && event.category !== '其他' ? `${event.category} · ` : ''}
          {spanInfo(event, todayStr())?.label || dayLabel(event.date)}
        </span>
        {totalSub > 0 && (
          <span className="ml-auto flex flex-none items-center gap-1.5">
            <span className="h-1 w-8 rounded-full bg-line" />
            <span className="tabular-nums">
              {doneSub}/{totalSub}
            </span>
          </span>
        )}
      </div>
    </div>
  );
}

// ── 一排收起：默认只是一行字，不占屏幕；点开才渲染卡片 ──
function CollapseRow({
  label,
  items,
  onOpen,
  onContext,
  hint,
  action,
}: {
  label: string;
  items: TodoEvent[];
  onOpen: (e: TodoEvent) => void;
  onContext: (e: React.MouseEvent, ev: TodoEvent) => void;
  hint?: string;
  action?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  if (items.length === 0) return null;
  return (
    <div>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-[11.5px] text-ink-soft transition-colors hover:bg-paper-deep hover:text-ink-mid"
        >
          <span className={`flex-none text-[9px] transition-transform ${open ? '-rotate-90' : 'rotate-90'}`}>›</span>
          <span className="tabular-nums">{open ? '收起' : `${label} ${items.length}`}</span>
          {hint && !open && <span className="truncate text-[10.5px] text-ink-faint">{hint}</span>}
        </button>
        {!open && action}
      </div>
      {open && (
        <div className="mt-1 space-y-2">
          {items.map((e) => (
            <CardPreview key={e.id} event={e} onOpen={onOpen} onContext={onContext} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── 右键菜单：周期的三个动作和「这一期」的两个动作摆在一起，但要分得开 ──
//
// 看板上一张卡就是「这条规则的下一期」。想跳过某一周、或者不想再做这件事了，
// 拖进已完成是最别扭的路（跳过不是完成）。所以给一个就地菜单：
//   上面一组动这一期（完成 / 跳过），下面一组动整条规则（改规则 / 停掉）。
// 和回顾页、行内勾选共用 lib/ruleActions 里的同一套调用。
function CardMenu({
  event,
  x,
  y,
  busy,
  onAct,
  onClose,
}: {
  event: TodoEvent;
  x: number;
  y: number;
  busy: boolean;
  onAct: (kind: 'complete' | 'skip' | 'stop' | 'change' | 'open') => void;
  onClose: () => void;
}) {
  const recurring = !!event.rule_id;
  const cadence = cadenceOf(event);
  const marked = !!event.canceled_at;
  const left = Math.min(x, window.innerWidth - 208);
  const top = Math.min(y, window.innerHeight - (recurring ? 250 : 150));

  const item =
    'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12.5px] transition-colors disabled:opacity-40';

  return (
    <div className="fixed inset-0 z-[60]" onClick={onClose} onContextMenu={(e) => { e.preventDefault(); onClose(); }}>
      <div
        className="absolute w-52 rounded-xl border border-line bg-white p-1 shadow-pop"
        style={{ left, top }}
        onClick={(e) => e.stopPropagation()}
        role="menu"
      >
        <p className="truncate px-2 pb-1 pt-1 text-[11px] text-ink-faint">
          {recurring ? `↻ ${cadence} 的这一期` : event.title}
        </p>

        <button className={`${item} text-ink hover:bg-paper-deep`} disabled={busy} onClick={() => onAct('complete')}>
          <span className="text-moss-deep">✓</span> {recurring ? '完成这一期' : '完成'}
        </button>
        <button
          className={`${item} text-ink hover:bg-paper-deep`}
          disabled={busy}
          onClick={() => onAct('skip')}
          title={recurring ? '这次不做，下次照常出现' : '决定不做了（不删除，可恢复）'}
        >
          <span className="text-ink-soft">✕</span> {recurring ? '跳过这一期' : '不做'}
          {marked && <span className="ml-auto text-[10.5px] text-ink-faint">已跳过</span>}
        </button>

        {recurring && (
          <>
            <div className="my-1 border-t border-line/70" />
            <p className="px-2 pb-0.5 text-[10.5px] text-ink-faint">动整条规则 · 明天起生效</p>
            <button className={`${item} text-coral hover:bg-coral-soft`} disabled={busy} onClick={() => onAct('change')}>
              <span>↻</span> 改规则…
            </button>
            <button className={`${item} text-coral hover:bg-coral-soft`} disabled={busy} onClick={() => onAct('stop')}>
              <span>⊘</span> 停掉整条周期
            </button>
          </>
        )}

        <div className="my-1 border-t border-line/70" />
        <button className={`${item} text-ink-soft hover:bg-paper-deep`} onClick={() => onAct('open')}>
          打开详情
        </button>
      </div>
    </div>
  );
}

// ── 单列（可放置区）──
// 只渲染「该看的」卡片；未到期 / 陈年旧账 / 更早完成的各收成一行。
// 计数仍然报全量 —— 数字是信息，卡片是噪音，两者不冲突。
function Column({
  status,
  events,
  folded,
  onOpen,
  onAdd,
  onToggleSubtask,
  onContext,
}: {
  status: TaskStatus;
  events: TodoEvent[];
  folded: Folded;
  onOpen: (e: TodoEvent) => void;
  onAdd: (s: TaskStatus) => void;
  onToggleSubtask: (e: TodoEvent, subtaskId: number) => void;
  onContext: (e: React.MouseEvent, ev: TodoEvent) => void;
}) {
  const { setNodeRef } = useDroppable({ id: status });
  const isDone = status === 'done';

  return (
    <div className="flex min-w-[248px] flex-1 flex-col rounded-xl border border-line bg-line-soft/70">
      {/* 列头：色点 + 名称 + 计数（全量，含收起的） */}
      <div className="flex items-center gap-2 px-3 pb-2.5 pt-3">
        <span className={`h-[7px] w-[7px] rounded-full ${STATUS_ACCENT[status]}`} />
        <span className="text-[13px] font-semibold text-ink-mid">{STATUS_LABELS[status]}</span>
        <span className="text-[12px] tabular-nums text-ink-soft">({folded.total})</span>
      </div>
      {/* 卡片区（放置目标） */}
      <div ref={setNodeRef} className="flex-1 space-y-2 px-2">
        <SortableContext items={events.map((e) => e.id)} strategy={verticalListSortingStrategy}>
          {events.map((e) => (
            <KanbanCard key={e.id} event={e} onOpen={onOpen} onToggleSubtask={onToggleSubtask} onContext={onContext} />
          ))}
        </SortableContext>

        {isDone ? (
          <CollapseRow label="更早完成" items={folded.older} onOpen={onOpen} onContext={onContext} />
        ) : (
          <>
            <CollapseRow
              label="陈年旧账"
              items={folded.stale}
              onOpen={onOpen}
              onContext={onContext}
              hint="该做决定了"
              action={
                <Link
                  to="/review"
                  className="flex-none rounded-md px-1.5 py-0.5 text-[10.5px] text-ink-soft ring-1 ring-line transition-colors hover:text-ink-mid"
                >
                  去回顾
                </Link>
              }
            />
            <CollapseRow label="未到期" items={folded.future} onOpen={onOpen} onContext={onContext} />
          </>
        )}

        {events.length === 0 && folded.total === 0 && (
          <p className="px-1 py-3 text-center text-[11.5px] text-ink-faint">空</p>
        )}
      </div>
      {/* 列底：添加任务 */}
      <button
        className="mt-1 flex items-center justify-center gap-1 py-2.5 text-[12px] text-ink-soft transition-colors hover:text-ink-mid"
        onClick={() => onAdd(status)}
      >
        <span className="text-[13px] leading-none">+</span> 添加任务
      </button>
    </div>
  );
}

// ── 拖入「已完成」但有未勾子任务时的确认弹窗 ──
function DoneConfirmDialog({
  pending,
  busy,
  onFinishAll,
  onKeep,
  onCancel,
}: {
  pending: PendingDone;
  busy: boolean;
  onFinishAll: () => void;
  onKeep: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/30 p-4" onClick={onCancel}>
      <div
        className="w-full max-w-sm rounded-xl bg-white p-5 shadow-pop"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <p className="text-sm font-semibold text-ink">这条任务还有 {pending.undone} 条子任务未完成</p>
        <p className="mt-1.5 line-clamp-2 text-xs text-ink-soft">「{pending.event.title}」</p>
        <p className="mt-3 text-xs text-ink-soft">
          移到「已完成」后，子任务默认保持原样。要一起勾完吗？
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <button className="btn-ghost" onClick={onCancel} disabled={busy}>
            取消拖拽
          </button>
          <button className="btn-ghost" onClick={onKeep} disabled={busy}>
            保持原样
          </button>
          <button className="btn-primary" onClick={onFinishAll} disabled={busy}>
            {busy ? '处理中…' : `一起勾完 ${pending.undone} 项`}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function KanbanPage() {
  const [scope, setScope] = useState<Scope>('today');
  const [date, setDate] = useState(todayStr());
  const [columns, setColumns] = useState<Columns>({ todo: [], in_progress: [], review: [], done: [] });
  const [folded, setFolded] = useState<Record<TaskStatus, Folded>>({
    todo: { future: [], older: [], stale: [], total: 0 },
    in_progress: { future: [], older: [], stale: [], total: 0 },
    review: { future: [], older: [], stale: [], total: 0 },
    done: { future: [], older: [], stale: [], total: 0 },
  });
  const [activeId, setActiveId] = useState<number | null>(null);
  const [originCol, setOriginCol] = useState<TaskStatus | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<TodoEvent | null>(null);
  const [defaultStatus, setDefaultStatus] = useState<TaskStatus>('todo');

  const [onlyUnfinishedSub, setOnlyUnfinishedSub] = useState(false);
  const [pendingDone, setPendingDone] = useState<PendingDone | null>(null);
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ event: TodoEvent; x: number; y: number } | null>(null);
  const [menuBusy, setMenuBusy] = useState(false);

  const queryClient = useQueryClient();
  const { data: allEvents, isLoading } = useQuery({ queryKey: ['events'], queryFn: api.getEvents });

  // commitMove 需要插入位置，用 ref 传递避免额外 state 抖动
  const insertIndexRef = useRef(0);

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

  const week = useMemo(() => weekBounds(), []);

  // 窗口过滤：**只看到期日在这个窗口内的活**。
  //   · 未完成 → 看计划终点（end_date 或 date）：逾期的一直算数（那是欠账），
  //     未来的一律不进 —— 否则一个 11/09–11/20 的跨天活会同时挂在十天里
  //   · 已完成 → 看「收尾那天」而不是计划日，否则历史完成项会堆满 Done 列
  //   · 已取消（不做）→ 哪个窗口都不进
  const inScope = useMemo(() => {
    const today = todayStr();
    const base = (e: TodoEvent) => {
      if (e.canceled_at) return false;
      if (e.completed || e.status === 'done') {
        if (scope === 'backlog') return true;
        const d = doneDate(e) || e.date;
        return scope === 'today' ? d === date : d >= week.start && d <= week.end;
      }
      // 未完成看「开工日」而不是截止日：
      // 一个 11/10–11/20 的跨天活，今天正干到第 7 天，不该因为截止日还在前头就被收起来。
      // 反过来说，开工日在未来的活还没轮到，任何一个窗口都不该占屏。
      if (scope === 'today') return e.date <= date;
      if (scope === 'week') return e.date <= week.end;
      return true;
    };
    if (!onlyUnfinishedSub) return base;
    return (e: TodoEvent) => base(e) && (e.subtasks || []).some((s) => !s.completed);
  }, [scope, date, week, onlyUnfinishedSub]);

  useEffect(() => {
    if (!allEvents) return;
    const today = todayStr();

    // 先按窗口筛，再把周期任务折成「每条规则只露下一次」
    const scoped = allEvents.filter(inScope);
    const { visible } = collapseRecurring(scoped, today);

    const grouped: Columns = { todo: [], in_progress: [], review: [], done: [] };
    visible.forEach((e) => grouped[e.status].push(e));

    const nextColumns: Columns = { todo: [], in_progress: [], review: [], done: [] };
    const nextFolded = { ...folded };

    COLUMNS.forEach((c) => {
      const sorted = sortCol(grouped[c]);
      const total = sorted.length;

      if (c === 'done') {
        // Done 列按「最近收尾」排，只渲染最近 5 条，其余收成一行
        const byRecent = [...sorted].sort(
          (a, b) => (doneDate(b) || b.date).localeCompare(doneDate(a) || a.date) || b.id - a.id
        );
        nextColumns[c] = byRecent.slice(0, 5);
        nextFolded[c] = { future: [], older: byRecent.slice(5), stale: [], total };
        return;
      }

      // 其它列分三档：
      //   未到期   → 还没轮到开工，收起来
      //   陈年旧账 → 超期太久，罗列在这儿也只是让人心慌，收起来并指向回顾页
      //   该看的   → 剩下的
      const startsInFuture = (e: TodoEvent) => e.date > today;
      const isStale = (e: TodoEvent) =>
        diffDays(e.end_date && e.end_date > e.date ? e.end_date : e.date, today) > STALE_DAYS;

      nextColumns[c] = sorted.filter((e) => !startsInFuture(e) && !isStale(e));
      nextFolded[c] = {
        future: sorted
          .filter(startsInFuture)
          .sort((a, b) => (a.end_date || a.date).localeCompare(b.end_date || b.date)),
        stale: sorted
          .filter((e) => !startsInFuture(e) && isStale(e))
          .sort((a, b) => a.date.localeCompare(b.date)),
        older: [],
        total,
      };
    });

    setColumns(nextColumns);
    setFolded(nextFolded);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allEvents, inScope]);

  // 卡内勾选单条子任务：回传全量 subtasks（后端做整体替换）
  function toggleSubtask(event: TodoEvent, subtaskId: number) {
    const next = (event.subtasks || []).map((s) => ({
      title: s.title,
      completed: s.id === subtaskId ? !s.completed : s.completed,
    }));
    setBanner(null);
    api.updateEvent(event.id, { subtasks: next }).then(invalidate).catch((err: Error) => setBanner(err.message));
  }

  // 真正提交一次移动（服务端 + 本地乐观更新）
  function commitMove(id: number, fromCol: TaskStatus | null, toCol: TaskStatus, pos: number) {
    if (fromCol && fromCol !== toCol) {
      statusMutation.mutate({ id, status: toCol, position: pos });
    } else {
      reorderMutation.mutate([{ id, position: pos }]);
    }

    setColumns((prev) => {
      const moving = prev[toCol].find((x) => x.id === id) ?? allEvents?.find((x) => x.id === id);
      if (!moving) return prev;
      const without = prev[toCol].filter((x) => x.id !== id);
      const at = Math.min(insertIndexRef.current, without.length);
      const next = [...without.slice(0, at), { ...moving, position: pos }, ...without.slice(at)];
      return { ...prev, [toCol]: sortCol(next) };
    });
  }

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
    const fromCol = originCol;
    setActiveId(null);
    setOriginCol(null);
    if (!over) {
      // 丢到列外：本地可能已被 onDragOver 挪过，拉一次真实数据回正
      invalidate();
      return;
    }
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
    insertIndexRef.current = insertIndex;

    // 跨列拖进「已完成」且子任务没勾完 → 先问一句，不自动勾、也不直接落库
    const moving = allEvents?.find((x) => x.id === id);
    const undoneList = (moving?.subtasks || []).filter((s) => !s.completed);
    if (toCol === 'done' && fromCol && fromCol !== 'done' && moving && undoneList.length > 0) {
      setPendingDone({ id, fromCol, position: pos, event: moving, undone: undoneList.length });
      return;
    }

    commitMove(id, fromCol, toCol, pos);
  }

  async function finishAllSubtasks() {
    if (!pendingDone) return;
    const p = pendingDone;
    setBusy(true);
    setBanner(null);
    try {
      await api.updateStatus(p.id, 'done', p.position);
      await api.updateEvent(p.id, {
        subtasks: (p.event.subtasks || []).map((s) => ({ title: s.title, completed: true })),
      });
    } catch (err) {
      setBanner((err as Error).message);
    } finally {
      setBusy(false);
      setPendingDone(null);
      invalidate();
    }
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

  // ── 右键菜单：一张卡就是「这条规则的下一期」，所以菜单里必须把
  //    「动这一期」和「动整条规则」分成两组，和详情/回顾页共用 lib/ruleActions 的调用 ──
  const openMenu = (e: React.MouseEvent, ev: TodoEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setMenu({ event: ev, x: e.clientX, y: e.clientY });
  };

  async function menuAct(kind: 'complete' | 'skip' | 'stop' | 'change' | 'open') {
    const ev = menu?.event;
    if (!ev) return;

    // 改规则要选周几、要先看影响，面板在详情里；菜单只负责把人送过去
    if (kind === 'open' || kind === 'change') {
      setMenu(null);
      openEdit(ev);
      return;
    }

    if (kind === 'stop' && ev.rule_id) {
      const ok = window.confirm(
        `停掉「${ev.title}」这条周期？\n\n明天起不再生成新的，已经铺到日历上的未来几期会一起收走；` +
          `已经做完的保留，今天及以前的不受影响。\n\n只想跳过这一次，用「跳过这一期」。`
      );
      if (!ok) return;
    }

    setMenuBusy(true);
    setBanner(null);
    try {
      if (kind === 'complete') {
        await occurrence.complete(ev.id);
      } else if (kind === 'skip') {
        await occurrence.skip(ev.id);
        setBanner(`已跳过「${ev.title}」的这一期，下一期照常出现`);
      } else if (kind === 'stop' && ev.rule_id) {
        const r = await rule.stop(ev.rule_id);
        setBanner(`已停掉「${ev.title}」的周期，收走 ${r.closed_instances} 期未完成排期`);
      }
      invalidate();
    } catch (err) {
      setBanner((err as Error).message);
    } finally {
      setMenuBusy(false);
      setMenu(null);
    }
  }

  const dialogDefaultDate = scope === 'today' ? date : todayStr();

  const activeEvent = activeId != null ? allEvents?.find((e) => e.id === activeId) ?? null : null;
  const totalCount = COLUMNS.reduce((n, c) => n + folded[c].total, 0);

  return (
    <div className="min-w-0">
      {/* 工具栏 */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        {/* 范围切换 */}
        <div className="seg">
          {(['today', 'week', 'backlog'] as Scope[]).map((s) => (
            <button
              key={s}
              onClick={() => setScope(s)}
              className={`seg-item ${scope === s ? 'seg-item-on' : ''}`}
              title={
                s === 'backlog'
                  ? '所有还没处理完的（未到期的收在列底，点开才渲染）'
                  : s === 'week'
                  ? '到期日在本周内'
                  : '到期日在今天及以前（逾期的也算）'
              }
            >
              {s === 'today' ? '今天' : s === 'week' ? '本周' : '积压'}
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

        {/* 只看有未完成子任务的 */}
        <button
          onClick={() => setOnlyUnfinishedSub((v) => !v)}
          className={`rounded-lg px-2.5 py-1 text-[13px] ring-1 transition ${
            onlyUnfinishedSub
              ? 'bg-moss-soft text-moss-deep ring-line'
              : 'text-ink-soft ring-line hover:text-ink-mid'
          }`}
          aria-pressed={onlyUnfinishedSub}
          title="只显示还有未勾子任务的任务"
        >
          含未完成子项
        </button>

        <div className="ml-auto flex items-center gap-2">
          <span className="text-[13px] text-ink-soft">{totalCount} 个任务</span>
          <button className="btn-primary" onClick={() => openAdd('todo')}>
            + 新任务
          </button>
        </div>
      </div>

      {banner && (
        <div className="mb-3 rounded-lg bg-coral-soft px-3 py-2 text-xs text-coral ring-1 ring-coral/25">
          {banner}
        </div>
      )}

      {/* 看板区 */}
      {isLoading ? (
        <p className="py-24 text-center text-sm text-ink-soft">加载中…</p>
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
                folded={folded[status]}
                onOpen={openEdit}
                onAdd={openAdd}
                onToggleSubtask={toggleSubtask}
                onContext={openMenu}
              />
            ))}
          </div>
          <DragOverlay>{activeEvent ? <CardPreview event={activeEvent} dragging /> : null}</DragOverlay>
        </DndContext>
      )}

      {/* 拖入已完成前的子任务确认 */}
      {pendingDone && (
        <DoneConfirmDialog
          pending={pendingDone}
          busy={busy}
          onFinishAll={finishAllSubtasks}
          onKeep={() => {
            commitMove(pendingDone.id, pendingDone.fromCol, 'done', pendingDone.position);
            setPendingDone(null);
          }}
          onCancel={() => {
            setPendingDone(null);
            invalidate();
          }}
        />
      )}

      {/* 右键菜单：跳过一期 / 停掉整条周期，不用先拖进已完成 */}
      {menu && (
        <CardMenu
          event={menu.event}
          x={menu.x}
          y={menu.y}
          busy={menuBusy}
          onAct={menuAct}
          onClose={() => setMenu(null)}
        />
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
