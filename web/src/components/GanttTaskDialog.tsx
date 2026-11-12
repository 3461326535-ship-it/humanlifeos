import { useMemo, useState } from 'react';
import { api } from '../lib/api';
import type { GanttTask, DepType } from '../lib/types';
import { DEP_LABELS, DEP_SHORT, STATUS_LABELS } from '../lib/types';

function dayDiff(a: string, b: string) {
  const idx = (s: string) => {
    const [y, m, d] = s.slice(0, 10).split('-').map(Number);
    return Math.round(Date.UTC(y, m - 1, d) / 86400000);
  };
  return idx(b) - idx(a);
}

const STATUS_DOT: Record<string, string> = {
  todo: 'bg-ink-faint',
  in_progress: 'bg-lagoon',
  review: 'bg-clay',
  done: 'bg-moss',
};

export default function GanttTaskDialog({
  task,
  tasks,
  onClose,
  onChanged,
  onEditFull,
  onAddMilestone,
}: {
  task: GanttTask;
  tasks: GanttTask[];
  onClose: () => void;
  onChanged: (msg?: string) => void;
  onEditFull: () => void;
  onAddMilestone: () => void;
}) {
  const [start, setStart] = useState(task.start);
  const [end, setEnd] = useState(task.end);
  const [milestone, setMilestone] = useState(!!task.milestone);
  const [status, setStatus] = useState(task.status);
  const [projectId, setProjectId] = useState<string>(task.project_id != null ? String(task.project_id) : '');
  const [title, setTitle] = useState(task.title);
  const [addOpen, setAddOpen] = useState(false);
  const [newType, setNewType] = useState<DepType>('FS');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const taskMap = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);
  const projects = useMemo(() => {
    const map = new Map<number, string>();
    tasks.forEach((t) => {
      if (t.project_id != null && t.project_name) map.set(t.project_id, t.project_name);
    });
    return [...map.entries()];
  }, [tasks]);

  const candidates = useMemo(
    () => tasks.filter((t) => t.id !== task.id && !task.deps.some((d) => d.id === t.id)),
    [tasks, task]
  );

  const duration = milestone ? 1 : dayDiff(start, end) + 1;
  const dirty =
    start !== task.start || (milestone ? start : end) !== task.end || milestone !== task.milestone ||
    status !== task.status ||
    (projectId ? Number(projectId) : null) !== task.project_id || title.trim() !== task.title;

  async function save() {
    if (!title.trim()) return setError('标题不能为空');
    if (!start) return setError('开始日期不能为空');
    if (!milestone && end < start) return setError('结束日期不能早于开始日期');
    setBusy(true);
    setError('');
    let msg = '已保存';
    try {
      const endVal = milestone ? start : end;
      if (start !== task.start || endVal !== task.end || milestone !== task.milestone) {
        const r = await api.moveGanttTask(task.id, { start, end: endVal, cascade: true, milestone });
        if (r.cascaded > 0) msg = `已保存，顺延了 ${r.cascaded} 个后续任务`;
      }
      if (
        status !== task.status ||
        (projectId ? Number(projectId) : null) !== task.project_id ||
        title.trim() !== task.title
      ) {
        await api.updateEvent(task.id, {
          title: title.trim(),
          status,
          project_id: projectId ? Number(projectId) : null,
        });
      }
      onChanged(msg);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function addDep(dependsOn: number) {
    setBusy(true);
    setError('');
    try {
      const r = await api.addGanttDependency({ event_id: task.id, depends_on: dependsOn, type: newType });
      setAddOpen(false);
      onChanged(r.cascaded > 0 ? `已加依赖，顺延了 ${r.cascaded} 个任务` : '已加依赖');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function removeDep(dependsOn: number) {
    setBusy(true);
    try {
      await api.deleteGanttDependency(task.id, dependsOn);
      onChanged('已移除依赖');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function changeDepType(dependsOn: number, type: DepType) {
    setBusy(true);
    try {
      await api.updateGanttDependency(task.id, dependsOn, { type });
      onChanged('依赖类型已更新');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[55] flex items-center justify-center bg-ink/25 p-4 backdrop-blur-[2px]" onClick={onClose}>
      <div
        className="max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-line/60 bg-white p-6 shadow-pop"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className={`h-[7px] w-[7px] flex-none rounded-full ${STATUS_DOT[status]}`} />
              <span className="text-[11.5px] text-ink-soft">
                {STATUS_LABELS[status]} · {milestone ? '里程碑（单个日期）' : `工期 ${duration} 天`}
              </span>
              {task.isCritical && (
                <span className="chip border border-coral/40 bg-coral-soft/70 text-coral">关键路径</span>
              )}
              {task.overdue && <span className="chip bg-coral-soft text-coral">逾期</span>}
            </div>
          </div>
          <button className="btn-ghost -mr-2 flex-none" onClick={onClose} aria-label="关闭">✕</button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="label" htmlFor="gt-title">标题</label>
            <input id="gt-title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>

          <div className={milestone ? '' : 'grid grid-cols-2 gap-3'}>
            <div>
              <label className="label" htmlFor="gt-start">{milestone ? '达成日' : '开始'}</label>
              <input
                id="gt-start"
                type="date"
                className="input"
                value={start}
                onChange={(e) => {
                  const v = e.target.value;
                  setStart(v);
                  if (v && end < v) setEnd(v);
                }}
              />
            </div>
            {!milestone && (
              <div>
                <label className="label" htmlFor="gt-end">结束（含当天）</label>
                <input
                  id="gt-end"
                  type="date"
                  className="input"
                  value={end}
                  min={start}
                  onChange={(e) => setEnd(e.target.value)}
                />
              </div>
            )}
          </div>

          <label className="flex cursor-pointer select-none items-center gap-2 text-[12.5px] text-ink-mid">
            <input
              type="checkbox"
              className="h-3.5 w-3.5 accent-[#2F6B4F]"
              checked={milestone}
              onChange={(e) => {
                const v = e.target.checked;
                setMilestone(v);
                // 转里程碑：收敛成一天；转回任务：先保持一天，用户再拉长
                setEnd(v ? start : end < start ? start : end);
              }}
            />
            <span className="flex items-center gap-1.5">
              <span className="text-moss-deep">◆</span>
              里程碑（只有一个达成日，不占工期）
            </span>
          </label>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="gt-status">状态</label>
              <select
                id="gt-status"
                className="input"
                value={status}
                onChange={(e) => setStatus(e.target.value as GanttTask['status'])}
              >
                {(['todo', 'in_progress', 'review', 'done'] as const).map((s) => (
                  <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="gt-project">项目</label>
              <select id="gt-project" className="input" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                <option value="">未归属</option>
                {projects.map(([id, name]) => (
                  <option key={id} value={id}>{name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* 进度 */}
          <div>
            <div className="mb-1 flex items-center justify-between">
              <span className="label mb-0">进度</span>
              <span className="text-[11.5px] tabular-nums text-ink-soft">
                {task.subtasks.total > 0
                  ? `子任务 ${task.subtasks.done}/${task.subtasks.total} · ${task.progress}%`
                  : task.status === 'done' ? '已完成' : '未开始'}
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-line">
              <div className="h-full rounded-full bg-moss" style={{ width: `${task.progress}%` }} />
            </div>
          </div>

          {/* 前置任务 */}
          <div className="rounded-xl border border-line bg-paper/60 p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[12px] font-semibold text-ink-mid">前置任务</span>
              <button className="s-link" onClick={() => setAddOpen((v) => !v)} type="button">
                {addOpen ? '收起' : '+ 添加'}
              </button>
            </div>

            {task.deps.length === 0 && !addOpen && (
              <p className="text-[11.5px] text-ink-soft">还没有依赖。加上前置任务后，前面延迟，这条会自动顺延。</p>
            )}

            <ul className="space-y-1.5">
              {task.deps.map((d) => {
                const p = taskMap.get(d.id);
                return (
                  <li key={d.id} className="flex items-center gap-2 text-[12px]">
                    <span className="min-w-0 flex-1 truncate text-ink-mid">{p?.title ?? `#${d.id}`}</span>
                    <select
                      className="rounded-md border border-line bg-white px-1 py-0.5 text-[11px] text-ink-mid outline-none"
                      value={d.type}
                      onChange={(e) => changeDepType(d.id, e.target.value as DepType)}
                      disabled={busy}
                      title={DEP_LABELS[d.type]}
                    >
                      {(Object.keys(DEP_SHORT) as DepType[]).map((t) => (
                        <option key={t} value={t}>{t} {DEP_LABELS[t]}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="text-ink-faint transition-colors hover:text-coral"
                      onClick={() => removeDep(d.id)}
                      disabled={busy}
                      aria-label="删除依赖"
                    >
                      ✕
                    </button>
                  </li>
                );
              })}
            </ul>

            {addOpen && (
              <div className="mt-2 space-y-2 border-t border-line-soft pt-2">
                <div className="flex gap-2">
                  <select
                    className="input flex-1 py-1 text-[12px]"
                    value={newType}
                    onChange={(e) => setNewType(e.target.value as DepType)}
                  >
                    {(Object.keys(DEP_SHORT) as DepType[]).map((t) => (
                      <option key={t} value={t}>{t} · {DEP_LABELS[t]}</option>
                    ))}
                  </select>
                </div>
                <div className="max-h-40 overflow-y-auto rounded-lg border border-line bg-white">
                  {candidates.length === 0 && (
                    <p className="px-2 py-2 text-[11.5px] text-ink-soft">没有可添加的任务</p>
                  )}
                  {candidates.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-[12px] text-ink-mid transition-colors hover:bg-paper-deep"
                      onClick={() => addDep(t.id)}
                      disabled={busy}
                    >
                      <span className="min-w-0 flex-1 truncate">{t.title}</span>
                      <span className="flex-none text-[11px] tabular-nums text-ink-faint">
                        {t.start.slice(5)} → {t.end.slice(5)}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* 后续任务（只读，反查出来的） */}
          {task.successors.length > 0 && (
            <div>
              <span className="label">后续任务（由依赖自动推导）</span>
              <div className="flex flex-wrap gap-1.5">
                {task.successors.map((s) => {
                  const t = taskMap.get(s.id);
                  return (
                    <span key={s.id} className="chip border border-line bg-paper-deep text-ink-mid">
                      {t?.title ?? `#${s.id}`}
                      <span className="text-ink-faint">{s.type}</span>
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          {task.slack != null && task.slack > 0 && (
            <p className="text-[11.5px] text-ink-soft">
              浮动时间 {task.slack} 天 —— 晚 {task.slack} 天开始也不会影响整体完成。
            </p>
          )}

          {error && <p className="rounded-lg bg-coral-soft px-3 py-2 text-[12px] text-coral">{error}</p>}

          <div className="-mx-6 flex items-center gap-2 border-t border-line-soft px-6 pt-4">
            <button type="button" className="btn-ghost text-xs" onClick={onEditFull}>
              编辑完整信息
            </button>
            <button
              type="button"
              className="btn-ghost text-xs"
              onClick={onAddMilestone}
              title="在这条任务结束后一天建一个里程碑，并自动连成「完成后才达成」"
            >
              ◆ 加后续里程碑
            </button>
            <div className="ml-auto flex gap-2">
              <button type="button" className="btn-ghost" onClick={onClose}>取消</button>
              <button type="button" className="btn-primary" onClick={save} disabled={busy || !dirty}>
                {busy ? '保存中…' : '保存'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
