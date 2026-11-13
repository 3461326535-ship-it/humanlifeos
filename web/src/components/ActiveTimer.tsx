import { useEffect, useState } from 'react';
import { fmtClock, runningSec, useRunningTimers, useTimerSummary, useTimerSwitch } from '../lib/timer';

/**
 * 右栏「专注计时」卡：
 *   大数字 = 今日累计（所有任务，含正在跑的段）
 *   下面按任务列出正在计时的几条，各自带连续表盘与暂停按钮 —— 允许同时挂多个
 * 开始计时在任务行内的 ▶（可对任意任务），这里只负责看与停。
 */
export default function ActiveTimer() {
  const { data: runningList } = useRunningTimers();
  const { data: summary } = useTimerSummary();
  const { stop } = useTimerSwitch();
  const [, setTick] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const items = runningList?.items ?? [];
  const running = items.length > 0;
  const todayClock = fmtClock(Math.round((summary?.total_minutes ?? 0) * 60));

  return (
    <div className="card p-4">
      <div className="s-head">
        <span className="s-title">专注计时</span>
        {running && (
          <span className="flex items-center gap-1.5 text-[11px] text-moss">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-moss" />
            {items.length > 1 ? `${items.length} 个进行中` : '进行中'}
          </span>
        )}
      </div>

      <div
        className={`text-[30px] font-medium leading-none tracking-[0.01em] tabular-nums ${
          running ? 'text-ink' : 'text-ink-faint'
        }`}
      >
        {todayClock}
      </div>
      <p className="mt-1.5 text-[11px] text-ink-faint">今日累计（全部任务）</p>

      {running ? (
        <ul className="mt-3 space-y-1.5">
          {items.map((it) => (
            <li key={it.id} className="flex items-center gap-2 rounded-lg bg-paper-deep/70 px-2 py-1.5">
              <span className="h-1.5 w-1.5 flex-none animate-pulse rounded-full bg-moss" />
              <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink-mid">{it.event_title}</span>
              <span className="flex-none text-[12px] tabular-nums text-ink">
                {fmtClock(runningSec(summary, it.event_id, it.started_at))}
              </span>
              <button
                type="button"
                onClick={() => stop.mutate(it.event_id)}
                disabled={stop.isPending}
                className="flex h-6 flex-none items-center rounded-md bg-card px-1.5 text-[11px] text-ink-soft ring-1 ring-line transition-colors hover:text-coral hover:ring-coral/40 disabled:opacity-50"
                title={`暂停「${it.event_title}」（今日累计保留）`}
              >
                暂停
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="mt-3 flex h-8 items-center rounded-lg border border-dashed border-line px-2.5 text-[11.5px] text-ink-soft">
          点任务右侧 ▶ 开始计时
        </div>
      )}

      <p className="mt-2.5 text-[11.5px] text-ink-soft">
        {running ? '可以同时给多个任务计时，互不打断' : '暂停后累计保留，随时继续'}
      </p>
    </div>
  );
}
