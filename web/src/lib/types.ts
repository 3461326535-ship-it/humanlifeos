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
  /** 甘特：计划结束日（null = 单日任务） */
  end_date: string | null;
  /** 甘特：里程碑（只占一个日期点，不占工期） */
  is_milestone: number | null;
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
  /** 甘特：计划结束日（YYYY-MM-DD，不传/等于 date 即单日任务） */
  end_date?: string | null;
  /** 甘特：里程碑（1 = 里程碑，只有一个日期点） */
  is_milestone?: number | null;
  project_id?: number | null;
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

// 习惯规则（habits 表；零物化，不写 events）
export interface Habit {
  id: number;
  user_id: number;
  title: string;
  rrule: string;
  dtstart: string;
  until_date: string | null;
  start_time: string;
  end_time: string | null;
  timezone: string;
  valid_from: string;
  valid_to: string | null;
  category: string;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface HabitInput {
  title: string;
  rrule: string;
  dtstart: string;
  start_time?: string;
  end_time?: string;
  category?: string;
  until_date?: string | null;
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

// ── 甘特图（第五个板块）──
/** 依赖类型：FS 完成→开始（默认） / SS 开始→开始 / FF 完成→完成 / SF 开始→完成 */
export type DepType = 'FS' | 'SS' | 'FF' | 'SF';

export interface GanttDepRef {
  id: number;
  type: DepType;
  lag: number;
}

export interface GanttTask {
  id: number;
  title: string;
  start: string;       // YYYY-MM-DD
  end: string;         // YYYY-MM-DD（含当天）
  duration: number;    // 天数
  status: TaskStatus;
  priority: Priority | null;
  category: string;
  project_id: number | null;
  project_name: string | null;
  project_color: string | null;
  start_time: string | null;
  end_time: string | null;
  description: string;
  progress: number;             // 0-100，由子任务推导
  subtasks: { done: number; total: number };
  milestone: boolean;           // 里程碑（菱形、不占工期）
  singleDay: boolean;           // 只是恰好排了一天，仍是普通任务
  overdue: boolean;
  isCritical: boolean;
  slack: number | null;
  deps: GanttDepRef[];          // 前置任务
  successors: GanttDepRef[];    // 后续任务
}

export interface GanttEdge {
  from: number;
  to: number;
  type: DepType;
  lag: number;
}

export interface GanttProject {
  id: number;
  name: string;
  color: string | null;
  status?: string | null;
  start_date?: string | null;
  end_date?: string | null;
}

export interface GanttBoard {
  today: string;
  tasks: GanttTask[];
  projects: GanttProject[];
  deps: GanttEdge[];
  stats: {
    total: number;
    done: number;
    overdue: number;
    critical: number;
    withDependencies: number;
    milestones: number;
  };
}

export interface GanttMoveResult {
  success: boolean;
  task: { id: number; start: string; end: string };
  cascaded: number;
  moved: { id: number; title: string; start: string; end: string }[];
}

export const DEP_LABELS: Record<DepType, string> = {
  FS: '完成 → 开始',
  SS: '开始 → 开始',
  FF: '完成 → 完成',
  SF: '开始 → 完成',
};

export const DEP_SHORT: Record<DepType, string> = {
  FS: 'FS',
  SS: 'SS',
  FF: 'FF',
  SF: 'SF',
};

// ── AI 助手（后端 /api/ai：意图分类 → 确认 → 执行）──
export interface AiMessage {
  role: 'user' | 'assistant';
  message: string;
  createdAt?: string;
}

/** 单条操作的结构化数据（create / update / delete / addSubtask） */
export interface AiActionData {
  title?: string;
  date?: string;
  time?: string;
  category?: string;
  subtasks?: { title: string }[];
  parentTitle?: string;
  subtaskTitle?: string;
  onlyCompleted?: boolean;
  kind?: string;
  rrule?: string;
}

/** 后端返回的待确认动作预览，type 决定弹窗怎么渲染 */
export type AiActionType =
  | 'create'
  | 'update'
  | 'delete'
  | 'addSubtask'
  | 'batchDelete'
  | 'batchComplete'
  | 'batchUpdateDate'
  | 'projectPlan';

export interface AiActionPreview {
  type: AiActionType;
  /** 单条操作 */
  data?: AiActionData;
  /** 批量操作 */
  affectedCount?: number;
  titles?: string[];
  newDate?: string;
  /** 项目计划 */
  title?: string;
  taskCount?: number;
  phases?: { name: string; tasks: { title: string; date: string; time: string }[] }[];
}

export interface AiChatResponse {
  reply: string;
  action?: string | null;
  data?: unknown;
  needsConfirm?: boolean;
  confirmId?: string;
  actionPreview?: AiActionPreview;
  needsClarify?: boolean;
  clarifyOptions?: string[];
}

export interface AiConfirmResponse {
  success: boolean;
  reply: string;
  actionExecuted?: boolean;
  cancelled?: boolean;
}
