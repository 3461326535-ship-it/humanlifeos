import { LocalNotifications } from '@capacitor/local-notifications';
import { authFetch } from './taskMapping';
import { loadTasks } from './storage';
import { API_BASE } from '@/config';
import type { Task } from '@/types';

// ── 通知 ID（日报 / 周报专用）──
const DAILY_REPORT_NOTIF_ID = 2000000001;
const WEEKLY_REPORT_NOTIF_ID = 2000000002;

// 聊天记录 key（与 AIChatPage 共用）
const CHAT_STORAGE_KEY = 'ai-chat-messages';

// ── 格式化日期 ──

function formatDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getWeekRange(): { start: string; end: string; startDate: Date; endDate: Date } {
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0=Sun
  const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const monday = new Date(now);
  monday.setDate(now.getDate() - daysFromMonday);
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  return {
    start: formatDate(monday),
    end: formatDate(sunday),
    startDate: monday,
    endDate: sunday,
  };
}

// ── 保存 AI 报告到聊天记录 ──

export function saveReportToChat(report: string): void {
  try {
    const raw = localStorage.getItem(CHAT_STORAGE_KEY);
    const messages: any[] = raw ? JSON.parse(raw) : [];
    messages.push({
      id: `report-${Date.now()}`,
      content: report,
      isUser: false,
      timestamp: Date.now(),
    });
    localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(messages));
    // 通知 AIChatPage 刷新消息
    window.dispatchEvent(new CustomEvent('chat-updated'));
  } catch {
    // localStorage full — silently skip
  }
}

// ── AI 日报生成 ──

export async function generateDailyReport(): Promise<string> {
  const tasks = loadTasks();
  const today = new Date();
  const todayStr = formatDate(today);

  const todayTasks = tasks.filter(t => t.date === todayStr);
  const completed = todayTasks.filter(t => t.completed);
  const uncompleted = todayTasks.filter(t => !t.completed);

  // 构建给 AI 的 prompt
  const taskList = uncompleted
    .sort((a, b) => a.time.localeCompare(b.time))
    .map(t => `- [${t.time}] ${t.title}${t.description ? `（${t.description}）` : ''}`)
    .join('\n');

  const completedList = completed
    .map(t => `- ${t.title}`)
    .join('\n');

  const message = `请作为我的日程助手，帮我生成今日日报（${todayStr}）：

📊 今日数据：
- 任务总数：${todayTasks.length}
- 已完成：${completed.length}
- 未完成：${uncompleted.length}

${uncompleted.length > 0 ? `⚠️ 未完成任务：\n${taskList}` : '✅ 全部完成！'}
${completed.length > 0 ? `\n✅ 已完成任务：\n${completedList}` : ''}

请简洁地告诉我：
1. 哪些任务需要赶紧完成（特别是上午的任务如果还没做）
2. 今晚之前应该优先完成什么
3. 给我一句鼓励的话

回复风格：像朋友聊天一样，不要超过 200 字。`;

  try {
    const res = await authFetch(`${API_BASE}/ai/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, history: [] }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const report = data.reply || generateLocalDailyReport(todayStr, todayTasks, completed, uncompleted);
    return report;
  } catch {
    return generateLocalDailyReport(todayStr, todayTasks, completed, uncompleted);
  }
}

/** 离线/失败时的本地日报 */
function generateLocalDailyReport(
  todayStr: string,
  all: Task[],
  completed: Task[],
  uncompleted: Task[],
): string {
  if (all.length === 0) {
    return `📋 今日日报 (${todayStr})\n\n今天没有安排任务，好好享受这一天吧～ ☀️`;
  }
  if (uncompleted.length === 0) {
    return `📋 今日日报 (${todayStr})\n\n🎉 太厉害了！今天的 ${completed.length} 项任务全部完成！好好休息吧～`;
  }

  const urgent = uncompleted.filter(t => {
    const h = parseInt(t.time.split(':')[0], 10);
    return !isNaN(h) && h <= 14;
  });

  let report = `📋 今日日报 (${todayStr})\n\n`;
  report += `完成进度：${completed.length}/${all.length}\n\n`;
  report += `⚠️ 还有 ${uncompleted.length} 项未完成：\n`;
  report += uncompleted.map(t => `  • ${t.time} ${t.title}`).join('\n');

  if (urgent.length > 0) {
    report += `\n\n🔴 建议优先完成：\n${urgent.map(t => `  • ${t.title}`).join('\n')}`;
  }
  report += '\n\n加油，你可以的！💪';
  return report;
}

// ── AI 周报生成 ──

export async function generateWeeklyReport(): Promise<string> {
  const tasks = loadTasks();
  const { start, end } = getWeekRange();

  const weekTasks = tasks.filter(t => t.date >= start && t.date <= end);
  const completed = weekTasks.filter(t => t.completed);
  const uncompleted = weekTasks.filter(t => !t.completed);
  const pct = weekTasks.length > 0 ? Math.round((completed.length / weekTasks.length) * 100) : 0;

  // 按日期分组统计
  const dailyStats: Record<string, { total: number; completed: number }> = {};
  weekTasks.forEach(t => {
    if (!dailyStats[t.date]) dailyStats[t.date] = { total: 0, completed: 0 };
    dailyStats[t.date].total++;
    if (t.completed) dailyStats[t.date].completed++;
  });

  // 按分类统计
  const catStats: Record<string, { total: number; completed: number }> = {};
  weekTasks.forEach(t => {
    const key = t.categoryId;
    if (!catStats[key]) catStats[key] = { total: 0, completed: 0 };
    catStats[key].total++;
    if (t.completed) catStats[key].completed++;
  });

  const dailyBreakdown = Object.entries(dailyStats)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, s]) => {
      const dayNames = ['日', '一', '二', '三', '四', '五', '六'];
      const d = new Date(date);
      const dayName = dayNames[d.getDay()];
      return `  周${dayName} (${date})：${s.completed}/${s.total}`;
    })
    .join('\n');

  const uncompletedList = uncompleted
    .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time))
    .map(t => `  - [${t.date}] ${t.title}`)
    .join('\n');

  const message = `请作为我的日程助手，帮我生成本周周报：

📅 本周范围：${start} ~ ${end}

📊 本周数据：
- 任务总数：${weekTasks.length}
- 已完成：${completed.length}
- 未完成：${uncompleted.length}
- 完成率：${pct}%

📈 每日统计：
${dailyBreakdown}

${uncompleted.length > 0 ? `⚠️ 未完成任务：\n${uncompletedList}` : '🎉 本周所有任务都完成了！'}

请简洁地告诉我：
1. 本周效率情况评价
2. 哪些未完成的任务需要重点关注
3. 下周的一个小建议
4. 给我一句鼓励的话

回复风格：像朋友聊天一样，不要超过 250 字。`;

  try {
    const res = await authFetch(`${API_BASE}/ai/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, history: [] }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const report = data.reply || generateLocalWeeklyReport(start, end, weekTasks.length, completed.length, uncompleted, pct);
    return report;
  } catch {
    return generateLocalWeeklyReport(start, end, weekTasks.length, completed.length, uncompleted, pct);
  }
}

/** 离线/失败时的本地周报 */
function generateLocalWeeklyReport(
  start: string,
  end: string,
  total: number,
  compCount: number,
  uncompleted: Task[],
  pct: number,
): string {
  let report = `📊 本周周报 (${start} ~ ${end})\n\n`;
  report += `完成率：${pct}% (${compCount}/${total})\n`;

  if (pct >= 80) {
    report += '评价：本周效率很棒！👏\n';
  } else if (pct >= 50) {
    report += '评价：还有提升空间，继续加油！💪\n';
  } else {
    report += '评价：下周需要更加专注哦～🎯\n';
  }

  if (uncompleted.length > 0) {
    report += `\n⚠️ 未完成任务 (${uncompleted.length})：\n`;
    report += uncompleted.slice(0, 10).map(t => `  • ${t.title}`).join('\n');
    if (uncompleted.length > 10) {
      report += `\n  ...还有 ${uncompleted.length - 10} 项`;
    }
  }
  return report;
}

// ── Capacitor 本地通知调度（作为后台保底）──

/**
 * 调度日报/周报的系统通知。
 * 只调度下一次触发时间（不重复），每次触发后由 check loop 重新调度。
 */
export async function scheduleReportNotifications(): Promise<void> {
  try {
    // 先取消旧的
    await cancelReportNotifications();

    const notifications: any[] = [];

    // 日报：每天下午 6:00，仅调度下一次
    const nextDaily = getNextTime(18, 0);
    notifications.push({
      id: DAILY_REPORT_NOTIF_ID,
      title: '📋 日报时间到',
      body: '点击查看今日任务日报',
      schedule: { at: nextDaily },
      sound: 'default',
      extra: { type: 'daily-report' },
    });

    // 周报：周六下午 2:00，仅调度下一次
    const nextWeekly = getNextSaturday(14, 0);
    notifications.push({
      id: WEEKLY_REPORT_NOTIF_ID,
      title: '📊 周报时间到',
      body: '点击查看本周效率周报',
      schedule: { at: nextWeekly },
      sound: 'default',
      extra: { type: 'weekly-report' },
    });

    await LocalNotifications.schedule({ notifications });
    console.log('[ScheduledReports] 通知已调度:', {
      daily: nextDaily.toLocaleString(),
      weekly: nextWeekly.toLocaleString(),
    });
  } catch (err) {
    console.warn('[ScheduledReports] 通知调度失败:', err);
  }
}

/** 取消所有日报/周报通知 */
export async function cancelReportNotifications(): Promise<void> {
  try {
    await LocalNotifications.cancel({
      notifications: [
        { id: DAILY_REPORT_NOTIF_ID },
        { id: WEEKLY_REPORT_NOTIF_ID },
      ],
    });
  } catch {
    // 忽略
  }
}

/** 获取下一个指定时间（时:分）的 Date 对象 */
function getNextTime(hour: number, minute: number): Date {
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  if (d.getTime() <= Date.now()) {
    d.setDate(d.getDate() + 1);
  }
  return d;
}

/** 获取下一个周六指定时间的 Date 对象 */
function getNextSaturday(hour: number, minute: number): Date {
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  const daysUntilSaturday = (6 - d.getDay() + 7) % 7;
  if (daysUntilSaturday === 0 && d.getTime() <= Date.now()) {
    // 今天已是周六且时间已过 → 下周六
    d.setDate(d.getDate() + 7);
  } else if (daysUntilSaturday > 0) {
    d.setDate(d.getDate() + daysUntilSaturday);
  }
  return d;
}
