import type { Task, Category } from '@/types';

const KEYS = {
  tasks: 'offline_tasks',
  categories: 'offline_categories',
  deletedIds: 'offline_deleted_ids',
};

// ===== Tasks =====

export function loadTasks(): Task[] {
  try {
    const raw = localStorage.getItem(KEYS.tasks);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    // 标准化：没有 _syncStatus 的旧数据视为 synced
    return arr.map((t: Task) => ({
      ...t,
      _syncStatus: t._syncStatus || 'synced',
      _updatedAt: t._updatedAt || 0,
    }));
  } catch {
    return [];
  }
}

export function saveTasks(tasks: Task[]): void {
  try {
    localStorage.setItem(KEYS.tasks, JSON.stringify(tasks));
  } catch {
    // localStorage full or unavailable
  }
}

// ===== Categories =====

const defaultCategories: Category[] = [
  { id: 'work', name: '工作', color: '#E8887E' },
  { id: 'life', name: '生活', color: '#34C759' },
  { id: 'other', name: '其他', color: '#FFCC00' },
];

export function loadCategories(): Category[] {
  try {
    const raw = localStorage.getItem(KEYS.categories);
    if (!raw) return [...defaultCategories];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr) || arr.length === 0) return [...defaultCategories];
    // 迁移旧颜色：旧的蓝色 (#4A90D9) → 马卡龙珊瑚红 (#E8887E)
    let migrated = false;
    for (const cat of arr) {
      if (cat.color === '#4A90D9') {
        cat.color = '#E8887E';
        migrated = true;
      }
    }
    if (migrated) saveCategories(arr);
    return arr;
  } catch {
    return [...defaultCategories];
  }
}

export function saveCategories(cats: Category[]): void {
  try {
    localStorage.setItem(KEYS.categories, JSON.stringify(cats));
  } catch {
    // ignore
  }
}

// ===== Deleted IDs (待同步删除) =====

export function getDeletedIds(): string[] {
  try {
    const raw = localStorage.getItem(KEYS.deletedIds);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export function addDeletedId(id: string): void {
  const ids = getDeletedIds();
  if (!ids.includes(id)) {
    ids.push(id);
    saveDeletedIds(ids);
  }
}

export function removeDeletedId(id: string): void {
  const ids = getDeletedIds().filter(d => d !== id);
  saveDeletedIds(ids);
}

export function clearDeletedIds(): void {
  saveDeletedIds([]);
}

function saveDeletedIds(ids: string[]): void {
  try {
    localStorage.setItem(KEYS.deletedIds, JSON.stringify(ids));
  } catch {
    // ignore
  }
}

// ===== Local ID generator =====

let idCounter = 0;
export function generateLocalId(): string {
  idCounter++;
  return `local_${Date.now()}_${idCounter.toString(36)}`;
}

/** 判断是否为本地临时 ID */
export function isLocalId(id: string): boolean {
  return id.startsWith('local_');
}
