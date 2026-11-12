import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { Habit, HabitInput } from '../lib/types';
import { DEFAULT_CATEGORIES } from '../lib/types';

// 显示顺序按周一起，值用 RFC 5545 的 BYDAY 编码
const DAY_ORDER = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];
const DAY_CN: Record<string, string> = {
  MO: '一',
  TU: '二',
  WE: '三',
  TH: '四',
  FR: '五',
  SA: '六',
  SU: '日',
};

function fmt(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function todayStr() {
  return fmt(new Date());
}

/** 解析已有 rrule：只关心 FREQ / BYDAY / INTERVAL，其余原样保留在 interval 里 */
function splitRule(rrule: string) {
  const parts = new Map(
    rrule
      .split(';')
      .filter(Boolean)
      .map((seg) => {
        const i = seg.indexOf('=');
        return [seg.slice(0, i), seg.slice(i + 1)] as [string, string];
      })
  );
  const freq = (parts.get('FREQ') || 'DAILY').toUpperCase() === 'WEEKLY' ? 'weekly' : 'daily';
  const byday = (parts.get('BYDAY') || '')
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter((s) => DAY_ORDER.includes(s));
  const interval = Number(parts.get('INTERVAL') || 1) || 1;
  return { freq: freq as 'daily' | 'weekly', byday, interval };
}

function buildRule(freq: 'daily' | 'weekly', byday: string[], interval: number) {
  const segs = [`FREQ=${freq === 'weekly' ? 'WEEKLY' : 'DAILY'}`];
  if (interval > 1) segs.push(`INTERVAL=${interval}`);
  if (freq === 'weekly' && byday.length > 0) {
    // 按周一起排序，生成稳定字符串（便于和原值比较是否改动）
    segs.push(`BYDAY=${DAY_ORDER.filter((d) => byday.includes(d)).join(',')}`);
  }
  return segs.join(';');
}

function weekdayCode(d = new Date()) {
  return DAY_ORDER[(d.getDay() + 6) % 7];
}

export default function HabitDialog({
  habit,
  defaultDate,
  onClose,
  onSaved,
}: {
  habit: Habit | null;
  defaultDate: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!habit;
  const parsed = habit ? splitRule(habit.rrule) : { freq: 'daily' as const, byday: [], interval: 1 };

  const [title, setTitle] = useState(habit?.title ?? '');
  const [freq, setFreq] = useState<'daily' | 'weekly'>(parsed.freq);
  const [byday, setByday] = useState<string[]>(parsed.byday);
  const [dtstart, setDtstart] = useState(habit?.dtstart ?? (defaultDate || todayStr()));
  const [time, setTime] = useState(habit?.start_time ?? '');
  const [category, setCategory] = useState(habit?.category ?? '');
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  const rrule = buildRule(freq, byday, parsed.interval);
  // 原规则先规范化再比，否则 `FREQ=DAILY;INTERVAL=1` 与 `FREQ=DAILY` 会被误判为「改过频率」，
  // 导致只改标题也走封旧建新的分支。
  const origRule = habit ? buildRule(parsed.freq, parsed.byday, parsed.interval) : '';
  const ruleChanged = isEdit && rrule !== origRule;

  // 结构性变更（频率 / 开始日期 / 时间）会让后端封掉旧规则、从今天起新建一条，历史打卡仍在
  const structural =
    isEdit &&
    (ruleChanged ||
      dtstart !== habit!.dtstart ||
      (time || '') !== (habit!.start_time || ''));

  const saveMutation = useMutation({
    mutationFn: () => {
      if (!isEdit) {
        return api.createHabit({
          title: title.trim(),
          rrule,
          dtstart,
          start_time: time || '',
          category: category.trim() || '其他',
        });
      }
      // 只发真正改过的字段：避免「只改标题」也被当成结构性变更
      const patch: Partial<HabitInput> = {};
      if (title.trim() !== habit!.title) patch.title = title.trim();
      const cat = category.trim() || '其他';
      if (cat !== habit!.category) patch.category = cat;
      if (ruleChanged) patch.rrule = rrule;
      if (dtstart !== habit!.dtstart) patch.dtstart = dtstart;
      if ((time || '') !== (habit!.start_time || '')) patch.start_time = time || '';
      return api.updateHabit(habit!.id, patch);
    },
    onSuccess: onSaved,
    onError: (e: Error) => setError(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.deleteHabit(habit!.id),
    onSuccess: onSaved,
    onError: (e: Error) => setError(e.message),
  });

  const toggleDay = (d: string) =>
    setByday((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return setError('习惯名称不能为空');
    if (freq === 'weekly' && byday.length === 0) {
      return setError('每周重复至少要选一个星期几');
    }
    if (!dtstart) return setError('开始日期不能为空');
    setError('');
    saveMutation.mutate();
  };

  return (
    <div
      className="fixed inset-0 z-[55] flex items-center justify-center bg-ink/25 p-4 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        className="max-h-[88vh] w-full max-w-md overflow-y-auto rounded-2xl border border-line/60 bg-white p-6 shadow-pop"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-base font-semibold text-ink">{isEdit ? '编辑习惯' : '新习惯'}</h2>
          <button className="btn-ghost -mr-2" onClick={onClose} aria-label="关闭">
            ✕
          </button>
        </div>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <div>
            <label className="label" htmlFor="hb-title">
              习惯名称 *
            </label>
            <input
              id="hb-title"
              className="input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="比如：读书 30 分钟"
              autoFocus
            />
          </div>

          {/* 频率 */}
          <div>
            <span className="label">重复</span>
            <div className="flex rounded-lg bg-line-soft p-0.5 text-[13px]">
              {(
                [
                  ['daily', '每天'],
                  ['weekly', '每周'],
                ] as const
              ).map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => {
                    setFreq(k);
                    if (k === 'weekly' && byday.length === 0) setByday([weekdayCode()]);
                  }}
                  className={`flex-1 rounded-md py-1.5 transition-colors ${
                    freq === k ? 'bg-white font-medium text-ink shadow-sm' : 'text-ink-soft hover:text-ink-mid'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {freq === 'weekly' && (
              <div className="mt-2 flex items-center gap-1.5">
                {DAY_ORDER.map((d) => {
                  const on = byday.includes(d);
                  return (
                    <button
                      key={d}
                      type="button"
                      onClick={() => toggleDay(d)}
                      aria-pressed={on}
                      className={`h-8 flex-1 rounded-lg border text-[12.5px] transition-colors ${
                        on
                          ? 'border-moss/40 bg-moss-soft font-medium text-moss'
                          : 'border-line bg-white/70 text-ink-soft hover:text-ink-mid'
                      }`}
                    >
                      {DAY_CN[d]}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* 开始日期 / 时间 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="hb-start">
                开始日期 *
              </label>
              <input
                id="hb-start"
                type="date"
                className="input"
                value={dtstart}
                onChange={(e) => setDtstart(e.target.value)}
              />
            </div>
            <div>
              <label className="label" htmlFor="hb-time">
                时间（可选）
              </label>
              <input
                id="hb-time"
                type="time"
                className="input"
                value={time}
                onChange={(e) => setTime(e.target.value)}
              />
            </div>
          </div>

          {/* 分类 */}
          <div>
            <label className="label" htmlFor="hb-category">
              分类
            </label>
            <input
              id="hb-category"
              className="input"
              list="habit-category-list"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="其他"
            />
            <datalist id="habit-category-list">
              {DEFAULT_CATEGORIES.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>

          {structural && (
            <p className="rounded-lg bg-clay-soft/70 px-3 py-2 text-[11.5px] leading-5 text-clay">
              改了频率 / 开始日期 / 时间：会从今天起按新规则生效，之前的打卡记录保留。
            </p>
          )}

          {error && <p className="rounded-lg bg-coral-soft px-3 py-2 text-sm text-coral">{error}</p>}

          <div className="-mx-6 flex items-center gap-2 border-t border-line-soft px-6 pt-4">
            {isEdit && (
              <div className="flex-none">
                {confirmDelete ? (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      className="btn-danger text-xs"
                      onClick={() => deleteMutation.mutate()}
                    >
                      确认停用
                    </button>
                    <button
                      type="button"
                      className="btn-ghost text-xs"
                      onClick={() => setConfirmDelete(false)}
                    >
                      取消
                    </button>
                  </div>
                ) : (
                  <button type="button" className="btn-danger" onClick={() => setConfirmDelete(true)}>
                    停用
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
