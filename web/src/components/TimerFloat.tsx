import { useEffect, useState } from 'react';
import { fmtClock, fmtMinutes, runningSec, useRunningTimers, useTimerSummary, useTimerSwitch } from '../lib/timer';

/**
 * 全局计时浮标：
 *   进行中 → 每个任务一行（任务名 + 今日累计走的表盘 + 暂停），可以同时挂多个
 *   刚暂停 → 没有进行中的计时时，显示最近暂停的那条 + 继续 / 收起
 * 位置避开右下角 AI 助手浮标；全部暂停且已收起时不渲染。
 */
export default function TimerFloat() {
  const { data: runningList } = useRunningTimers();
  const { data: summary } = useTimerSummary();
  const { start, stop } = useTimerSwitch();
  const [, setTick] = useState(0);
  const [dismissedFor, setDismissedFor] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const items = runningList?.items ?? [];
  const paused = items.length === 0 ? summary?.last_ended ?? null : null;

  if (items.length === 0 && !paused) return null;
  if (items.length === 0 && paused && dismissedFor === paused.ended_at) return null;

  return (
    <div className="fixed bottom-6 right-[88px] z-30 flex w-[min(320px,calc(100vw-7rem))] flex-col gap-2">
      {items.length > 0 && (
        <div
          className={`flex flex-col gap-0.5 rounded-xl border border-moss/25 bg-card shadow-pop ${
            items.length > 1 ? 'px-2 py-1.5' : 'px-3 py-2'
          }`}
        >
          {items.length > 1 && (
            <div className="flex items-center justify-between px-0.5 pb-1">
              <span className="flex items-center gap-1.5 text-[11px] text-ink-soft">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-moss" />
                {items.length} 个正在计时
              </span>
              <button
                type="button"
                onClick={() => setCollapsed((c) => !c)}
                className="rounded px-1 text-[11px] text-ink-faint transition-colors hover:text-ink-mid"
              >
                {collapsed ? '展开' : '收起'}
              </button>
            </div>
          )}

          {(items.length === 1 || !collapsed) &&
            items.map((it) => (
              <div key={it.id} className="flex items-center gap-2.5 rounded-lg py-1 pl-0.5 pr-1">
                <span className="h-2 w-2 flex-none animate-pulse rounded-full bg-moss" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[11.5px] text-ink-soft">正在计时 · {it.event_title}</p>
                  <p className="text-[15px] font-semibold leading-tight tabular-nums text-ink">
                    {fmtClock(runningSec(summary, it.event_id, it.started_at))}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => stop.mutate(it.event_id)}
                  disabled={stop.isPending}
                  className="flex h-7 w-7 flex-none items-center justify-center rounded-lg bg-moss-deep text-white transition-colors hover:bg-moss disabled:opacity-50"
                  title="暂停计时（今日累计保留）"
                  aria-label={`暂停计时：${it.event_title}`}
                >
                  <svg viewBox="0 0 12 12" className="h-2.5 w-2.5 fill-current">
                    <rect x="2.5" y="2.5" width="7" height="7" rx="1.2" />
                  </svg>
                </button>
              </div>
            ))}
        </div>
      )}

      {paused && (
        <div className="flex items-center gap-2.5 rounded-xl border border-line bg-card px-3 py-2 shadow-pop">
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
            title="继续计时（新开一段，累计接着走）"
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
        </div>
      )}
    </div>
  );
}
