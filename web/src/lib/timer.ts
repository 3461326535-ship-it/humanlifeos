import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
    // 今日累计/连续表盘的基数，暂停或继续后立刻刷新，别等 10s 轮询
    qc.invalidateQueries({ queryKey: ['timerSummary'] });
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

/** 分钟数转「1h20m / 25m」，用于「今日已做」这种不跳动的地方 */
export function fmtMinutes(min: number): string {
  if (!min || min <= 0) return '0m';
  // 不足 1 分钟别显示成 0m —— 刚暂停时看到 0m 会以为没记录
  if (min < 1) return '<1m';
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  if (h <= 0) return `${m}m`;
  return m > 0 ? `${h}h${m}m` : `${h}h`;
}

export type TimerSummaryItem = {
  event_id: number;
  /** 今天该任务的总累计（含正在跑的这一段），刷新间隔 10s，适合文字展示 */
  minutes: number;
  /** 今天已结束段落的精确秒数，配合当前段做连续表盘 */
  finished_seconds: number;
  last_at: string | null;
};

export type TimerSummary = {
  from: string;
  to: string;
  total_minutes: number;
  items: TimerSummaryItem[];
  last_ended: { event_id: number; event_title: string; ended_at: string; minutes: number } | null;
};

/**
 * 进行中任务「连续」表盘的秒数 = 今天已结束段落 + 当前段。
 * 暂停后继续应该从 3:01 接着走，而不是回到 0:01 —— 暂停不清零，显示也得连续。
 */
export function runningSec(
  summary: TimerSummary | undefined,
  eventId: number | undefined,
  startedAt: string | undefined
): number {
  if (!eventId) return elapsedSec(startedAt);
  const finished = summary?.items.find((i) => i.event_id === eventId)?.finished_seconds ?? 0;
  return finished + elapsedSec(startedAt);
}

/**
 * 本地「今天」的起止，转成 DB 里存的 UTC 字符串。
 * 前端算时区，后端只管比较，避免服务器时区与用户不一致。
 */
export function todayRange(): { from: string; to: string } {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start.getTime() + 86400000);
  const toSql = (d: Date) => d.toISOString().slice(0, 19).replace('T', ' ');
  return { from: toSql(start), to: toSql(end) };
}

/** 今日按任务的累计（暂停后仍能看到已做多久） */
export function useTimerSummary() {
  const { from, to } = todayRange();
  return useQuery({
    queryKey: ['timerSummary', from, to],
    queryFn: () => api.timerSummary(from, to),
    refetchInterval: 10000,
  });
}
