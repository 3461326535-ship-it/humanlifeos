import { useEffect, useMemo, useState } from 'react';
import { fmtClock, runningSec, useRunningTimers, useTimerSummary, useTimerSwitch } from '../lib/timer';
import { dayStr, dayWindow, useActualLoad } from '../lib/actual';

/**
 * 右栏「专注计时」卡：
 *   大数字 = 今日实际投入（任务 ∪ 已打卡习惯，按时间轴去重）
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

  const today = dayStr(new Date());
  const win = useMemo(() => dayWindow(today), [today]);
  const { data: actual } = useActualLoad(win);

  const items = runningList?.items ?? [];
  const running = items.length > 0;
  // 实际投入（含习惯、已去重）；后端还没返回时先按任务口径兜底
  const actualMinutes = actual?.total_minutes ?? summary?.total_minutes ?? 0;
  const todayClock = fmtClock(Math.round(actualMinutes * 60));
  const overlap = Math.round(actual?.overlap_minutes ?? summary?.overlap_minutes ?? 0);
  const habitMinutes = Math.round(actual?.habit_minutes ?? 0);
  // 接近 24 小时（20 小时起）就提示：这是真实生命占用，不是可刷的绩效
  const nearFullDay = actualMinutes >= 20 * 60;

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
      <p className="mt-1.5 text-[11px] text-ink-faint">
        今日实际投入 · 含习惯
        {habitMinutes > 0 && ` ${habitMinutes}m`}
        {overlap >= 1 && ` · 已去重，重叠 ${overlap}m 只算一次`}
      </p>

      {/* 去重后仍接近一天：这已经不是「效率指标」而是真实生命占用，提醒一句 */}
      {nearFullDay && (
        <p className="mt-2 rounded-md bg-coral/10 px-2 py-1.5 text-[11px] leading-relaxed text-coral">
          今天已真实占用 {Math.floor(actualMinutes / 60)} 小时 —— 这个数字是生命的实际占用，不是完成量。专注力可能有损耗，早点休息。
        </p>
      )}

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
