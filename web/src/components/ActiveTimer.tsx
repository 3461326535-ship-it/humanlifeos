import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { fmtClock, runningSec, useTimerSummary, useTimerSwitch } from '../lib/timer';

/**
 * 右栏「专注计时」卡：只负责显示与结束。
 * 表盘按「今日累计」连续走（暂停后继续不归零）。
 * 开始计时移到任务行内的 ▶（可对任意任务），不再默认给第一条待办起表。
 * 原「重置」按钮与「结束」调用同一个 stop 接口、语义重复，已去掉。
 */
export default function ActiveTimer() {
  const { data } = useQuery({
    queryKey: ['activeTimer'],
    queryFn: api.getActiveTimer,
    refetchInterval: 5000,
  });
  const { data: summary } = useTimerSummary();
  const { stop } = useTimerSwitch();
  const [, setTick] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const running = Boolean(data?.running && data.started_at && data.event_id);
  const elapsed = running ? runningSec(summary, data!.event_id, data!.started_at) : 0;

  return (
    <div className="card p-4">
      <div className="s-head">
        <span className="s-title">专注计时</span>
        {running && (
          <span className="flex items-center gap-1.5 text-[11px] text-moss">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-moss" />
            进行中
          </span>
        )}
      </div>

      <div
        className={`text-[30px] font-medium leading-none tracking-[0.01em] tabular-nums ${
          running ? 'text-ink' : 'text-ink-faint'
        }`}
      >
        {fmtClock(elapsed)}
      </div>

      <div className="mt-3 flex items-center gap-2">
        {running ? (
          <button
            className="h-8 flex-1 rounded-lg bg-moss-deep text-[12.5px] font-medium text-white transition-colors hover:bg-moss disabled:opacity-50"
            onClick={() => stop.mutate(data!.event_id!)}
            disabled={stop.isPending}
          >
            结束
          </button>
        ) : (
          <div className="flex h-8 flex-1 items-center rounded-lg border border-dashed border-line px-2.5 text-[11.5px] text-ink-soft">
            点任务右侧 ▶ 开始计时
          </div>
        )}
      </div>

      <p className="mt-2.5 truncate text-[11.5px] text-ink-soft">
        {running ? <>正在做：{data?.event_title}</> : <>换一条任务会自动结束当前计时</>}
      </p>
    </div>
  );
}
