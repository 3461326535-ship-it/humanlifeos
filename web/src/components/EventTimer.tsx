import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';

function fmtDuration(min: number): string {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h > 0 ? `${h}小时${m}分` : `${m}分`;
}
function fmtClock(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const p = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${p(h)}:${p(m)}:${p(s)}` : `${p(m)}:${p(s)}`;
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
  const loggedMin = (entries || [])
    .filter((e) => e.ended_at !== null)
    .reduce((s, e) => s + (e.duration_min || 0), 0);

  const startMut = useMutation({
    mutationFn: () => api.timerStart(eventId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['timeEntries', eventId] }),
  });
  const stopMut = useMutation({
    mutationFn: () => api.timerStop(eventId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['timeEntries', eventId] });
      qc.invalidateQueries({ queryKey: ['activeTimer'] });
    },
  });

  const elapsedSec = running
    ? Math.max(0, Math.round((Date.now() - new Date(running.started_at.replace(' ', 'T') + 'Z').getTime()) / 1000))
    : 0;

  return (
    <div className="rounded-xl border border-line/70 bg-paper-deep/50 p-3">
      <div className="flex items-center justify-between">
        <span className="text-[12px] font-medium text-ink-soft">计时</span>
        {running ? (
          <button className="btn-danger text-xs" disabled={stopMut.isPending} onClick={() => stopMut.mutate()}>
            停止
          </button>
        ) : (
          <button className="btn-primary text-xs" disabled={startMut.isPending} onClick={() => startMut.mutate()}>
            开始计时
          </button>
        )}
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="font-mono text-lg font-semibold tabular-nums text-ink">
          {running ? fmtClock(elapsedSec) : fmtDuration(loggedMin)}
        </span>
        <span className="text-[11px] text-ink-soft">
          {running ? '进行中' : `已记录 ${fmtDuration(loggedMin)}`}
        </span>
      </div>
      {entries && entries.length > 0 && (
        <ul className="mt-2 space-y-1 text-[11px] text-ink-soft">
          {entries.slice(0, 5).map((e) => (
            <li key={e.id} className="flex justify-between">
              <span>
                {e.started_at?.slice(0, 10)} {e.started_at?.slice(11, 16)}
              </span>
              <span>{e.ended_at ? fmtDuration(e.duration_min || 0) : '进行中'}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
