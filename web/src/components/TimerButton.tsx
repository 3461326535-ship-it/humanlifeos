import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { fmtClock, fmtMinutes, runningSec, useTimerSummary, useTimerSwitch } from '../lib/timer';

/**
 * 任务行内的计时开关，三态：
 *   未开始 → ▶（hover 出现）
 *   进行中 → ■ + 今日累计走的表盘，点击 = 暂停（结束这一段，不清零）
 *   今日已做 → ▶ + 今日累计，点击 = 继续（新开一段，表盘接着之前的时长走）
 * 自己订阅 activeTimer / timerSummary，与右栏卡、全局浮标共享缓存。
 */
export default function TimerButton({ eventId }: { eventId: number }) {
  const { data: active } = useQuery({
    queryKey: ['activeTimer'],
    queryFn: api.getActiveTimer,
    refetchInterval: 5000,
  });
  const { data: summary } = useTimerSummary();
  const { start, stop } = useTimerSwitch();
  const running = Boolean(active?.running && active.event_id === eventId);
  const todayMin = summary?.items.find((i) => i.event_id === eventId)?.minutes ?? 0;
  const paused = !running && todayMin > 0;
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setTick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, [running]);

  const busy = start.isPending || stop.isPending;
  // 连续表盘：已结束段落 + 当前段，继续计时不会从 0 重新数
  const clock = fmtClock(runningSec(summary, eventId, active?.started_at));
  const err = (start.error || stop.error) as Error | null;
  const label = err
    ? `计时失败：${err.message}`
    : running
      ? `暂停计时（今日已 ${clock}）`
      : paused
        ? `继续计时（今日已 ${fmtMinutes(todayMin)}）`
        : '开始计时';

  const tone = err
    ? 'bg-coral-soft text-coral ring-1 ring-coral/30'
    : running
      ? 'bg-moss-soft text-moss-deep ring-1 ring-moss/30'
      : paused
        ? 'bg-paper-deep text-ink-mid ring-1 ring-line'
        : 'text-ink-faint opacity-50 hover:bg-line/60 hover:text-moss-deep sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100';

  return (
    <button
      type="button"
      // 看板卡片把 dnd-kit 的 listeners 绑在外层，不拦 pointerdown 会被当成拖拽
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        if (busy) return;
        if (running) stop.mutate(eventId);
        else start.mutate(eventId);
      }}
      disabled={busy}
      aria-label={label}
      title={label}
      className={`flex h-6 flex-none items-center gap-1 rounded-md px-1.5 text-[11px] tabular-nums transition-colors disabled:opacity-50 ${tone}`}
    >
      {running ? (
        <svg viewBox="0 0 12 12" className="h-2.5 w-2.5 fill-current">
          <rect x="2.5" y="2.5" width="7" height="7" rx="1.2" />
        </svg>
      ) : (
        <svg viewBox="0 0 12 12" className="h-2.5 w-2.5 fill-current">
          <path d="M3.5 2.2 9.5 6l-6 3.8z" />
        </svg>
      )}
      {running ? <span>{clock}</span> : paused ? <span>{fmtMinutes(todayMin)}</span> : null}
    </button>
  );
}
