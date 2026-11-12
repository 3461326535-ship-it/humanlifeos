import type {
  AuthUser,
  EventInput,
  TodoEvent,
  StatsOverview,
  DailyReport,
  HabitOccurrence,
  Habit,
  HabitInput,
  HabitStatus,
  AiMessage,
  AiChatResponse,
  AiConfirmResponse,
  GanttBoard,
  GanttMoveResult,
  DepType,
} from './types';

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

  // ── 习惯规则（零物化：不往 events 写行）──
  getHabits(from?: string, to?: string) {
    const qs = from && to ? `?from=${from}&to=${to}` : '';
    return request<Habit[]>(`/habits${qs}`);
  },
  createHabit(data: HabitInput) {
    return request<Habit>('/habits', { method: 'POST', body: JSON.stringify(data) });
  },
  /** 改规则（rrule / dtstart / start_time）= 后端封旧规则、从今天起新建；其余字段就地改 */
  updateHabit(id: number, patch: Partial<HabitInput>) {
    return request<Habit>(`/habits/${id}`, { method: 'PUT', body: JSON.stringify(patch) });
  },
  deleteHabit(id: number) {
    return request<{ success: boolean; changes: number }>(`/habits/${id}`, { method: 'DELETE' });
  },
  /** 打卡 / 请假 / 断签：UPSERT (habit_id, date) */
  setHabitOverride(id: number, date: string, status: HabitStatus, reason?: string) {
    return request<unknown>(`/habits/${id}/overrides/${date}`, {
      method: 'PUT',
      body: JSON.stringify({ status, reason: reason || null }),
    });
  },
  /** 撤销某天 → 回到自动推断（过去=断签，未来=待办） */
  clearHabitOverride(id: number, date: string) {
    return request<{ success: boolean }>(`/habits/${id}/overrides/${date}`, { method: 'DELETE' });
  },

  // ── AI 助手（DeepSeek）──
  // 后端 /api/ai 已存在，这里只是把旧页面（todo.html + js/script.js）的调用搬过来
  aiChat(message: string, history: AiMessage[]) {
    return request<AiChatResponse>('/ai/chat', {
      method: 'POST',
      body: JSON.stringify({ message, history }),
    });
  },
  aiConfirm(confirmId: string) {
    return request<AiConfirmResponse>('/ai/confirm', {
      method: 'POST',
      body: JSON.stringify({ confirmId }),
    });
  },
  /** 主动取消待确认动作，释放服务端 pending（防 30 分钟 TTL 内重放） */
  aiCancel(confirmId: string) {
    return request<AiConfirmResponse>('/ai/cancel', {
      method: 'POST',
      body: JSON.stringify({ confirmId }),
    });
  },
  /** 最近 7 天、最多 500 条，按用户隔离 */
  getAiHistory() {
    return request<{ history: AiMessage[] }>('/ai/history');
  },
  saveAiHistory(messages: AiMessage[]) {
    return request<{ success: boolean; inserted?: number }>('/ai/history', {
      method: 'POST',
      body: JSON.stringify({ messages }),
    });
  },
  clearAiHistory() {
    return request<{ success: boolean; deleted: number }>('/ai/history', { method: 'DELETE' });
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

  // ── 甘特图：任务条 / 依赖 / 级联排程 ──
  getGantt(params?: { projectId?: number | null; includeRecurring?: boolean }) {
    const qs = new URLSearchParams();
    if (params?.projectId) qs.set('project_id', String(params.projectId));
    if (params?.includeRecurring) qs.set('include_recurring', '1');
    const s = qs.toString();
    return request<GanttBoard>(`/gantt${s ? `?${s}` : ''}`);
  },
  /** 移动或拉伸任务条；cascade=true 时依赖它的后续任务自动顺延；milestone 可顺带转成/取消里程碑 */
  moveGanttTask(id: number, data: { start: string; end?: string; cascade?: boolean; milestone?: boolean }) {
    return request<GanttMoveResult>(`/gantt/tasks/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },
  /** 按依赖把有依赖关系的任务紧凑重排（可提前） */
  autoSchedule() {
    return request<GanttMoveResult>('/gantt/auto-schedule', { method: 'POST' });
  },
  addGanttDependency(data: { event_id: number; depends_on: number; type?: DepType; lag_days?: number }) {
    return request<GanttMoveResult & { updated: boolean }>('/gantt/dependencies', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },
  updateGanttDependency(eventId: number, dependsOn: number, data: { type?: DepType; lag_days?: number }) {
    return request<GanttMoveResult>(`/gantt/dependencies/${eventId}/${dependsOn}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },
  deleteGanttDependency(eventId: number, dependsOn: number) {
    return request<{ success: boolean; deleted: number }>(`/gantt/dependencies/${eventId}/${dependsOn}`, {
      method: 'DELETE',
    });
  },
};
