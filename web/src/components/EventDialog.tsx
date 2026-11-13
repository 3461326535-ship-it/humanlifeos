import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { TodoEvent, EventInput, Subtask, Recurrence, Priority, TaskStatus } from '../lib/types';
import { DEFAULT_CATEGORIES, STATUS_LABELS } from '../lib/types';
import EventTimer from './EventTimer';

interface Draft {
  title: string;
  date: string;
  end_date: string;
  milestone: boolean;
  time: string;
  category: string;
  description: string;
  status: TaskStatus;
  priority: Priority | '';
  recurrence: Recurrence | '';
  recurrence_end_date: string;
  subtasks: { title: string; completed: boolean }[];
}

function toDraft(
  event: TodoEvent | null,
  defaultDate: string,
  defaultStatus: TaskStatus = 'todo',
  defaultRecurrence: Recurrence | '' = '',
  defaultEndDate = '',
  defaultMilestone = false,
  defaultTime = ''
): Draft {
  if (event) {
    const milestone = !!event.is_milestone;
    return {
      title: event.title,
      date: event.date,
      end_date: milestone ? '' : event.end_date && event.end_date > event.date ? event.end_date : '',
      milestone,
      time: event.time || '',
      category: event.category || '',
      description: event.description || '',
      status: event.status,
      priority: event.priority || '',
      recurrence: event.recurrence || '',
      recurrence_end_date: event.recurrence_end_date || '',
      subtasks: (event.subtasks || []).map((s) => ({ title: s.title, completed: s.completed })),
    };
  }
  return {
    title: '',
    date: defaultDate,
    end_date: defaultMilestone ? '' : defaultEndDate,
    milestone: defaultMilestone,
    time: defaultTime,
    category: '',
    description: '',
    status: defaultStatus,
    priority: '',
    recurrence: defaultRecurrence,
    recurrence_end_date: '',
    subtasks: [],
  };
}

function toInput(d: Draft): EventInput {
  return {
    title: d.title.trim(),
    date: d.date,
    // 甘特：跨天任务才有结束日；里程碑/未填/单日 → null
    end_date: !d.milestone && d.end_date && d.end_date > d.date ? d.end_date : null,
    is_milestone: d.milestone ? 1 : 0,
    time: d.time || '',
    category: d.category || '其他',
    description: d.description,
    status: d.status,
    subtasks: d.subtasks.filter((s) => s.title.trim()),
    recurrence: d.recurrence || null,
    recurrence_end_date: d.recurrence ? d.recurrence_end_date || null : null,
    priority: d.priority || null,
  };
}

export default function EventDialog({
  event,
  defaultDate,
  defaultStatus,
  defaultRecurrence = '',
  defaultEndDate = '',
  defaultMilestone = false,
  defaultTime = '',
  onClose,
  onSaved,
}: {
  event: TodoEvent | null;
  defaultDate: string;
  defaultStatus?: TaskStatus;
  defaultRecurrence?: Recurrence | '';
  defaultEndDate?: string;
  defaultMilestone?: boolean;
  /** 新建时的默认时间 HH:MM（日历「实际」视图双击空白补记用） */
  defaultTime?: string;
  onClose: () => void;
  /** 保存成功回调；新建时带回刚创建的任务，编辑时为 undefined */
  onSaved?: (created?: TodoEvent) => void;
}) {
  const [draft, setDraft] = useState<Draft>(() =>
    toDraft(event, defaultDate, defaultStatus, defaultRecurrence, defaultEndDate, defaultMilestone, defaultTime)
  );
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState('');
  const isEdit = !!event;

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const saveMutation = useMutation({
    mutationFn: () =>
      isEdit ? api.updateEvent(event.id, toInput(draft)) : api.createEvent(toInput(draft)),
    onSuccess: (data) => onSaved?.(isEdit ? undefined : (data as TodoEvent)),
    onError: (e: Error) => setError(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (chain: boolean) => api.deleteEvent(event!.id, chain),
    onSuccess: () => onSaved?.(),
    onError: (e: Error) => setError(e.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.title.trim()) return setError('标题不能为空');
    if (!draft.date) return setError('日期不能为空');
    setError('');
    saveMutation.mutate();
  };

  const setSubtask = (i: number, patch: Partial<{ title: string; completed: boolean }>) =>
    setDraft((d) => ({
      ...d,
      subtasks: d.subtasks.map((s, j) => (j === i ? { ...s, ...patch } : s)),
    }));

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-ink/25 p-4 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        className="max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-line/60 bg-white p-6 shadow-pop"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-base font-semibold text-ink">
            {isEdit ? (draft.milestone ? '编辑里程碑' : '编辑任务') : draft.milestone ? '新建里程碑' : '新任务'}
          </h2>
          <button className="btn-ghost -mr-2" onClick={onClose} aria-label="关闭">✕</button>
        </div>

        <form className="space-y-4" onSubmit={handleSubmit}>
          {/* 标题 */}
          <div>
            <label className="label" htmlFor="ev-title">标题 *</label>
            <input
              id="ev-title"
              className="input"
              value={draft.title}
              onChange={(e) => set('title', e.target.value)}
              placeholder="要做什么？"
              autoFocus
            />
          </div>

          {/* 日期 / 结束日期（甘特：跨天任务填结束日；里程碑只有一个达成日） */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="ev-date">{draft.milestone ? '达成日 *' : '开始日期 *'}</label>
              <input
                id="ev-date"
                type="date"
                className="input"
                value={draft.date}
                onChange={(e) => {
                  const v = e.target.value;
                  setDraft((d) => ({
                    ...d,
                    date: v,
                    end_date: d.end_date && d.end_date < v ? v : d.end_date,
                  }));
                }}
              />
            </div>
            <div>
              <label className="label" htmlFor="ev-end-date">结束日期（可选）</label>
              {draft.milestone ? (
                <div className="input flex items-center text-[12.5px] text-ink-faint">里程碑不占工期</div>
              ) : (
                <input
                  id="ev-end-date"
                  type="date"
                  className="input"
                  value={draft.end_date}
                  min={draft.date}
                  onChange={(e) => set('end_date', e.target.value)}
                />
              )}
            </div>
          </div>

          <label className="flex cursor-pointer select-none items-center gap-2 text-[12.5px] text-ink-mid">
            <input
              type="checkbox"
              className="h-3.5 w-3.5 accent-[#2F6B4F]"
              checked={draft.milestone}
              onChange={(e) => {
                const v = e.target.checked;
                setDraft((d) => ({ ...d, milestone: v, end_date: v ? '' : d.end_date }));
              }}
            />
            <span className="flex items-center gap-1.5">
              <span className="text-moss-deep">◆</span>
              里程碑 —— 只有一个达成日，不占工期
            </span>
          </label>

          {/* 时间 / 分类 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="ev-time">时间（可选）</label>
              <input
                id="ev-time"
                type="time"
                className="input"
                value={draft.time}
                onChange={(e) => set('time', e.target.value)}
              />
            </div>
            <div>
              <label className="label" htmlFor="ev-category">分类</label>
              <input
                id="ev-category"
                className="input"
                list="category-list"
                value={draft.category}
                onChange={(e) => set('category', e.target.value)}
                placeholder="其他"
              />
              <datalist id="category-list">
                {DEFAULT_CATEGORIES.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>
          </div>

          {/* 状态 / 优先级 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="ev-status">状态</label>
              <select
                id="ev-status"
                className="input"
                value={draft.status}
                onChange={(e) => set('status', e.target.value as TaskStatus)}
              >
                {(['todo', 'in_progress', 'review', 'done'] as TaskStatus[]).map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="ev-priority">优先级</label>
              <select
                id="ev-priority"
                className="input"
                value={draft.priority}
                onChange={(e) => set('priority', e.target.value as Priority | '')}
              >
                <option value="">无</option>
                <option value="low">低</option>
                <option value="medium">中</option>
                <option value="high">高</option>
              </select>
            </div>
          </div>

          {/* 重复 / 重复截止 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="ev-recurrence">重复</label>
              <select
                id="ev-recurrence"
                className="input"
                value={draft.recurrence}
                onChange={(e) => set('recurrence', e.target.value as Recurrence | '')}
              >
                <option value="">不重复</option>
                <option value="daily">每天</option>
                <option value="weekly">每周</option>
                <option value="monthly">每月</option>
                <option value="yearly">每年</option>
              </select>
            </div>
            {draft.recurrence ? (
              <div>
                <label className="label" htmlFor="ev-rec-end">重复截止（可选）</label>
                <input
                  id="ev-rec-end"
                  type="date"
                  className="input"
                  value={draft.recurrence_end_date}
                  onChange={(e) => set('recurrence_end_date', e.target.value)}
                />
              </div>
            ) : (
              <div />
            )}
          </div>

          {/* 备注 */}
          <div>
            <label className="label" htmlFor="ev-desc">备注</label>
            <textarea
              id="ev-desc"
              className="input min-h-[72px] resize-y"
              value={draft.description}
              onChange={(e) => set('description', e.target.value)}
              placeholder="补充说明…"
            />
          </div>

          {/* 子任务 */}
          <div>
            <label className="label">子任务</label>
            <ul className="space-y-1.5">
              {draft.subtasks.map((st, i) => (
                <li key={i} className="flex items-center gap-2">
                  <button
                    type="button"
                    className={`flex h-4 w-4 flex-none items-center justify-center rounded-[4px] border ${
                      st.completed ? 'border-moss bg-moss text-white' : 'border-ink-faint'
                    }`}
                    onClick={() => setSubtask(i, { completed: !st.completed })}
                    aria-label="切换子任务完成"
                  >
                    {st.completed && <span className="text-[9px]">✓</span>}
                  </button>
                  <input
                    className="input flex-1 py-1.5"
                    value={st.title}
                    onChange={(e) => setSubtask(i, { title: e.target.value })}
                  />
                  <button
                    type="button"
                    className="btn-ghost px-2 py-1 text-ink-faint hover:text-ink-soft"
                    onClick={() => set('subtasks', draft.subtasks.filter((_, j) => j !== i))}
                    aria-label="删除子任务"
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
            <button
              type="button"
              className="btn-ghost mt-1 text-xs"
              onClick={() => set('subtasks', [...draft.subtasks, { title: '', completed: false }])}
            >
              + 添加子任务
            </button>
          </div>

          {isEdit && <EventTimer eventId={event!.id} />}

          {error && <p className="rounded-lg bg-coral-soft px-3 py-2 text-sm text-coral">{error}</p>}

          {/* 操作区 */}
          <div className="-mx-6 flex items-center gap-2 border-t border-line-soft px-6 pt-4">
            {isEdit && (
              <div className="flex-none">
                {confirmDelete ? (
                  <div className="flex items-center gap-1">
                    {event.recurrence ? (
                      <button
                        type="button"
                        className="btn-danger text-xs"
                        onClick={() => deleteMutation.mutate(true)}
                      >
                        删除此后所有
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="btn-danger text-xs"
                      onClick={() => deleteMutation.mutate(false)}
                    >
                      确认删除
                    </button>
                    <button type="button" className="btn-ghost text-xs" onClick={() => setConfirmDelete(false)}>
                      取消
                    </button>
                  </div>
                ) : (
                  <button type="button" className="btn-danger" onClick={() => setConfirmDelete(true)}>
                    删除
                  </button>
                )}
              </div>
            )}
            <div className="ml-auto flex gap-2">
              <button type="button" className="btn-ghost" onClick={onClose}>
                取消
              </button>
              <button type="submit" className="btn-primary" disabled={saveMutation.isPending}>
                {saveMutation.isPending ? '保存中…' : '保存'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
