import type { Task, Category } from '@/types';

// ===== Auth =====

/** 自动附加登录 token 的 fetch 封装（统一版，消除重复） */
export function authFetch(url: string, opts?: RequestInit) {
  const token = localStorage.getItem('auth_token');
  if (token) {
    opts = opts || {};
    opts.headers = { ...opts.headers, Authorization: `Bearer ${token}` };
  }
  return fetch(url, opts);
}

// ===== 分类 / 颜色映射 =====

export const CATEGORY_NORMALIZE: Record<string, string> = {
  'Other': '其他',
  'Sales': '工作',
  'Marketing': '生活',
};

export function normalizeCategoryName(raw: string): string {
  return CATEGORY_NORMALIZE[raw] || raw;
}

/** 十六进制颜色 → Task.color 名称 */
export function hexToColorName(hex: string): Task['color'] {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);

  // Warm reddish tones: coral, salmon, pink, brick, etc.
  // Dominant red channel with moderate green/blue (catches #E8887E 珊瑚红)
  if (r > g && r > b && r > 150 && g < 200 && b < 200) return 'red';
  if (r > 150 && g < 100 && b < 100) return 'red';
  if (r < 100 && g > 150 && b < 100) return 'green';
  if (r < 100 && g < 100 && b > 150) return 'blue';
  // Orange / amber tones (catches #FF9500 etc.)
  if (r > 200 && g > 100 && b < 80) return 'yellow';
  if (r > 100 && g < 100 && b > 150) return 'purple';
  if (r < 120 && g < 120 && b < 120) return 'gray';
  // Blue-green / teal (#00C7BE etc.) → closer to green
  if (g > 120 && b > 120 && r < 100) return 'green';
  return 'blue';
}

// ===== COLORS palette =====

export const COLORS = [
  '#E8887E', '#34C759', '#FF3B30', '#FFCC00', '#AF52DE',
  '#5AC8FA', '#FF9500', '#5856D6', '#FF2D55', '#00C7BE',
];

// ===== 事件 ↔ 任务转换 =====

/** 后端 event → 前端 Task */
export function eventToTask(event: any, categories: Category[]): Task {
  const catName = normalizeCategoryName(event.category || '其他');
  const cat = categories.find(c => c.name === catName) || categories.find(c => c.id === 'other') || categories[0];
  return {
    id: String(event.id),
    title: event.title || '',
    time: event.time || '',
    date: event.date || '',
    color: hexToColorName(cat?.color || '#8E8E93'),
    completed: !!event.completed,
    categoryId: cat?.id || 'other',
    description: event.description || '',
    recurrence: event.recurrence || null,
    recurrenceEndDate: event.recurrence_end_date || undefined,
    subtasks: (event.subtasks || []).map((st: any) => ({
      id: String(st.id),
      title: st.title,
      completed: !!st.completed,
    })),
    _syncStatus: 'synced',
    _updatedAt: Date.now(),
  };
}

/** 前端 Task → 后端请求体 */
export function taskToPayload(task: Task, categoryName: string): Record<string, any> {
  const payload: Record<string, any> = {
    title: task.title,
    date: task.date,
    time: task.time,
    category: normalizeCategoryName(categoryName || '其他'),
    description: task.description || '',
    completed: task.completed,
    reminder: false,
    subtasks: (task.subtasks || []).map(st => ({
      title: st.title,
      completed: st.completed,
    })),
  };
  if (task.recurrence) {
    payload.recurrence = task.recurrence;
    if (task.recurrenceEndDate) {
      payload.recurrence_end_date = task.recurrenceEndDate;
    }
  }
  return payload;
}

/** 确保所有 event.category 都有对应的本地分类 */
export function syncCategories(events: any[], existingCats: Category[]): Category[] {
  const result = [...existingCats];
  const existingNames = new Set(result.map(c => c.name));
  events.forEach((event: any) => {
    const rawName = event.category;
    if (!rawName) return;
    const name = normalizeCategoryName(rawName);
    if (!existingNames.has(name)) {
      const usedColors = new Set(result.map(c => c.color));
      const color = COLORS.find(c => !usedColors.has(c)) || COLORS[result.length % COLORS.length];
      const id = 'cat_' + name.toLowerCase().replace(/[^a-z0-9一-鿿]/g, '_');
      result.push({ id, name, color });
      existingNames.add(name);
    }
  });
  return result;
}
