import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from './api';

export type ActiveTimerInfo = {
  running: boolean;
  id?: number;
  event_id?: number;
  event_title?: string;
  event_status?: string;
  started_at?: string;
  elapsed?: number;
};

/**
 * 计时器统一开关。
 *
 * 后端允许多个任务同时有进行中的 time_entries，但 /api/timers/active 只返回最新一条，
 * UI 也按「同一时间只专注一件事」呈现。因此在这里落实单专注语义：
 * 开始新任务前先结束别处正在进行的计时，避免出现「库里两条在跑、界面只显示一条」。
 */
export function useTimerSwitch() {
  const qc = useQueryClient();
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['activeTimer'] });
    qc.invalidateQueries({ queryKey: ['events'] });
    qc.invalidateQueries({ queryKey: ['timeEntries'] });
  };

  const start = useMutation({
    mutationFn: async (id: number) => {
      const cur = await api.getActiveTimer();
      if (cur.running && cur.event_id && cur.event_id !== id) {
        try {
          await api.timerStop(cur.event_id);
        } catch {
          // 旧计时可能刚被详情弹窗 / 别的页面结束，不该卡住新任务开始
        }
      }
      return api.timerStart(id);
    },
    onSuccess: refresh,
  });

  const stop = useMutation({
    mutationFn: (id: number) => api.timerStop(id),
    onSuccess: refresh,
  });

  return { start, stop };
}

/** DB 里的 'YYYY-MM-DD HH:MM:SS' 是 UTC，换算成已进行秒数 */
export function elapsedSec(startedAt?: string): number {
  if (!startedAt) return 0;
  const ms = new Date(startedAt.replace(' ', 'T') + 'Z').getTime();
  return Number.isFinite(ms) ? Math.max(0, Math.round((Date.now() - ms) / 1000)) : 0;
}

export function fmtClock(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const p = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${p(h)}:${p(m)}:${p(s)}` : `${p(m)}:${p(s)}`;
}
