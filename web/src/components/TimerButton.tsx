import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { elapsedSec, fmtClock, useTimerSwitch } from '../lib/timer';

/**
 * 任务行内的计时开关：不用打开详情就能开始 / 停止。
 * 自己订阅 ['activeTimer']，与右栏卡 / 全局浮标共享同一份缓存，无需层层传 props。
 * 进行中时显示 ■ + 实时时长；未进行时 hover 出现 ▶。
 */
export default function TimerButton({ eventId }: { eventId: number }) {
  const { data: active } = useQuery({
    queryKey: ['activeTimer'],
    queryFn: api.getActiveTimer,
    refetchInterval: 5000,
  });
  const { start, stop } = useTimerSwitch();
  const running = Boolean(active?.running && active.event_id === eventId);
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setTick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, [running]);

  const busy = start.isPending || stop.isPending;
  const clock = fmtClock(elapsedSec(active?.started_at));
  const err = (start.error || stop.error) as Error | null;
  const label = err ? `计时失败：${err.message}` : running ? `停止计时（已 ${clock}）` : '开始计时';

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
      className={`flex h-6 flex-none items-center gap-1 rounded-md px-1.5 text-[11px] tabular-nums transition-colors disabled:opacity-50 ${
        err
          ? 'bg-coral-soft text-coral ring-1 ring-coral/30'
          : running
            ? 'bg-moss-soft text-moss-deep ring-1 ring-moss/30'
            : 'text-ink-faint opacity-50 hover:bg-line/60 hover:text-moss-deep sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100'
      }`}
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
      {running && <span>{clock}</span>}
    </button>
  );
}
