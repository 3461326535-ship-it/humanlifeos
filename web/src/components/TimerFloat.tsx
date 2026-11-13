import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { elapsedSec, fmtClock, useTimerSwitch } from '../lib/timer';

/**
 * 全局计时浮标：任何页面都能看到「正在给谁计时」并一键结束。
 * 未计时时完全不渲染，不打扰；位置避开右下角 AI 助手浮标。
 */
export default function TimerFloat() {
  const { data } = useQuery({
    queryKey: ['activeTimer'],
    queryFn: api.getActiveTimer,
    refetchInterval: 5000,
  });
  const { stop } = useTimerSwitch();
  const [, setTick] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, []);

  if (!data?.running || !data.event_id) return null;

  return (
    <div className="fixed bottom-6 right-[88px] z-30 flex max-w-[min(320px,calc(100vw-7rem))] items-center gap-2.5 rounded-xl border border-moss/25 bg-card px-3 py-2 shadow-pop">
      <span className="h-2 w-2 flex-none animate-pulse rounded-full bg-moss" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[11.5px] text-ink-soft">正在计时 · {data.event_title}</p>
        <p className="text-[15px] font-semibold leading-tight tabular-nums text-ink">
          {fmtClock(elapsedSec(data.started_at))}
        </p>
      </div>
      <button
        type="button"
        onClick={() => stop.mutate(data.event_id!)}
        disabled={stop.isPending}
        className="flex h-7 w-7 flex-none items-center justify-center rounded-lg bg-moss-deep text-white transition-colors hover:bg-moss disabled:opacity-50"
        title="结束计时"
        aria-label="结束计时"
      >
        <svg viewBox="0 0 12 12" className="h-2.5 w-2.5 fill-current">
          <rect x="2.5" y="2.5" width="7" height="7" rx="1.2" />
        </svg>
      </button>
    </div>
  );
}
