import { useQuery } from '@tanstack/react-query';
import { api } from './api';

/** 一段实际执行的任务计时（已按窗口裁剪；end_ts 对进行中的段等于取数时刻） */
export type ActualSegment = {
  id: number;
  event_id: number;
  title: string;
  status: string;
  started_at: string;
  ended_at: string | null;
  running: boolean;
  start_ts: number;
  end_ts: number;
  seconds: number;
};

/** 一条已打卡习惯占用的时段 */
export type ActualHabitSpan = {
  habit_id: number;
  title: string;
  date: string;
  status: string;
  start_ts: number;
  end_ts: number;
  seconds: number;
};

export type ActualLoad = {
  fromTs: string;
  toTs: string;
  fromDay: string;
  toDay: string;
  tzOffsetMin: number;
  /** 去重后的实际投入（任务 ∪ 习惯） */
  total_minutes: number;
  sum_minutes: number;
  overlap_minutes: number;
  task_minutes: number;
  task_sum_minutes: number;
  habit_minutes: number;
  habit_sum_minutes: number;
  segments: ActualSegment[];
  habits: ActualHabitSpan[];
};

/** 本地时区偏移（东八区 = 480），后端据此把习惯的「本地时间」落到绝对时间轴上 */
export const tzOffsetMin = () => -new Date().getTimezoneOffset();

const pad = (n: number) => String(n).padStart(2, '0');
export const dayStr = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const sqlTs = (d: Date) => d.toISOString().slice(0, 19).replace('T', ' ');

export type LoadWindow = { fromTs: string; toTs: string; fromDay: string; toDay: string };

/** 本地某天 00:00 → 次日 00:00 */
export function dayWindow(day: string): LoadWindow {
  const [y, m, d] = day.split('-').map(Number);
  const start = new Date(y, m - 1, d, 0, 0, 0, 0);
  const end = new Date(y, m - 1, d + 1, 0, 0, 0, 0);
  return { fromTs: sqlTs(start), toTs: sqlTs(end), fromDay: day, toDay: day };
}

/** 本地日期区间 [fromDay, toDay] 的整天窗口（含两端） */
export function spanWindow(fromDay: string, toDay: string): LoadWindow {
  const [y, m, d] = fromDay.split('-').map(Number);
  const start = new Date(y, m - 1, d, 0, 0, 0, 0);
  const [y2, m2, d2] = toDay.split('-').map(Number);
  const end = new Date(y2, m2 - 1, d2 + 1, 0, 0, 0, 0);
  return { fromTs: sqlTs(start), toTs: sqlTs(end), fromDay, toDay };
}

/** 今天（本地）的实际投入：含习惯、按时间轴去重 */
export function useActualLoad(w: LoadWindow, enabled = true) {
  return useQuery({
    queryKey: ['actualLoad', w.fromTs, w.toTs],
    queryFn: () => api.timelineActual({ ...w, tz: tzOffsetMin() }),
    // 进行中的段每秒在本地延伸，这里只需要时不时对齐一下别处的写入
    refetchInterval: 30000,
    enabled,
  });
}
