export type TaskStatus = 'todo' | 'in_progress' | 'review' | 'done';
export type Priority = 'low' | 'medium' | 'high';
export type Recurrence = 'daily' | 'weekly' | 'monthly' | 'yearly';

export interface Subtask {
  id: number;
  event_id: number;
  title: string;
  completed: boolean;
}

export interface TodoEvent {
  id: number;
  title: string;
  date: string;           // YYYY-MM-DD
  time: string;           // HH:MM（旧兼容字段，可能为 ''）
  category: string;
  description: string;
  status: TaskStatus;
  completed: boolean;     // 只读：由 status 派生
  start_time: string | null;
  end_time: string | null;
  project_id: number | null;
  position: number | null;
  completed_at: string | null;
  sort_date: string | null;
  priority: Priority | null;
  reminder: boolean;
  recurrence: Recurrence | null;
  recurrence_end_date: string | null;
  created_at: string;
  updated_at: string;
  subtasks: Subtask[];
}

export interface EventInput {
  title: string;
  date: string;
  time: string;
  category?: string;
  description?: string;
  status?: TaskStatus;
  reminder?: number;
  subtasks?: { title: string; completed: boolean }[];
  recurrence?: string | null;
  recurrence_end_date?: string | null;
  priority?: string | null;
}

export interface AuthUser {
  username: string;
  isDefaultPassword: boolean;
}

export type HabitStatus = 'done' | 'skipped' | 'excused' | 'pending';

export interface HabitOccurrence {
  habit_id: number;
  title: string;
  date: string;
  time: string;
  category: string;
  rrule: string;
  status: HabitStatus;
  reason: string | null;
  completed_at: string | null;
}

export interface StatsOverview {
  range: number;
  totals: {
    all: number;
    todo: number;
    in_progress: number;
    review: number;
    done: number;
    completionRate: number;
    createdInRange: number;
  };
  trend: { day: string; n: number }[];
  statusDistribution: Record<TaskStatus, number>;
  projectHours: { id: number; name: string; color: string | null; minutes: number; entries: number }[];
}

export interface DailyReport {
  date: string;
  completedCount: number;
  completed: { id: number; title: string; category: string; project_id: number | null; completed_at: string }[];
  createdCount: number;
  time: { entries: number; minutes: number; hours: number };
  notes: { id: number; content: string; created_at: string }[];
  summary: string;
}

export const STATUS_LABELS: Record<TaskStatus, string> = {
  todo: '待开始',
  in_progress: '进行中',
  review: '待审核',
  done: '已完成',
};

export const PRIORITY_LABELS: Record<Priority, string> = {
  low: '低',
  medium: '中',
  high: '高',
};

export const RECURRENCE_LABELS: Record<Recurrence, string> = {
  daily: '每天',
  weekly: '每周',
  monthly: '每月',
  yearly: '每年',
};

export const DEFAULT_CATEGORIES = ['其他', '工作', '学习', '生活', '健康'];
