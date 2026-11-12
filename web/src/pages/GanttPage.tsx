import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { GanttBoard, GanttTask, TaskStatus, TodoEvent } from '../lib/types';
import { STATUS_LABELS } from '../lib/types';
import GanttTaskDialog from '../components/GanttTaskDialog';
import EventDialog from '../components/EventDialog';

// ── 版面常量 ──
const LEFT_W = 292;
const HEADER_H = 46;
const GROUP_H = 30;
const ROW_H = 34;
const BAR_H = 18;
const DAY_MS = 86400000;

type DragMode = 'move' | 'l' | 'r';
type DragState = { id: number; mode: DragMode; delta: number };

type Row =
  | { kind: 'group'; key: string; label: string; color: string | null; count: number; top: number }
  | { kind: 'task'; task: GanttTask; top: number };

// ── 日期工具（UTC 天序号，避开时区）──
function idx(s: string) {
  const [y, m, d] = s.slice(0, 10).split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / DAY_MS);
}
function iso(i: number) {
  return new Date(i * DAY_MS).toISOString().slice(0, 10);
}
function addDays(s: string, n: number) {
  return iso(idx(s) + n);
}
function mondayOf(s: string) {
  const i = idx(s);
  const dow = new Date(i * DAY_MS).getUTCDay();
  return iso(i - ((dow + 6) % 7));
}
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
const DOW = ['日', '一', '二', '三', '四', '五', '六'];

// ── 状态配色（纸感：浅底 + 实色进度）──
const BAR_STYLE: Record<TaskStatus, { shell: string; fill: string; label: string }> = {
  todo: { shell: 'bg-[#EFE9DD] border-[#DCD3C2]', fill: 'bg-[#B9AE99]', label: 'text-ink-mid' },
  in_progress: { shell: 'bg-lagoon-soft border-lagoon/40', fill: 'bg-lagoon', label: 'text-[#2C4E75]' },
  review: { shell: 'bg-clay-soft border-clay/40', fill: 'bg-clay', label: 'text-[#7A5210]' },
  done: { shell: 'bg-moss-soft border-moss/30', fill: 'bg-moss', label: 'text-moss-deep' },
};
const STATUS_DOT: Record<TaskStatus, string> = {
  todo: 'bg-ink-faint',
  in_progress: 'bg-lagoon',
  review: 'bg-clay',
  done: 'bg-moss',
};

export default function GanttPage() {
  const queryClient = useQueryClient();

  // 视图
  const [anchor, setAnchor] = useState(() => mondayOf(todayStr()));
  const [weeks, setWeeks] = useState(8);
  const [dayWidth, setDayWidth] = useState(26);
  const [projectFilter, setProjectFilter] = useState<string>('');
  const [showDone, setShowDone] = useState(true);
  const [showRecurring, setShowRecurring] = useState(false);
  const [cascade, setCascade] = useState(true);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  // 交互
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [dialog, setDialog] = useState<{ open: boolean; event: TodoEvent | null }>({ open: false, event: null });
  const [linkFrom, setLinkFrom] = useState<number | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmAuto, setConfirmAuto] = useState(false);

  const dragRef = useRef<{ id: number; mode: DragMode; x0: number; start: string; end: string; delta: number } | null>(null);
  const suppressClick = useRef(false);

  const { data: board, isLoading } = useQuery<GanttBoard>({
    queryKey: ['gantt', showRecurring],
    queryFn: () => api.getGantt({ includeRecurring: showRecurring }),
  });
  const { data: allEvents } = useQuery({ queryKey: ['events'], queryFn: api.getEvents });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['gantt'] });
    queryClient.invalidateQueries({ queryKey: ['events'] });
  };

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    if (!linkFrom) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLinkFrom(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [linkFrom]);

  const tasks = useMemo(() => board?.tasks ?? [], [board]);
  const taskMap = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);

  const rangeStart = anchor;
  const rangeEnd = addDays(anchor, weeks * 7 - 1);
  const startIdx = idx(rangeStart);
  const totalDays = weeks * 7;
  const totalWidth = totalDays * dayWidth;
  const todayI = idx(todayStr());

  // 项目清单（用于筛选下拉）
  const projectOptions = useMemo(() => {
    const map = new Map<number, string>();
    tasks.forEach((t) => {
      if (t.project_id != null && t.project_name) map.set(t.project_id, t.project_name);
    });
    return [...map.entries()];
  }, [tasks]);

  // 可见任务 → 按项目分组 → 展开成行（含分组头）
  const { rows, rowTop, contentH, visibleCount, offscreen } = useMemo(() => {
    const inRange = (t: GanttTask) => idx(t.end) >= startIdx && idx(t.start) <= startIdx + totalDays - 1;
    const pass = (t: GanttTask) =>
      (!projectFilter || String(t.project_id) === projectFilter) && (showDone || t.status !== 'done');

    const all = tasks.filter(pass);
    const shown = all.filter(inRange);

    const groups = new Map<string, { key: string; label: string; color: string | null; tasks: GanttTask[] }>();
    // 先按 board.projects 的顺序铺分组，再补「未归属」
    (board?.projects ?? []).forEach((p) => {
      if (all.some((t) => t.project_id === p.id)) {
        groups.set(String(p.id), { key: String(p.id), label: p.name, color: p.color, tasks: [] });
      }
    });
    all.forEach((t) => {
      const key = t.project_id != null ? String(t.project_id) : 'none';
      if (!groups.has(key)) {
        groups.set(key, { key, label: t.project_name || '未归属项目', color: t.project_color, tasks: [] });
      }
      groups.get(key)!.tasks.push(t);
    });

    const rows: Row[] = [];
    const rowTop = new Map<number, number>();
    let top = 0;
    groups.forEach((g) => {
      const visibleInGroup = g.tasks.filter(inRange);
      if (visibleInGroup.length === 0) return;
      rows.push({ kind: 'group', key: g.key, label: g.label, color: g.color, count: visibleInGroup.length, top });
      top += GROUP_H;
      if (collapsed[g.key]) return;
      visibleInGroup
        .sort((a, b) => idx(a.start) - idx(b.start) || a.id - b.id)
        .forEach((task) => {
          rows.push({ kind: 'task', task, top });
          rowTop.set(task.id, top);
          top += ROW_H;
        });
    });

    return { rows, rowTop, contentH: Math.max(top, 80), visibleCount: shown.length, offscreen: all.length - shown.length };
  }, [tasks, board, projectFilter, showDone, collapsed, startIdx, totalDays]);

  const monthSegments = useMemo(() => {
    const out: { label: string; x: number; w: number }[] = [];
    let i = startIdx;
    const end = startIdx + totalDays;
    while (i < end) {
      const d = new Date(i * DAY_MS);
      const y = d.getUTCFullYear();
      const m = d.getUTCMonth();
      let j = i;
      while (j < end && new Date(j * DAY_MS).getUTCMonth() === m) j++;
      out.push({ label: `${y}年${m + 1}月`, x: (i - startIdx) * dayWidth, w: (j - i) * dayWidth });
      i = j;
    }
    return out;
  }, [startIdx, totalDays, dayWidth]);

  const weekendRects = useMemo(() => {
    const out: { x: number; w: number }[] = [];
    for (let i = 0; i < totalDays; i += 1) {
      const dow = new Date((startIdx + i) * DAY_MS).getUTCDay();
      if (dow === 0 || dow === 6) out.push({ x: i * dayWidth, w: dayWidth });
    }
    return out;
  }, [startIdx, totalDays, dayWidth]);

  const todayX = (todayI - startIdx) * dayWidth;

  // ── 几何 ──
  function barGeom(t: GanttTask, s = t.start, e = t.end) {
    const x0 = (idx(s) - startIdx) * dayWidth;
    const w = Math.max((idx(e) - idx(s) + 1) * dayWidth - 2, 8);
    return { x0, w };
  }

  function dragPreview(t: GanttTask) {
    if (!drag || drag.id !== t.id) return { start: t.start, end: t.end };
    const d = dragRef.current;
    if (!d) return { start: t.start, end: t.end };
    const delta = d.delta;
    if (drag.mode === 'move') return { start: addDays(d.start, delta), end: addDays(d.end, delta) };
    if (drag.mode === 'l') {
      let s = addDays(d.start, delta);
      if (idx(s) > idx(d.end)) s = d.end;
      return { start: s, end: d.end };
    }
    let e = addDays(d.end, delta);
    if (idx(e) < idx(d.start)) e = d.start;
    return { start: d.start, end: e };
  }

  // ── 拖拽 ──
  function startDrag(e: React.PointerEvent, task: GanttTask, mode: DragMode) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    if (linkFrom) return;
    dragRef.current = { id: task.id, mode, x0: e.clientX, start: task.start, end: task.end, delta: 0 };
    setDrag({ id: task.id, mode, delta: 0 });
  }

  const dragging = drag != null;
  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const delta = Math.round((e.clientX - d.x0) / dayWidth);
      if (delta === d.delta) return;
      d.delta = delta;
      setDrag((prev) => (prev ? { ...prev, delta } : prev));
    };
    const onUp = async () => {
      const d = dragRef.current;
      dragRef.current = null;
      setDrag(null);
      if (!d || d.delta === 0) return;
      const delta = d.delta;
      // 拖过之后浏览器还会补一个 click，别让它顺手把详情弹窗也打开
      suppressClick.current = true;
      setTimeout(() => { suppressClick.current = false; }, 0);
      let s = d.start;
      let en = d.end;
      if (d.mode === 'move') {
        s = addDays(d.start, delta);
        en = addDays(d.end, delta);
      } else if (d.mode === 'l') {
        s = addDays(d.start, delta);
        if (idx(s) > idx(en)) s = en;
      } else {
        en = addDays(d.end, delta);
        if (idx(en) < idx(s)) en = s;
      }
      // 乐观更新当前条，随后由 refetch 校正级联结果
      queryClient.setQueryData<GanttBoard>(['gantt', showRecurring], (old) => {
        if (!old) return old;
        return {
          ...old,
          tasks: old.tasks.map((t) =>
            t.id === d.id ? { ...t, start: s, end: en, duration: idx(en) - idx(s) + 1 } : t
          ),
        };
      });
      try {
        const r = await api.moveGanttTask(d.id, { start: s, end: en, cascade });
        if (r.cascaded > 0) setToast(`已顺延 ${r.cascaded} 个后续任务`);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        invalidate();
      }
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [dragging, dayWidth, cascade, queryClient, showRecurring]);

  // ── 点击任务条：连依赖 / 打开详情 ──
  async function onBarClick(task: GanttTask) {
    if (linkFrom != null) {
      if (linkFrom === task.id) {
        setLinkFrom(null);
        return;
      }
      const fromTitle = taskMap.get(linkFrom)?.title ?? '';
      try {
        const r = await api.addGanttDependency({ event_id: task.id, depends_on: linkFrom, type: 'FS' });
        setToast(
          r.cascaded > 0
            ? `「${fromTitle}」→「${task.title}」已连上，顺延了 ${r.cascaded} 个任务`
            : `「${fromTitle}」→「${task.title}」已连上`
        );
        invalidate();
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLinkFrom(null);
      }
      return;
    }
    setSelectedId(task.id);
  }

  async function runAutoSchedule() {
    setConfirmAuto(false);
    try {
      const r = await api.autoSchedule();
      setToast(r.cascaded > 0 ? `自动排程完成，移动了 ${r.cascaded} 个任务` : '排期已经是最紧凑的了，没有任务需要移动');
      invalidate();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  const selectedTask = selectedId != null ? taskMap.get(selectedId) ?? null : null;

  // 依赖连线
  const links = useMemo(() => {
    if (!board) return [];
    const out: { d: string; critical: boolean; key: string }[] = [];
    board.deps.forEach((edge) => {
      const from = taskMap.get(edge.from);
      const to = taskMap.get(edge.to);
      if (!from || !to) return;
      const fyTop = rowTop.get(from.id);
      const tyTop = rowTop.get(to.id);
      if (fyTop == null || tyTop == null) return;
      const fy = fyTop + ROW_H / 2;
      const ty = tyTop + ROW_H / 2;
      const fg = barGeom(from);
      const tg = barGeom(to);
      const startAtEnd = edge.type === 'FS' || edge.type === 'FF';
      const sx = startAtEnd ? fg.x0 + fg.w : fg.x0;
      const tx = tg.x0;
      const gap = 9;
      let d: string;
      if (tx >= sx + gap * 2) {
        d = `M ${sx} ${fy} H ${sx + gap} V ${ty} H ${tx}`;
      } else {
        const midY = fy + (ty >= fy ? 12 : -12);
        d = `M ${sx} ${fy} H ${sx + gap} V ${midY} H ${Math.min(tx - gap, sx + gap)} V ${ty} H ${tx}`;
      }
      out.push({ d, critical: from.isCritical && to.isCritical, key: `${edge.from}-${edge.to}` });
    });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board, taskMap, rowTop, startIdx, dayWidth]);

  if (isLoading) return <p className="py-24 text-center text-sm text-ink-soft">加载中…</p>;

  const hasAnyTask = tasks.length > 0;

  return (
    <div className="min-w-0">
      {/* ── 工具栏 ── */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="seg">
          {[4, 8, 12].map((w) => (
            <button key={w} className={`seg-item ${weeks === w ? 'seg-item-on' : ''}`} onClick={() => setWeeks(w)}>
              {w} 周
            </button>
          ))}
        </div>

        <div className="flex items-center gap-0.5">
          <button className="btn-ghost px-2" onClick={() => setAnchor(addDays(anchor, -7))} aria-label="上一周">←</button>
          <button className="btn-ghost px-2 text-[12px]" onClick={() => setAnchor(mondayOf(todayStr()))}>今天</button>
          <button className="btn-ghost px-2" onClick={() => setAnchor(addDays(anchor, 7))} aria-label="下一周">→</button>
        </div>
        <span className="hidden text-[11.5px] tabular-nums text-ink-soft xl:inline">
          {rangeStart.slice(5)} ~ {rangeEnd.slice(5)}
        </span>

        <div className="seg">
          {[
            { w: 18, l: '紧凑' },
            { w: 26, l: '标准' },
            { w: 34, l: '宽松' },
          ].map((o) => (
            <button key={o.w} className={`seg-item ${dayWidth === o.w ? 'seg-item-on' : ''}`} onClick={() => setDayWidth(o.w)}>
              {o.l}
            </button>
          ))}
        </div>

        <select
          className="h-8 rounded-lg border border-line bg-white/70 px-2 text-[12px] text-ink-mid outline-none"
          value={projectFilter}
          onChange={(e) => setProjectFilter(e.target.value)}
        >
          <option value="">全部项目</option>
          {projectOptions.map(([id, name]) => (
            <option key={id} value={id}>{name}</option>
          ))}
        </select>

        <button
          onClick={() => setShowDone((v) => !v)}
          className={`rounded-lg px-2.5 py-1 text-[12.5px] ring-1 transition ${
            showDone ? 'bg-paper-deep text-ink-mid ring-line' : 'text-ink-soft ring-line hover:text-ink-mid'
          }`}
          title="是否显示已完成任务"
        >
          已完成
        </button>
        <button
          onClick={() => setShowRecurring((v) => !v)}
          className={`rounded-lg px-2.5 py-1 text-[12.5px] ring-1 transition ${
            showRecurring ? 'bg-paper-deep text-ink-mid ring-line' : 'text-ink-soft ring-line hover:text-ink-mid'
          }`}
          title="显示周期任务（每天/每周重复的那些实例）"
        >
          周期实例
        </button>
        <button
          onClick={() => setCascade((v) => !v)}
          className={`rounded-lg px-2.5 py-1 text-[12.5px] ring-1 transition ${
            cascade ? 'bg-moss-soft text-moss-deep ring-moss/25' : 'text-ink-soft ring-line hover:text-ink-mid'
          }`}
          title="移动任务时，后面的任务自动顺延"
        >
          级联顺延
        </button>

        <div className="ml-auto flex items-center gap-2">
          <button className="btn-ghost text-[12.5px]" onClick={() => setConfirmAuto(true)}>自动排程</button>
          <button
            className="btn-primary"
            onClick={() => {
              setSelectedId(null);
              setAnchor(mondayOf(todayStr()));
              setDialog({ open: true, event: null });
            }}
          >
            + 新任务
          </button>
        </div>
      </div>

      {/* 连依赖提示 / 错误 / 提示 */}
      {linkFrom != null && (
        <div className="mb-2 flex items-center gap-2 rounded-lg bg-moss-soft px-3 py-2 text-[12px] text-moss-deep">
          <span className="font-medium">连依赖：</span>
          点一个要排在「{taskMap.get(linkFrom)?.title}」之后的任务
          <button className="ml-auto underline underline-offset-2" onClick={() => setLinkFrom(null)}>Esc 取消</button>
        </div>
      )}
      {error && (
        <div className="mb-2 flex items-center gap-2 rounded-lg bg-coral-soft px-3 py-2 text-[12px] text-coral">
          {error}
          <button className="ml-auto" onClick={() => setError(null)}>✕</button>
        </div>
      )}
      {toast && (
        <div className="mb-2 flex items-center gap-2 rounded-lg bg-lagoon-soft px-3 py-2 text-[12px] text-[#2C4E75]">
          {toast}
          <button className="ml-auto" onClick={() => setToast(null)}>✕</button>
        </div>
      )}

      {!hasAnyTask ? (
        <div className="card flex flex-col items-center gap-2 py-20 text-center">
          <p className="text-sm text-ink-mid">还没有可以排期的任务</p>
          <p className="max-w-sm text-[12px] leading-5 text-ink-soft">
            甘特图看的是有开始/结束的长周期任务。先建几条任务、给它们填上结束日期，再来这里连依赖。
          </p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-auto" style={{ maxHeight: 'calc(100vh - 226px)' }}>
            <div className="relative" style={{ width: LEFT_W + totalWidth }}>
              {/* ── 时间轴表头 ── */}
              <div className="sticky top-0 z-30 flex" style={{ height: HEADER_H }}>
                <div
                  className="sticky left-0 z-40 flex flex-none items-end border-b border-r border-line bg-paper px-3 pb-1.5"
                  style={{ width: LEFT_W }}
                >
                  <span className="text-[11.5px] font-semibold text-ink-mid">任务</span>
                  <span className="ml-auto text-[10.5px] text-ink-faint">{visibleCount} 条在视野内</span>
                </div>
                <div className="relative flex-none border-b border-line bg-paper" style={{ width: totalWidth }}>
                  {/* 月 */}
                  <div className="relative h-[22px]">
                    {monthSegments.map((m) => (
                      <div
                        key={m.label + m.x}
                        className="absolute top-0 flex h-full items-center border-l border-line pl-1.5 text-[10.5px] font-medium text-ink-soft"
                        style={{ left: m.x, width: m.w }}
                      >
                        {m.w > 46 ? m.label : ''}
                      </div>
                    ))}
                  </div>
                  {/* 日 */}
                  <div className="relative flex h-[24px]">
                    {Array.from({ length: totalDays }).map((_, i) => {
                      const dayI = startIdx + i;
                      const dow = new Date(dayI * DAY_MS).getUTCDay();
                      const isToday = dayI === todayI;
                      const weekend = dow === 0 || dow === 6;
                      return (
                        <div
                          key={i}
                          className={`flex flex-none flex-col items-center justify-center border-l border-line-soft text-[10px] leading-none ${
                            weekend ? 'bg-paper-deep/70 text-ink-soft' : 'text-ink-faint'
                          }`}
                          style={{ width: dayWidth }}
                        >
                          {dayWidth >= 22 ? (
                            <span
                              className={`tabular-nums ${
                                isToday ? 'flex h-[15px] w-[15px] items-center justify-center rounded-full bg-moss-deep text-white' : ''
                              }`}
                            >
                              {new Date(dayI * DAY_MS).getUTCDate()}
                            </span>
                          ) : (
                            dow === 1 && <span className="text-[9px]">{Number(mondayOf(iso(dayI)).slice(8))}</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* ── 网格背景（周末底色 / 月分隔 / 今日线）── */}
              <div
                className="pointer-events-none absolute z-0"
                style={{ left: LEFT_W, top: HEADER_H, width: totalWidth, height: contentH }}
              >
                {weekendRects.map((r, i) => (
                  <div key={i} className="absolute inset-y-0 bg-[#F3EFE6]/60" style={{ left: r.x, width: r.w }} />
                ))}
                {monthSegments.map((m) => (
                  <div key={`l${m.x}`} className="absolute inset-y-0 w-px bg-line" style={{ left: m.x }} />
                ))}
                {todayX >= 0 && todayX <= totalWidth && (
                  <div className="absolute inset-y-0 w-px bg-moss/45" style={{ left: todayX }} />
                )}
              </div>

              {/* ── 行 ── */}
              {rows.map((row) =>
                row.kind === 'group' ? (
                  <div key={`g-${row.key}`} className="flex" style={{ height: GROUP_H }}>
                    <button
                      className="sticky left-0 z-20 flex flex-none items-center gap-1.5 border-r border-line bg-paper-deep px-2 text-left"
                      style={{ width: LEFT_W }}
                      onClick={() => setCollapsed((c) => ({ ...c, [row.key]: !c[row.key] }))}
                    >
                      <span className={`text-[9px] text-ink-soft transition-transform ${collapsed[row.key] ? '' : 'rotate-90'}`}>▶</span>
                      <span className="h-2 w-2 flex-none rounded-[2px]" style={{ background: row.color || '#B5AEA3' }} />
                      <span className="min-w-0 flex-1 truncate text-[11.5px] font-semibold text-ink-mid">{row.label}</span>
                      <span className="flex-none text-[10.5px] tabular-nums text-ink-faint">{row.count}</span>
                    </button>
                    <div className="flex-none border-b border-line/60 bg-paper-deep/40" style={{ width: totalWidth }} />
                  </div>
                ) : (
                  <TaskRow
                    key={`t-${row.task.id}`}
                    task={row.task}
                    selected={selectedId === row.task.id}
                    linkFrom={linkFrom}
                    preview={dragPreview(row.task)}
                    geom={barGeom(row.task, dragPreview(row.task).start, dragPreview(row.task).end)}
                    totalWidth={totalWidth}
                    dragging={drag?.id === row.task.id}
                    onOpen={() => {
                      if (!suppressClick.current) onBarClick(row.task);
                    }}
                    onStartDrag={(e, mode) => startDrag(e, row.task, mode)}
                    onStartLink={() => setLinkFrom(row.task.id)}
                  />
                )
              )}

              {rows.length === 0 && (
                <div className="flex" style={{ height: 96 }}>
                  <div className="sticky left-0 z-20 flex flex-none items-center border-r border-line bg-white px-3 text-[12px] text-ink-soft" style={{ width: LEFT_W }}>
                    这个时间段没有任务
                  </div>
                  <div className="flex flex-none items-center px-4 text-[12px] text-ink-faint" style={{ width: totalWidth }}>
                    {offscreen > 0 ? `另有 ${offscreen} 条在视野外，点「今天」或翻页查看` : '换个时间段看看'}
                  </div>
                </div>
              )}

              {/* ── 依赖连线 ── */}
              <svg
                className="pointer-events-none absolute z-[15]"
                style={{ left: LEFT_W, top: HEADER_H, width: totalWidth, height: contentH }}
              >
                {links.map((l) => (
                  <g key={l.key}>
                    <path
                      d={l.d}
                      fill="none"
                      stroke={l.critical ? '#C9503A' : '#B5AEA3'}
                      strokeWidth={l.critical ? 1.4 : 1.1}
                      strokeDasharray={l.critical ? undefined : '3 2'}
                    />
                    <ArrowHead d={l.d} critical={l.critical} />
                  </g>
                ))}
              </svg>
            </div>
          </div>
        </div>
      )}

      {/* 图例 */}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] text-ink-soft">
        {(['todo', 'in_progress', 'review', 'done'] as TaskStatus[]).map((s) => (
          <span key={s} className="flex items-center gap-1.5">
            <span className={`h-2.5 w-5 rounded-[3px] border ${BAR_STYLE[s].shell}`}>
              <span className={`block h-full w-1/2 rounded-l-[2px] ${BAR_STYLE[s].fill}`} />
            </span>
            {STATUS_LABELS[s]}
          </span>
        ))}
        <span className="flex items-center gap-1.5">
          <svg width="26" height="8" viewBox="0 0 26 8"><path d="M1 4h18" stroke="#C9503A" strokeWidth="1.4" /><path d="M20 1l5 3-5 3z" fill="#C9503A" /></svg>
          关键路径
        </span>
        <span className="ml-auto">
          拖任务条移动 · 拖两端改工期 · 悬停后点右侧圆点连依赖
        </span>
      </div>

      {/* 自动排程确认 */}
      {confirmAuto && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-ink/25 p-4" onClick={() => setConfirmAuto(false)}>
          <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-pop" onClick={(e) => e.stopPropagation()}>
            <p className="text-sm font-semibold text-ink">按依赖重新排程？</p>
            <p className="mt-1.5 text-[12px] leading-5 text-ink-soft">
              所有有前置关系的任务会紧贴着前一个任务排列（可以往前挪，不只往后推）。没有依赖的任务不动。
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button className="btn-ghost" onClick={() => setConfirmAuto(false)}>取消</button>
              <button className="btn-primary" onClick={runAutoSchedule}>开始排程</button>
            </div>
          </div>
        </div>
      )}

      {/* 任务详情 */}
      {selectedTask && (
        <GanttTaskDialog
          task={selectedTask}
          tasks={tasks}
          onClose={() => setSelectedId(null)}
          onChanged={(msg) => {
            if (msg) setToast(msg);
            invalidate();
          }}
          onEditFull={() => {
            const ev = allEvents?.find((e) => e.id === selectedTask.id) ?? null;
            if (ev) {
              setSelectedId(null);
              setDialog({ open: true, event: ev });
            } else {
              setError('这条任务暂时读不到详情，请刷新后再试');
            }
          }}
        />
      )}

      {/* 完整编辑（复用全局 EventDialog，可设结束日期） */}
      {dialog.open && (
        <EventDialog
          event={dialog.event}
          defaultDate={todayStr()}
          defaultEndDate={addDays(todayStr(), 3)}
          onClose={() => setDialog({ open: false, event: null })}
          onSaved={() => {
            setDialog({ open: false, event: null });
            invalidate();
          }}
        />
      )}
    </div>
  );
}

// ── 单行任务 ──
function TaskRow({
  task,
  selected,
  linkFrom,
  preview,
  geom,
  totalWidth,
  dragging,
  onOpen,
  onStartDrag,
  onStartLink,
}: {
  task: GanttTask;
  selected: boolean;
  linkFrom: number | null;
  preview: { start: string; end: string };
  geom: { x0: number; w: number };
  totalWidth: number;
  dragging: boolean;
  onOpen: () => void;
  onStartDrag: (e: React.PointerEvent, mode: DragMode) => void;
  onStartLink: () => void;
}) {
  const style = BAR_STYLE[task.status];
  const isLinkTarget = linkFrom != null && linkFrom !== task.id;
  return (
    <div className={`group flex ${selected ? 'bg-moss-soft/25' : ''}`} style={{ height: ROW_H }}>
      <button
        className="sticky left-0 z-20 flex flex-none items-center gap-2 border-r border-line bg-white px-3 text-left transition-colors hover:bg-paper"
        style={{ width: LEFT_W }}
        onClick={onOpen}
        title={`${task.title}　${task.start} → ${task.end}（${task.duration} 天）`}
      >
        <span className={`h-[6px] w-[6px] flex-none rounded-full ${STATUS_DOT[task.status]}`} />
        <span className={`min-w-0 flex-1 truncate text-[12.5px] ${task.status === 'done' ? 'text-ink-soft line-through' : 'text-ink'}`}>
          {task.title}
        </span>
        {task.isCritical && <span className="h-1.5 w-1.5 flex-none rounded-full bg-coral" title="关键路径" />}
        <span className="w-7 flex-none text-right text-[10px] tabular-nums text-ink-faint">{task.progress}%</span>
      </button>

      <div className="relative flex-none" style={{ width: totalWidth }}>
        {/* 任务条 */}
        <div
          className={`absolute flex items-center gap-1 rounded-[5px] border ${style.shell} ${
            task.isCritical ? 'ring-1 ring-coral/50' : ''
          } ${dragging ? 'shadow-pop' : ''} ${isLinkTarget && linkFrom != null ? 'ring-2 ring-moss/60' : ''} cursor-grab active:cursor-grabbing`}
          style={{ left: geom.x0, top: (ROW_H - BAR_H) / 2, width: geom.w, height: BAR_H }}
          onPointerDown={(e) => onStartDrag(e, 'move')}
          onClick={(e) => {
            e.stopPropagation();
            onOpen();
          }}
          title={`${task.title}\n${preview.start} → ${preview.end}`}
        >
          {/* 进度填充 */}
          <span
            className={`absolute inset-y-0 left-0 rounded-l-[4px] opacity-70 ${style.fill}`}
            style={{ width: `${task.progress}%` }}
          />
          {/* 左侧拉伸把手 */}
          <span
            className="absolute inset-y-0 -left-1 z-10 w-2 cursor-col-resize"
            onPointerDown={(e) => onStartDrag(e, 'l')}
          />
          {geom.w > 74 && (
            <span className={`relative z-[1] truncate px-1.5 text-[10.5px] ${style.label}`}>
              {task.title}
            </span>
          )}
          {/* 右侧拉伸把手 + 连依赖圆点 */}
          <span
            className="absolute inset-y-0 -right-1 z-10 w-2 cursor-col-resize"
            onPointerDown={(e) => onStartDrag(e, 'r')}
          />
          <button
            type="button"
            className="absolute -right-[13px] top-1/2 z-20 h-[9px] w-[9px] -translate-y-1/2 rounded-full border border-moss bg-white opacity-0 transition-opacity hover:bg-moss group-hover:opacity-100"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onStartLink();
            }}
            title="从这里拖出一条依赖（点一下，再点后续任务）"
            aria-label="连依赖"
          />
        </div>
      </div>
    </div>
  );
}

// 箭头（按路径最后一段方向指向右）
function ArrowHead({ d, critical }: { d: string; critical: boolean }) {
  const m = d.match(/H ([\d.-]+) ([\d.]+)$/);
  if (!m) return null;
  const x = Number(m[1]);
  const y = Number(m[2]);
  return <polygon points={`${x},${y} ${x - 5},${y - 3} ${x - 5},${y + 3}`} fill={critical ? '#C9503A' : '#B5AEA3'} />;
}
