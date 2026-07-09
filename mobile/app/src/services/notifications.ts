import { LocalNotifications } from '@capacitor/local-notifications';
import type { ScheduleOptions } from '@capacitor/local-notifications';

/**
 * 请求通知权限（Android 13+ 必须）
 */
export async function requestNotificationPermission(): Promise<boolean> {
  try {
    const result = await LocalNotifications.requestPermissions();
    return result.display === 'granted';
  } catch {
    return false;
  }
}

/**
 * 为任务调度提醒通知
 */
export async function scheduleTaskReminder(
  taskId: string,
  title: string,
  date: string,     // YYYY-MM-DD
  time: string,     // HH:MM
  minutesBefore: number = 30
): Promise<void> {
  // 解析日期时间
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  const scheduledAt = new Date(year, month - 1, day, hour, minute);

  // 提前 minutesBefore 分钟提醒
  const notifyAt = new Date(scheduledAt.getTime() - minutesBefore * 60 * 1000);

  // 如果提醒时间已过，不调度
  if (notifyAt.getTime() <= Date.now()) return;

  const options: ScheduleOptions = {
    notifications: [
      {
        id: hashTaskId(taskId),
        title: '⏰ 日程提醒',
        body: `${title} — ${time}`,
        schedule: { at: notifyAt },
        sound: 'default',
        smallIcon: 'ic_stat_icon',
        extra: { taskId, date, time },
      },
    ],
  };

  try {
    await LocalNotifications.schedule(options);
    console.log(`[Notify] 已调度: ${title} @ ${notifyAt.toLocaleString()}`);
  } catch (err) {
    console.error('[Notify] 调度失败:', err);
  }
}

/**
 * 取消某个任务的提醒
 */
export async function cancelTaskReminder(taskId: string): Promise<void> {
  try {
    const pending = await LocalNotifications.getPending();
    const ids = pending.notifications
      .filter(n => n.extra?.taskId === taskId)
      .map(n => n.id);
    if (ids.length > 0) {
      await LocalNotifications.cancel({ notifications: ids.map(id => ({ id })) });
    }
  } catch (err) {
    console.error('[Notify] 取消失败:', err);
  }
}

/**
 * 取消所有提醒
 */
export async function cancelAllReminders(): Promise<void> {
  try {
    await LocalNotifications.cancel({ notifications: [] });
  } catch (err) {
    console.error('[Notify] 取消全部失败:', err);
  }
}

/**
 * 监听通知点击事件
 */
export function onNotificationTap(callback: (taskId: string) => void): void {
  LocalNotifications.addListener('localNotificationActionPerformed', (action) => {
    const taskId = action.notification?.extra?.taskId;
    if (taskId) callback(taskId);
  });
}

/** 稳定的 taskId → 数字 ID 映射 */
function hashTaskId(taskId: string): number {
  let hash = 0;
  for (let i = 0; i < taskId.length; i++) {
    const char = taskId.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return Math.abs(hash) % 2147483647;
}
