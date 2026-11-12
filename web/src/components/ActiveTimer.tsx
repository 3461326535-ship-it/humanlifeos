import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';

function fmtClock(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(h)}:${p(m)}:${p(s)}`;
}

/**
 * 右栏「专注计时」卡。
 * 未在计时时，「开始」会在传入的第一条待办上开计时（taskId / taskTitle 由今天页给）。
 */
export default function ActiveTimer({ taskId, taskTitle }: { taskId?: number; taskTitle?: string }) {
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

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['activeTimer'] });
    qc.invalidateQueries({ queryKey: ['events'] });
  };

  const startMut = useMutation({
    mutationFn: (id: number) => api.timerStart(id),
    onSuccess: refresh,
  });
  const stopMut = useMutation({
    mutationFn: (id: number) => api.timerStop(id),
    onSuccess: refresh,
  });

  const running = Boolean(data?.running && data.started_at);
  const elapsed = running
    ? Math.max(0, Math.round((Date.now() - new Date(data!.started_at!.replace(' ', 'T') + 'Z').getTime()) / 1000))
    : 0;

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

      <div className={`text-[30px] font-medium leading-none tracking-[0.01em] tabular-nums ${running ? 'text-ink' : 'text-ink-faint'}`}>
        {fmtClock(elapsed)}
      </div>

      <div className="mt-3 flex items-center gap-2">
        {running ? (
          <button
            className="h-8 flex-1 rounded-lg bg-moss-deep text-[12.5px] font-medium text-white transition-colors hover:bg-moss disabled:opacity-50"
            onClick={() => stopMut.mutate(data!.event_id!)}
            disabled={stopMut.isPending}
          >
            结束
          </button>
        ) : (
          <button
            className="h-8 flex-1 rounded-lg bg-moss-deep text-[12.5px] font-medium text-white transition-colors hover:bg-moss disabled:cursor-not-allowed disabled:opacity-40"
            onClick={() => taskId && startMut.mutate(taskId)}
            disabled={!taskId || startMut.isPending}
            title={taskId ? `在「${taskTitle}」上开始计时` : '当前没有待办任务'}
          >
            开始
          </button>
        )}
        <button
          className="h-8 flex-1 rounded-lg border border-line text-[12.5px] text-ink-mid transition-colors hover:bg-paper-deep disabled:cursor-not-allowed disabled:opacity-40"
          onClick={() => data?.event_id && stopMut.mutate(data.event_id)}
          disabled={!running || stopMut.isPending}
          title="停止并清零本次计时"
        >
          重置
        </button>
      </div>

      <p className="mt-2.5 truncate text-[11.5px] text-ink-soft">
        {running ? (
          <>正在做：{data?.event_title}</>
        ) : taskId ? (
          <>开始后会在「{taskTitle}」上计时</>
        ) : (
          <>今天没有待办，先加一条任务</>
        )}
      </p>
    </div>
  );
}
