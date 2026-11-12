import type { AuthUser, EventInput, TodoEvent, StatsOverview, DailyReport, HabitOccurrence } from './types';

// 同源部署（/app），Cookie 自动携带；token 不落 localStorage（XSS 防护决策见方案 §6.1）
async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  if (!res.ok) {
    let message = `请求失败 (${res.status})`;
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
      if (body?.message) message = body.message;
    } catch { /* 非 JSON 响应 */ }
    throw new Error(message);
  }
  return res.json() as Promise<T>;
}

export const api = {
  // ── 认证 ──
  login(username: string, password: string) {
    return request<{ success: boolean; user: AuthUser }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
  },
  logout() {
    return request<{ success: boolean }>('/auth/logout', { method: 'POST' });
  },
  authStatus() {
    return request<{ success: boolean; user: AuthUser }>('/auth/status');
  },

  // ── 事件 ──
  getEvents() {
    return request<TodoEvent[]>('/events');
  },
  createEvent(data: EventInput) {
    return request<TodoEvent>('/events', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },
  updateEvent(id: number, data: Partial<EventInput>) {
    return request<TodoEvent>(`/events/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },
  updateStatus(id: number, status: string, position?: number) {
    return request<TodoEvent>(`/events/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status, ...(position !== undefined ? { position } : {}) }),
    });
  },
  reorder(items: { id: number; position: number }[]) {
    return request<{ success: boolean; updated: number }>('/events/reorder', {
      method: 'POST',
      body: JSON.stringify({ items }),
    });
  },

  // ── 计时 ──
  timerStart(id: number) {
    return request<{ id: number; event_id: number; started_at: string; ended_at: null }>(
      `/events/${id}/timer/start`,
      { method: 'POST' }
    );
  },
  timerStop(id: number) {
    return request<{ id: number; event_id: number; started_at: string; ended_at: string; duration_min: number }>(
      `/events/${id}/timer/stop`,
      { method: 'POST' }
    );
  },
  getTimeEntries(id: number) {
    return request<
      { id: number; event_id: number; started_at: string; ended_at: string | null; duration_min: number | null }[]
    >(`/events/${id}/time-entries`);
  },
  getActiveTimer() {
    return request<{
      running: boolean;
      id?: number;
      event_id?: number;
      event_title?: string;
      event_status?: string;
      started_at?: string;
      elapsed?: number;
    }>('/timers/active');
  },

  // ── 习惯打卡（零物化：只读 occurrences，不写 events）──
  getHabitOccurrences(from: string, to: string) {
    return request<{ from: string; to: string; items: HabitOccurrence[] }>(
      `/habits/occurrences?from=${from}&to=${to}`
    );
  },

  // ── 统计 / 战报 ──
  statsOverview(range = 7) {
    return request<StatsOverview>(`/stats/overview?range=${range}`);
  },
  dailyReport(date?: string) {
    return request<DailyReport>(`/reports/daily${date ? `?date=${date}` : ''}`);
  },
  toggleEvent(id: number) {
    return request<TodoEvent>(`/events/${id}/toggle`, { method: 'PATCH' });
  },
  deleteEvent(id: number, chain = false) {
    return request<{ success: boolean }>(`/events/${id}${chain ? '?chain=true' : ''}`, {
      method: 'DELETE',
    });
  },
};
