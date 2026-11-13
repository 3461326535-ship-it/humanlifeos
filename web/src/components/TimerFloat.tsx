import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { fmtClock, fmtMinutes, runningSec, useTimerSummary, useTimerSwitch } from '../lib/timer';

/**
 * 全局计时浮标：
 *   进行中 → 任务名 + 今日累计走的表盘（暂停后继续不会归零）+ 暂停
 *   刚暂停 → 任务名 + 今日累计 + 继续 / 收起（避免暂停后「入口消失」）
 * 未计时且没有可续的段落时完全不渲染，位置避开右下角 AI 助手浮标。
 */
export default function TimerFloat() {
  const { data: active } = useQuery({
    queryKey: ['activeTimer'],
    queryFn: api.getActiveTimer,
    refetchInterval: 5000,
  });
  const { data: summary } = useTimerSummary();
  const { start, stop } = useTimerSwitch();
  const [, setTick] = useState(0);
  const [dismissedFor, setDismissedFor] = useState<string | null>(null);

  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const running = Boolean(active?.running && active.event_id);
  const paused = summary?.last_ended ?? null;

  if (!running && !paused) return null;
  if (!running && paused && dismissedFor === paused.ended_at) return null;

  return (
    <div
      className={`fixed bottom-6 right-[88px] z-30 flex max-w-[min(320px,calc(100vw-7rem))] items-center gap-2.5 rounded-xl border bg-card px-3 py-2 shadow-pop ${
        running ? 'border-moss/25' : 'border-line'
      }`}
    >
      {running ? (
        <>
          <span className="h-2 w-2 flex-none animate-pulse rounded-full bg-moss" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[11.5px] text-ink-soft">正在计时 · {active!.event_title}</p>
            <p className="text-[15px] font-semibold leading-tight tabular-nums text-ink">
              {fmtClock(runningSec(summary, active!.event_id, active!.started_at))}
            </p>
          </div>
          <button
            type="button"
            onClick={() => stop.mutate(active!.event_id!)}
            disabled={stop.isPending}
            className="flex h-7 w-7 flex-none items-center justify-center rounded-lg bg-moss-deep text-white transition-colors hover:bg-moss disabled:opacity-50"
            title="暂停计时（今日累计保留）"
            aria-label="暂停计时"
          >
            <svg viewBox="0 0 12 12" className="h-2.5 w-2.5 fill-current">
              <rect x="2.5" y="2.5" width="7" height="7" rx="1.2" />
            </svg>
          </button>
        </>
      ) : paused ? (
        <>
          <span className="flex h-4 w-4 flex-none items-center justify-center rounded bg-line/70 text-[9px] leading-none text-ink-mid">
            ⏸
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[11.5px] text-ink-soft">已暂停 · {paused.event_title}</p>
            <p className="text-[15px] font-semibold leading-tight tabular-nums text-ink">
              今日 {fmtMinutes(paused.minutes)}
            </p>
          </div>
          <button
            type="button"
            onClick={() => start.mutate(paused.event_id)}
            disabled={start.isPending}
            className="flex h-7 w-7 flex-none items-center justify-center rounded-lg bg-moss-deep text-white transition-colors hover:bg-moss disabled:opacity-50"
            title="继续计时（新开一段）"
            aria-label="继续计时"
          >
            <svg viewBox="0 0 12 12" className="h-2.5 w-2.5 fill-current">
              <path d="M3.5 2.2 9.5 6l-6 3.8z" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => setDismissedFor(paused.ended_at)}
            className="flex h-7 w-7 flex-none items-center justify-center rounded-lg text-ink-faint transition-colors hover:bg-line/60 hover:text-ink-mid"
            title="收起（今日累计仍保留）"
            aria-label="收起计时浮标"
          >
            <svg viewBox="0 0 12 12" className="h-2.5 w-2.5 fill-none stroke-current" strokeWidth="1.6" strokeLinecap="round">
              <path d="M3 3l6 6M9 3l-6 6" />
            </svg>
          </button>
        </>
      ) : null}
    </div>
  );
}
