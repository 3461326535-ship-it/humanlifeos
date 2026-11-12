import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';

function fmtClock(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const p = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${p(h)}:${p(m)}:${p(s)}` : `${p(m)}:${p(s)}`;
}

export default function ActiveTimer() {
  const qc = useQueryClient();
  const setTick = useState(0)[1];
  const { data } = useQuery({
    queryKey: ['activeTimer'],
    queryFn: api.getActiveTimer,
    refetchInterval: 5000,
  });

  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, [setTick]);

  const stopMut = useMutation({
    mutationFn: () => api.timerStop(data!.event_id!),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['activeTimer'] });
      qc.invalidateQueries({ queryKey: ['events'] });
    },
  });

  const running = Boolean(data?.running && data.started_at);
  const elapsed = running
    ? Math.max(
        0,
        Math.round((Date.now() - new Date(data!.started_at!.replace(' ', 'T') + 'Z').getTime()) / 1000)
      )
    : 0;

  return (
    <div className="card p-4">
      <div className="s-head">
        <span className="s-title">专注计时</span>
        {running ? (
          <span className="flex items-center gap-1.5 text-[11px] text-moss">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-moss" />
            进行中
          </span>
        ) : (
          <span className="text-[11px] text-ink-faint">未开始</span>
        )}
      </div>

      {running ? (
        <>
          <div className="text-[26px] font-medium leading-none tracking-[0.01em] tabular-nums text-moss">
            {fmtClock(elapsed)}
          </div>
          <p className="mt-2 truncate text-[12px] text-ink-mid" title={data?.event_title}>
            正在做：{data?.event_title}
          </p>
          <button
            className="btn-ghost mt-3 h-8 w-full border border-line text-[12px]"
            onClick={() => stopMut.mutate()}
            disabled={stopMut.isPending}
          >
            结束计时
          </button>
        </>
      ) : (
        <p className="text-[12px] leading-6 text-ink-soft">
          在任务详情里点「开始计时」，这里会显示秒表。
        </p>
      )}
    </div>
  );
}
