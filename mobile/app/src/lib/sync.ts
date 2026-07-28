import type { Task, Category } from '@/types';
import { authFetch, eventToTask, taskToPayload, syncCategories } from '@/lib/taskMapping';
import { getDeletedIds, removeDeletedId, isLocalId } from '@/lib/storage';
import { API_BASE } from '@/config';

// ===== 拉取服务端数据 =====

export async function pullAllTasks(): Promise<any[]> {
  const res = await authFetch(`${API_BASE}/events`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ===== 推送单个任务 =====

export async function pushTask(task: Task, categoryName: string): Promise<{ ok: boolean; serverId?: string }> {
  const payload = taskToPayload(task, categoryName);
  let isNew = isLocalId(task.id);

  let url = isNew
    ? `${API_BASE}/events`
    : `${API_BASE}/events/${task.id}`;
  let method = isNew ? 'POST' : 'PUT';

  let res = await authFetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  // 如果 PUT 返回 404，说明服务端已不存在该事件（可能被其他设备删除）
  // 此时不应死循环重试，而是降级为 POST 创建新记录
  if (!res.ok && !isNew && res.status === 404) {
    isNew = true;
    method = 'POST';
    url = `${API_BASE}/events`;
    res = await authFetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  }

  if (!res.ok) return { ok: false };

  const serverTask = await res.json();
  return { ok: true, serverId: String(serverTask.id) };
}

// ===== 删除远端任务 =====

export async function deleteRemoteTask(id: string): Promise<boolean> {
  if (isLocalId(id)) return true; // 本地任务，无需删远端
  try {
    const res = await authFetch(`${API_BASE}/events/${id}`, { method: 'DELETE' });
    return res.ok;
  } catch {
    return false;
  }
}

// 删除整个重复链条（从该任务日期起）
export async function deleteRemoteTaskChain(id: string): Promise<{ deleted: number; fromDate: string } | null> {
  if (isLocalId(id)) return null;
  try {
    const res = await authFetch(`${API_BASE}/events/${id}?chain=true`, { method: 'DELETE' });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// ===== 迁移访客数据 =====

export async function migrateGuestData(): Promise<void> {
  try {
    await authFetch(`${API_BASE}/auth/migrate`, { method: 'POST' });
  } catch {
    // migration is best-effort
  }
}

// ===== 完整同步 =====

export interface SyncResult {
  tasks: Task[];
  categories: Category[];
  syncedCount: number;
  failedCount: number;
}

export async function fullSync(localTasks: Task[], localCategories: Category[]): Promise<SyncResult> {
  let syncedCount = 0;
  let failedCount = 0;

  // 1. Pull server data
  let serverEvents: any[];
  try {
    serverEvents = await pullAllTasks();
  } catch {
    // Offline or server error — return unchanged
    return { tasks: localTasks, categories: localCategories, syncedCount: 0, failedCount: 0 };
  }

  // 2. Sync categories from server events
  const mergedCategories = syncCategories(serverEvents, localCategories);

  // 3. Merge: server tasks → local
  const serverTasks = serverEvents.map((e: any) => eventToTask(e, mergedCategories));
  const localMap = new Map(localTasks.map(t => [t.id, t]));
  const serverIdSet = new Set(serverTasks.map(t => t.id));

  for (const sTask of serverTasks) {
    const local = localMap.get(sTask.id);
    if (!local) {
      // New from server
      localMap.set(sTask.id, sTask);
    } else if (local._syncStatus === 'synced' || local._syncStatus === undefined) {
      // Server wins for already-synced tasks
      localMap.set(sTask.id, sTask);
    }
    // If local has pending/failed/local status, keep local version
  }

  // 3.5 清理僵尸引用：本地有服务端 ID 但服务端已不存在的任务（被其他设备删除）
  // 将其转换为 local 任务，避免死循环 PUT 404
  let zombieCleaned = 0;
  for (const [id, _task] of localMap) {
    if (!isLocalId(id) && !serverIdSet.has(id)) {
      // 服务端无此任务，将其移除（服务端已删除，本地不应保留幽灵引用）
      localMap.delete(id);
      zombieCleaned++;
    }
  }

  // 4. Push local pending/new tasks to server
  const pendingTasks = Array.from(localMap.values()).filter(
    t => t._syncStatus === 'pending' || t._syncStatus === 'failed' || t._syncStatus === 'local'
  );

  for (const task of pendingTasks) {
    try {
      const cat = mergedCategories.find(c => c.id === task.categoryId) || mergedCategories[0];
      const result = await pushTask(task, cat?.name || '其他');
      if (result.ok) {
        // Replace temp ID with server ID
        if (result.serverId && result.serverId !== task.id) {
          localMap.delete(task.id);
          task.id = result.serverId;
          // Also update deletedIds if this temp ID was marked for deletion
          const deletedIds = getDeletedIds();
          if (deletedIds.includes(task.id)) {
            removeDeletedId(task.id);
          }
        }
        task._syncStatus = 'synced';
        task._updatedAt = Date.now();
        localMap.set(task.id, task);
        syncedCount++;
      } else {
        task._syncStatus = 'failed';
        failedCount++;
      }
    } catch {
      task._syncStatus = 'failed';
      failedCount++;
    }
  }

  // 5. Process deletions
  const deletedIds = getDeletedIds();
  if (deletedIds.length > 0) {
    for (const id of deletedIds) {
      const ok = await deleteRemoteTask(id);
      if (ok) {
        removeDeletedId(id);
      }
    }
  }

  // 6. Mark remaining unmarked tasks as synced
  const finalTasks = Array.from(localMap.values()).map(t => {
    // Tasks that exist on server but had no sync metadata
    if (!t._syncStatus && serverIdSet.has(t.id)) {
      t._syncStatus = 'synced';
    }
    return t;
  });

  return { tasks: finalTasks, categories: mergedCategories, syncedCount, failedCount };
}
