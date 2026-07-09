import { useEffect, useRef } from 'react';
import type { Task, Category } from '@/types';
import type { WidgetData, TaskWidgetItem } from '@/plugins/todo-widget';
import TodoWidget from '@/plugins/todo-widget';

/** Map task color enum to hex color for widget dot display */
const TASK_COLOR_HEX: Record<string, string> = {
  blue: '#007AFF',
  green: '#34C759',
  red: '#FF3B30',
  purple: '#AF52DE',
  yellow: '#FFCC00',
  gray: '#8E8E93',
};

/** Build the WidgetData payload from today's tasks */
function buildWidgetData(tasks: Task[]): WidgetData {
  const today = new Date();
  const dateIso = [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, '0'),
    String(today.getDate()).padStart(2, '0'),
  ].join('-');

  const weekDays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
  const dateLabel = `${today.getMonth() + 1}月${today.getDate()}日 ${weekDays[today.getDay()]}`;

  // Filter today's tasks, sort by time (timed first, ascending; untimed last)
  const todayTasks = tasks
    .filter(t => t.date === dateIso)
    .sort((a, b) => {
      if (a.time && !b.time) return -1;
      if (!a.time && b.time) return 1;
      if (!a.time && !b.time) return 0;
      return a.time.localeCompare(b.time);
    });

  const total = todayTasks.length;
  const completed = todayTasks.filter(t => t.completed).length;

  const taskItems: TaskWidgetItem[] = todayTasks.map(t => ({
    id: t.id,
    title: t.title,
    time: t.time || '',
    color: TASK_COLOR_HEX[t.color] || '#8E8E93',
    completed: t.completed,
  }));

  return { dateLabel, dateIso, tasks: taskItems, total, completed };
}

/** Check if running inside Capacitor native environment */
function isNativePlatform(): boolean {
  try {
    const win = window as any;
    return !!(win.Capacitor && win.Capacitor.isNativePlatform());
  } catch {
    return false;
  }
}

/**
 * React hook that syncs today's task data to the Android home screen widget
 * via the TodoWidget Capacitor plugin. Called with the live tasks/categories
 * arrays from useTasks — every change triggers a debounced update.
 */
export function useWidgetSync(tasks: Task[], categories: Category[]) {
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isNative = isNativePlatform();

  useEffect(() => {
    if (!isNative) return;

    // Debounce 300ms to coalesce rapid successive mutations
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      try {
        const data = buildWidgetData(tasks);
        TodoWidget.updateWidget({ data: JSON.stringify(data) });
      } catch (err) {
        console.warn('[WidgetSync] update failed:', err);
      }
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [tasks, categories, isNative]);
}
