import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import type { Task, Category, CategoryStat, SyncStatus } from '@/types';
import { authFetch, normalizeCategoryName, hexToColorName, COLORS } from '@/lib/taskMapping';
import { loadTasks as loadLocalTasks, saveTasks, loadCategories, saveCategories, generateLocalId, isLocalId, addDeletedId } from '@/lib/storage';
import { fullSync, pushTask, deleteRemoteTask, deleteRemoteTaskChain, migrateGuestData } from '@/lib/sync';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { scheduleTaskReminder, cancelTaskReminder } from '@/lib/notifySchedule';
import { API_BASE } from '@/config';

// ── 辅助：类型安全的 syncStatus 标记 ──
type SyncMark = NonNullable<Task['_syncStatus']>;

function withSync<T extends Task>(t: T, mark: SyncMark): T {
  return { ...t, _syncStatus: mark, _updatedAt: Date.now() };
}

// ===== Hook =====
export function useTasks() {
  // ── 初始化：从 localStorage 加载 ──
  const [tasks, setTasks] = useState<Task[]>(() => loadLocalTasks());
  const [categories, setCategories] = useState<Category[]>(() => loadCategories());
  const [loading, setLoading] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({
    state: navigator.onLine ? 'synced' : 'offline',
    pendingCount: 0,
  });

  const categoriesRef = useRef(categories);
  categoriesRef.current = categories;
  const tasksRef = useRef(tasks);
  tasksRef.current = tasks;
  const syncStatusRef = useRef(syncStatus);
  syncStatusRef.current = syncStatus;
  const isSyncingRef = useRef(false);
  const initialSyncDoneRef = useRef(false);

  const isOnline = useNetworkStatus();
  const isLoggedIn = useCallback(() => !!localStorage.getItem('auth_token'), []);

  // ── 辅助：将 tasks 保存到 localStorage 并更新 React state ──
  const saveAndSet = useCallback((newTasks: Task[], newCats?: Category[]) => {
    setTasks(newTasks);
    saveTasks(newTasks);
    if (newCats) {
      setCategories(newCats);
      saveCategories(newCats);
    }
  }, []);

  // ── 更新同步状态 ──
  const updateSyncStatus = useCallback(() => {
    const currentTasks = tasksRef.current;
    const pending = currentTasks.filter(t =>
      t._syncStatus === 'pending' || t._syncStatus === 'failed' || t._syncStatus === 'local'
    );
    const failed = currentTasks.filter(t => t._syncStatus === 'failed');
    setSyncStatus({
      state: !navigator.onLine ? 'offline'
        : isSyncingRef.current ? 'syncing'
        : failed.length > 0 ? 'failed'
        : pending.length > 0 ? 'pending'
        : 'synced',
      pendingCount: pending.length,
      lastSyncedAt: pending.length === 0 ? Date.now() : syncStatusRef.current.lastSyncedAt,
    });
  }, []);

  // ── 后台同步 ──
  const syncNow = useCallback(async () => {
    if (isSyncingRef.current) return;
    isSyncingRef.current = true;
    setSyncStatus(prev => ({ ...prev, state: 'syncing' }));

    try {
      // 登录后先迁移访客数据
      if (isLoggedIn()) {
        await migrateGuestData();
      }

      const result = await fullSync(tasksRef.current, categoriesRef.current);
      saveAndSet(result.tasks, result.categories);
    } catch (err) {
      console.error('[Sync] fullSync error:', err);
    } finally {
      isSyncingRef.current = false;
      updateSyncStatus();
    }
  }, [isLoggedIn, saveAndSet, updateSyncStatus]);

  // ── 初始加载 + 网络恢复时自动同步 ──
  useEffect(() => {
    if (!initialSyncDoneRef.current) {
      initialSyncDoneRef.current = true;

      // 首次加载：如果 localStorage 为空，尝试从服务器获取
      const localTasks = loadLocalTasks();
      if (localTasks.length === 0 && isOnline && isLoggedIn()) {
        setLoading(true);
        syncNow().finally(() => setLoading(false));
      } else if (localTasks.length > 0) {
        // 有本地数据，后台同步
        updateSyncStatus();
        if (isOnline && isLoggedIn()) {
          syncNow();
        }
      } else {
        updateSyncStatus();
      }
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── 网络恢复时自动同步 ──
  const wasOnlineRef = useRef(isOnline);
  useEffect(() => {
    if (isOnline && !wasOnlineRef.current && isLoggedIn()) {
      // Came back online — sync pending changes
      syncNow();
    }
    wasOnlineRef.current = isOnline;
    if (!isOnline) {
      setSyncStatus(prev => ({ ...prev, state: 'offline' }));
    }
  }, [isOnline, isLoggedIn, syncNow]);

  // ── 监听 AI / 外部事件触发同步 ──
  useEffect(() => {
    const handleTasksChanged = () => {
      if (isOnline && isLoggedIn()) syncNow();
    };
    // 账号切换/登出时：清空内存数据并重新加载
    const handleAuthChanged = () => {
      const localTasks = loadLocalTasks();
      const localCats = loadCategories();
      setTasks(localTasks);
      setCategories(localCats);
      updateSyncStatus();
      if (isOnline && isLoggedIn()) syncNow();
    };
    window.addEventListener('tasks-changed', handleTasksChanged);
    window.addEventListener('auth-changed', handleAuthChanged);
    return () => {
      window.removeEventListener('tasks-changed', handleTasksChanged);
      window.removeEventListener('auth-changed', handleAuthChanged);
    };
  }, [isOnline, isLoggedIn, syncNow, updateSyncStatus]);

  // ── 保存 categories 到 localStorage ──
  useEffect(() => {
    saveCategories(categories);
  }, [categories]);

  // ── 任务变化时更新同步状态 ──
  useEffect(() => {
    updateSyncStatus();
  }, [tasks, updateSyncStatus]);

  // ========== 任务 CRUD（本地优先）==========

  // ---- 新增任务 ----
  const addTask = useCallback(
    async (taskInfo: {
      title: string;
      time: string;
      categoryId: string;
      color: string;
      description?: string;
      recurrence?: string | null;
      recurrenceEndDate?: string;
      subtasks?: { title: string; completed: boolean }[];
    }, date: string) => {
      const cats = categoriesRef.current;
      const cat = cats.find(c => c.id === taskInfo.categoryId) || cats[0];
      const localId = generateLocalId();

      const newTask: Task = {
        id: localId,
        title: taskInfo.title,
        date,
        time: taskInfo.time,
        color: taskInfo.color as Task['color'],
        completed: false,
        categoryId: cat?.id || 'other',
        description: taskInfo.description || '',
        recurrence: (taskInfo.recurrence as Task['recurrence']) || null,
        recurrenceEndDate: taskInfo.recurrenceEndDate || undefined,
        subtasks: taskInfo.subtasks
          ? taskInfo.subtasks.map((st, i) => ({ id: `st_${Date.now()}_${i}`, title: st.title, completed: st.completed }))
          : [],
        _syncStatus: 'local',
        _updatedAt: Date.now(),
      };

      // 立即更新本地
      setTasks(prev => {
        const updated = [...prev, newTask];
        saveTasks(updated);
        return updated;
      });

      // 预调度系统通知（任务开始前 15 分钟）
      scheduleTaskReminder(newTask.id, newTask.title, newTask.date, newTask.time);

      // 如果在线，尝试同步到服务端
      if (navigator.onLine) {
        try {
          const result = await pushTask(newTask, cat?.name || '其他');
          if (result.ok && result.serverId) {
            setTasks(prev => {
              const updated = prev.map(t => {
                if (t.id === localId) {
                  return withSync({ ...t, id: result.serverId! }, 'synced');
                }
                return t;
              });
              saveTasks(updated);
              return updated;
            });
          } else {
            markFailed(localId);
          }
        } catch {
          markFailed(localId);
        }
      }
    },
    []
  );

  // 标记同步失败
  const markFailed = useCallback((taskId: string) => {
    setTasks(prev => {
      const updated = prev.map(t =>
        t.id === taskId ? { ...t, _syncStatus: 'failed' as const } : t
      );
      saveTasks(updated);
      return updated;
    });
  }, []);

  // ---- 更新任务（本地优先 + 后台同步）----
  const updateTask = useCallback(
    async (taskId: string, updates: {
      title?: string;
      time?: string;
      categoryId?: string;
      color?: string;
      description?: string;
      recurrence?: string | null;
      recurrenceEndDate?: string;
      subtasks?: { title: string; completed: boolean }[];
    }) => {
      const cats = categoriesRef.current;
      const currentTask = tasksRef.current.find(t => t.id === taskId);
      if (!currentTask) return;

      const cat = updates.categoryId
        ? cats.find(c => c.id === updates.categoryId) || cats[0]
        : cats.find(c => c.id === currentTask.categoryId) || cats[0];

      const newSyncStatus: SyncMark = currentTask._syncStatus === 'local' ? 'local' : 'pending';
      const merged: Task = {
        ...currentTask,
        title: updates.title ?? currentTask.title,
        time: updates.time ?? currentTask.time,
        categoryId: updates.categoryId ?? currentTask.categoryId,
        color: (updates.color as Task['color']) ?? currentTask.color,
        description: updates.description !== undefined ? updates.description : currentTask.description,
        recurrence: updates.recurrence !== undefined ? (updates.recurrence as Task['recurrence']) : currentTask.recurrence,
        recurrenceEndDate: updates.recurrenceEndDate !== undefined ? updates.recurrenceEndDate : currentTask.recurrenceEndDate,
        subtasks: updates.subtasks
          ? updates.subtasks.map((st, i) => ({ id: (st as any).id || `st_${Date.now()}_${i}`, title: st.title, completed: st.completed }))
          : currentTask.subtasks,
        _syncStatus: newSyncStatus,
        _updatedAt: Date.now(),
      };

      // 如果时间变了，取消旧通知并重新调度
      if (updates.time !== undefined) {
        cancelTaskReminder(taskId);
        scheduleTaskReminder(merged.id, merged.title, currentTask.date, merged.time);
      }

      // 立即更新本地
      setTasks(prev => {
        const updated = prev.map(t => t.id === taskId ? merged : t);
        saveTasks(updated);
        return updated;
      });

      // 后台同步
      if (navigator.onLine && !isLocalId(taskId)) {
        try {
          const result = await pushTask(merged, cat?.name || '其他');
          if (result.ok) {
            setTasks(prev => {
              const updated = prev.map(t =>
                t.id === taskId ? withSync(t, 'synced') : t
              );
              saveTasks(updated);
              return updated;
            });
          } else {
            markFailed(taskId);
          }
        } catch {
          markFailed(taskId);
        }
      }
    },
    [markFailed]
  );

  // ---- 删除任务（本地优先）----
  const deleteTask = useCallback(async (taskId: string) => {
    // 取消预调度的通知
    cancelTaskReminder(taskId);

    // 立即更新本地
    setTasks(prev => {
      const updated = prev.filter(t => t.id !== taskId);
      saveTasks(updated);
      return updated;
    });

    // 记下待同步删除的 ID
    if (!isLocalId(taskId)) {
      addDeletedId(taskId);
    }

    // 后台删除远端
    if (navigator.onLine) {
      await deleteRemoteTask(taskId);
    }
  }, []);

  // ---- 删除整个重复链条（从该任务日期起）----
  const deleteTaskChain = useCallback(async (taskId: string) => {
    const targetTask = tasksRef.current.find(t => t.id === taskId);
    if (!targetTask || !targetTask.recurrence) return;

    cancelTaskReminder(taskId);

    // 乐观本地删除：删掉同链中 date >= 该任务日期的所有任务
    setTasks(prev => {
      const updated = prev.filter(t => {
        if (t.id === taskId) return false;
        if (t.recurrence === targetTask.recurrence &&
            t.title === targetTask.title &&
            t.date >= targetTask.date) return false;
        return true;
      });
      saveTasks(updated);
      return updated;
    });

    // 后台远端删除
    if (navigator.onLine && !isLocalId(taskId)) {
      await deleteRemoteTaskChain(taskId);
      // 链删除后服务端已变更（剩余事件被"封口"），下次同步时会自动对齐
    }
  }, []);

  // ---- 切换完成状态（乐观本地更新）----
  const toggleTask = useCallback(async (taskId: string) => {
    const currentTask = tasksRef.current.find(t => t.id === taskId);
    if (!currentTask) return;

    const newCompleted = !currentTask.completed;
    const newSubtasks = currentTask.subtasks?.map(st => ({ ...st, completed: newCompleted })) || [];

    // 标记完成时取消通知，取消完成时重新调度
    if (newCompleted) {
      cancelTaskReminder(taskId);
    } else {
      scheduleTaskReminder(currentTask.id, currentTask.title, currentTask.date, currentTask.time);
    }

    // 乐观本地更新
    const nextSyncStatus: SyncMark = currentTask._syncStatus === 'local' ? 'local' : 'pending';
    setTasks(prev => {
      const updated = prev.map(t => {
        if (t.id !== taskId) return t;
        return withSync({ ...t, completed: newCompleted, subtasks: newSubtasks }, nextSyncStatus);
      });
      saveTasks(updated);
      return updated;
    });

    // 后台同步
    if (navigator.onLine && !isLocalId(taskId)) {
      try {
        const cat = categoriesRef.current.find(c => c.id === currentTask.categoryId);
        const result = await pushTask(
          withSync({ ...currentTask, completed: newCompleted, subtasks: newSubtasks }, 'pending'),
          cat?.name || '其他'
        );
        if (result.ok) {
          setTasks(prev => {
            const updated = prev.map(t =>
              t.id === taskId ? withSync(t, 'synced') : t
            );
            saveTasks(updated);
            return updated;
          });
        } else {
          markFailed(taskId);
        }
      } catch {
        markFailed(taskId);
      }
    }
  }, [markFailed]);

  // ---- 切换子任务完成状态（乐观本地更新）----
  const toggleSubtask = useCallback(async (taskId: string, subtaskId: string) => {
    const task = tasksRef.current.find(t => t.id === taskId);
    if (!task || !task.subtasks) return;

    const newSubtasks = task.subtasks.map(st =>
      st.id === subtaskId ? { ...st, completed: !st.completed } : st
    );
    const allCompleted = newSubtasks.every(st => st.completed);

    // 乐观本地更新
    const stSyncStatus: SyncMark = task._syncStatus === 'local' ? 'local' : 'pending';
    setTasks(prev => {
      const updated = prev.map(t => {
        if (t.id !== taskId) return t;
        return withSync({ ...t, subtasks: newSubtasks, completed: allCompleted }, stSyncStatus);
      });
      saveTasks(updated);
      return updated;
    });

    // 后台同步
    if (navigator.onLine && !isLocalId(taskId)) {
      try {
        const cat = categoriesRef.current.find(c => c.id === task.categoryId);
        const result = await pushTask(
          withSync({ ...task, subtasks: newSubtasks, completed: allCompleted }, 'pending'),
          cat?.name || '其他'
        );
        if (result.ok) {
          setTasks(prev => {
            const updated = prev.map(t =>
              t.id === taskId ? withSync(t, 'synced') : t
            );
            saveTasks(updated);
            return updated;
          });
        }
      } catch {
        markFailed(taskId);
      }
    }
  }, [markFailed]);

  // ---- 按日期获取任务 ----
  const getTasksByDate = useCallback(
    (date: string) => tasks.filter(t => t.date === date),
    [tasks]
  );

  // ---- 完成率 ----
  const getCompletionRate = useCallback(() => {
    if (tasks.length === 0) return 0;
    return Math.round((tasks.filter(t => t.completed).length / tasks.length) * 100);
  }, [tasks]);

  // ---- 分类统计 ----
  const getCategoryStats = useMemo((): CategoryStat[] => {
    const usedCategoryIds = new Set(tasks.map(t => t.categoryId));
    return categories
      .filter(cat => usedCategoryIds.has(cat.id))
      .map(cat => {
        const catTasks = tasks.filter(t => t.categoryId === cat.id);
        return {
          category: cat,
          completedCount: catTasks.filter(t => t.completed).length,
          totalCount: catTasks.length,
        };
      });
  }, [tasks, categories]);

  // ---- 分类 CRUD（本地管理 + 后台同步受影响的任务）----
  const addCategory = useCallback((name: string) => {
    setCategories(prev => {
      const usedColors = new Set(prev.map(c => c.color));
      const color = COLORS.find(c => !usedColors.has(c)) || COLORS[0];
      const id = 'cat_' + name.toLowerCase().replace(/[^a-z0-9一-鿿]/g, '_');
      const updated = [...prev, { id, name, color }];
      saveCategories(updated);
      return updated;
    });
  }, []);

  const updateCategory = useCallback((id: string, name: string) => {
    setCategories(prev => {
      const updated = prev.map(c => (c.id === id ? { ...c, name } : c));
      saveCategories(updated);
      return updated;
    });

    // 更新受影响的本地任务 + 后台同步
    const cat = categoriesRef.current.find(c => c.id === id);
    if (cat && cat.name !== name) {
      const affectedTasks = tasksRef.current.filter(t => t.categoryId === id);
      setTasks(prev => {
        const updated = prev.map(t => {
          if (t.categoryId !== id) return t;
          const s: SyncMark = t._syncStatus === 'local' ? 'local' : 'pending';
          return withSync(t, s);
        });
        saveTasks(updated);
        return updated;
      });

      // 后台同步受影响的任务
      if (navigator.onLine) {
        affectedTasks.forEach(async t => {
          if (isLocalId(t.id)) return;
          try {
            const payload: Record<string, any> = {
              title: t.title, date: t.date, time: t.time,
              category: normalizeCategoryName(name),
              description: t.description || '',
              completed: t.completed, reminder: false,
              subtasks: (t.subtasks || []).map(st => ({ title: st.title, completed: st.completed })),
            };
            if (t.recurrence) {
              payload.recurrence = t.recurrence;
              if (t.recurrenceEndDate) payload.recurrence_end_date = t.recurrenceEndDate;
            }
            await authFetch(`${API_BASE}/events/${t.id}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload),
            });
          } catch { /* 后台同步失败，下次自动重试 */ }
        });
      }
    }
  }, []);

  const deleteCategory = useCallback((id: string) => {
    setCategories(prev => {
      const updated = prev.filter(c => c.id !== id);
      saveCategories(updated);
      return updated;
    });

    // 本地任务移到 "其他" + 后台同步
    const otherCat = categoriesRef.current.find(c => c.id === 'other') || { id: 'other', name: '其他', color: '#FFCC00' };
    const affectedTasks = tasksRef.current.filter(t => t.categoryId === id);

    setTasks(prev => {
      const updated = prev.map(t => {
        if (t.categoryId !== id) return t;
        const s: SyncMark = t._syncStatus === 'local' ? 'local' : 'pending';
        return withSync({ ...t, categoryId: 'other', color: hexToColorName(otherCat.color) }, s);
      });
      saveTasks(updated);
      return updated;
    });

    // 后台同步
    if (navigator.onLine) {
      affectedTasks.forEach(async t => {
        if (isLocalId(t.id)) return;
        try {
          const payload: Record<string, any> = {
            title: t.title, date: t.date, time: t.time,
            category: normalizeCategoryName(otherCat.name),
            description: t.description || '',
            completed: t.completed, reminder: false,
            subtasks: (t.subtasks || []).map(st => ({ title: st.title, completed: st.completed })),
          };
          if (t.recurrence) {
            payload.recurrence = t.recurrence;
            if (t.recurrenceEndDate) payload.recurrence_end_date = t.recurrenceEndDate;
          }
          await authFetch(`${API_BASE}/events/${t.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
        } catch { /* 后台同步失败 */ }
      });
    }
  }, []);

  // ---- 分类查找 ----
  const getCategoryColor = useCallback(
    (categoryId: string) => categories.find(c => c.id === categoryId)?.color || '#8E8E93',
    [categories]
  );

  const getCategoryName = useCallback(
    (categoryId: string) => categories.find(c => c.id === categoryId)?.name || '未分类',
    [categories]
  );

  return {
    tasks,
    categories,
    loading,
    loadTasks: syncNow, // 保留兼容，实际触发同步
    addTask,
    updateTask,
    deleteTask,
    deleteTaskChain,
    toggleTask,
    toggleSubtask,
    getTasksByDate,
    getCompletionRate,
    getCategoryStats,
    addCategory,
    updateCategory,
    deleteCategory,
    getCategoryColor,
    getCategoryName,
    // 新增
    syncStatus,
    syncNow,
  };
}
