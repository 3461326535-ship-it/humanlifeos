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

  if (!data?.running || !data.started_at) return null;

  const elapsed = Math.max(
    0,
    Math.round((Date.now() - new Date(data.started_at.replace(' ', 'T') + 'Z').getTime()) / 1000)
  );

  return (
    <span className="flex items-center gap-1.5 rounded-full bg-indigo-50 px-2.5 py-1 text-[12px] font-medium text-indigo-600">
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-indigo-500" />
      <span className="font-mono tabular-nums">{fmtClock(elapsed)}</span>
      <span className="max-w-[120px] truncate text-indigo-500">{data.event_title}</span>
      <button
        className="ml-0.5 text-indigo-400 hover:text-indigo-700"
        onClick={() => stopMut.mutate()}
        aria-label="停止计时"
      >
        ✕
      </button>
    </span>
  );
}
