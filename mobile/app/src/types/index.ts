export interface SubTask {
  id: string;
  title: string;
  completed: boolean;
}

export interface Category {
  id: string;
  name: string;
  color: string;
}

export interface Task {
  id: string;
  title: string;
  time: string;
  date: string;
  color: 'blue' | 'green' | 'red' | 'purple' | 'yellow' | 'gray';
  completed: boolean;
  categoryId: string;
  description?: string;
  recurrence?: 'daily' | 'weekly' | 'monthly' | 'yearly' | null;
  recurrenceEndDate?: string;
  subtasks?: SubTask[];
  /** 同步状态 (前端元数据，不传到后端) */
  _syncStatus?: 'synced' | 'pending' | 'failed' | 'local';
  /** 最后本地修改时间 (毫秒时间戳) */
  _updatedAt?: number;
}

export interface SyncStatus {
  state: 'synced' | 'syncing' | 'pending' | 'failed' | 'offline';
  pendingCount: number;
  lastSyncedAt?: number;
}

export type TabId = 'today' | 'calendar' | 'stats' | 'assistant' | 'profile';

export type ViewMode = 'week' | 'month';

export type TimeRange = 'week' | 'month' | 'year';

export interface CategoryStat {
  category: Category;
  completedCount: number;
  totalCount: number;
}
