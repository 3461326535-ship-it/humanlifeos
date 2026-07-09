import { useMemo } from 'react';
import type { TimeRange, Task } from '@/types';

/** 周一 */
export function getWeekStart(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  date.setDate(diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

/** 周日 */
export function getWeekEnd(d: Date): Date {
  const start = getWeekStart(d);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return end;
}

export function getMonthStart(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export function getMonthEnd(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
}

export function getYearStart(d: Date): Date {
  return new Date(d.getFullYear(), 0, 1);
}

export function getYearEnd(d: Date): Date {
  return new Date(d.getFullYear(), 11, 31, 23, 59, 59, 999);
}

/** 将 "YYYY-MM-DD" 字符串解析为 Date 对象 */
export function parseDateKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** 生成今天的日期字符串 "YYYY-MM-DD" */
export function getTodayStr(): string {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
}

interface TimeRangeResult {
  start: Date;
  end: Date;
  /** 过滤出在时间范围内的所有任务 */
  filterByRange: (tasks: Task[]) => Task[];
  /** 过滤出在时间范围内且属于某分类的任务 */
  filterByCategory: (tasks: Task[], categoryId: string) => Task[];
}

export function useTimeRange(timeRange: TimeRange): TimeRangeResult {
  const now = new Date();

  return useMemo(() => {
    let start: Date;
    let end: Date;

    switch (timeRange) {
      case 'week':
        start = getWeekStart(now);
        end = getWeekEnd(now);
        break;
      case 'month':
        start = getMonthStart(now);
        end = getMonthEnd(now);
        break;
      case 'year':
        start = getYearStart(now);
        end = getYearEnd(now);
        break;
    }

    const inRange = (d: Date) => d >= start && d <= end;

    const filterByRange = (tasks: Task[]) =>
      tasks.filter((t) => inRange(parseDateKey(t.date)));

    const filterByCategory = (tasks: Task[], categoryId: string) =>
      tasks.filter((t) => t.categoryId === categoryId && inRange(parseDateKey(t.date)));

    return { start, end, filterByRange, filterByCategory };
  }, [timeRange]);
}

/** 计算逾期天数（任务日期比今天早多少天） */
export function getOverdueDays(dateKey: string): number {
  const taskDate = parseDateKey(dateKey);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  taskDate.setHours(0, 0, 0, 0);
  return Math.round((today.getTime() - taskDate.getTime()) / (1000 * 60 * 60 * 24));
}

/** 友好的逾期描述 */
export function overdueLabel(days: number): string {
  if (days === 0) return '今天到期';
  if (days === 1) return '逾期1天';
  if (days <= 3) return `逾期${days}天`;
  if (days <= 7) return `逾期${days}天`;
  if (days <= 30) return `逾期${Math.floor(days / 7)}周`;
  return `逾期${Math.floor(days / 30)}月+`;
}

export default useTimeRange;
