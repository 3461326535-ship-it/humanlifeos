import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { fmtClock } from '../lib/timer';

/** DB 里的 'YYYY-MM-DD HH:MM:SS' 是 UTC */
function utcMs(s: string): number {
  return new Date(s.replace(' ', 'T') + 'Z').getTime();
}

/**
 * 每段时长用 started_at / ended_at 精确算秒，
 * 不用 duration_min —— 它对短段落有「至少 1 分钟」下限，40 秒会显示成 1 分。
 */
function entrySec(startedAt: string, endedAt: string): number {
  return Math.max(0, Math.round((utcMs(endedAt) - utcMs(startedAt)) / 1000));
}

function fmtDur(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0) return `${h}小时${m}分`;
  if (m > 0) return `${m}分`;
  return `${sec}秒`;
}

export default function EventTimer({ eventId }: { eventId: number }) {
  const qc = useQueryClient();
  const setTick = useState(0)[1]; // 仅取 setter，每秒重渲染以刷新进行中计时的显示

  const { data: entries } = useQuery({
    queryKey: ['timeEntries', eventId],
    queryFn: () => api.getTimeEntries(eventId),
  });

  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, [setTick]);

  const running = entries?.find((e) => e.ended_at === null);
  const loggedSec = (entries || [])
    .filter((e) => e.ended_at !== null)
    .reduce((s, e) => s + entrySec(e.started_at, e.ended_at as string), 0);

  // 连续表盘：已记录的时长 + 当前这一段，暂停后继续从原处接着走
  const liveSec = running
    ? loggedSec + Math.max(0, Math.round((Date.now() - utcMs(running.started_at)) / 1000))
    : 0;

  const startMut = useMutation({
    mutationFn: () => api.timerStart(eventId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['timeEntries', eventId] });
      qc.invalidateQueries({ queryKey: ['runningTimers'] });
      qc.invalidateQueries({ queryKey: ['timerSummary'] });
    },
  });
  const stopMut = useMutation({
    mutationFn: () => api.timerStop(eventId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['timeEntries', eventId] });
      qc.invalidateQueries({ queryKey: ['runningTimers'] });
      qc.invalidateQueries({ queryKey: ['timerSummary'] });
    },
  });

  const resume = loggedSec > 0;

  return (
    <div className="rounded-xl border border-line/70 bg-paper-deep/50 p-3">
      <div className="flex items-center justify-between">
        <span className="text-[12px] font-medium text-ink-soft">计时</span>
        {running ? (
          <button className="btn-danger text-xs" disabled={stopMut.isPending} onClick={() => stopMut.mutate()}>
            暂停
          </button>
        ) : (
          <button className="btn-primary text-xs" disabled={startMut.isPending} onClick={() => startMut.mutate()}>
            {resume ? '继续计时' : '开始计时'}
          </button>
        )}
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="font-mono text-lg font-semibold tabular-nums text-ink">
          {running ? fmtClock(liveSec) : fmtDur(loggedSec)}
        </span>
        <span className="text-[11px] text-ink-soft">
          {running ? `进行中 · 已记录 ${fmtDur(loggedSec)}` : loggedSec > 0 ? '暂停中，累计不清零' : '还没有记录'}
        </span>
      </div>
      {entries && entries.length > 0 && (
        <ul className="mt-2 space-y-1 text-[11px] text-ink-soft">
          {entries.slice(0, 5).map((e) => (
            <li key={e.id} className="flex justify-between">
              <span>
                {e.started_at?.slice(0, 10)} {e.started_at?.slice(11, 16)}
              </span>
              <span>{e.ended_at ? fmtDur(entrySec(e.started_at, e.ended_at)) : '进行中'}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
