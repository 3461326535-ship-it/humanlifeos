import { LocalNotifications } from '@capacitor/local-notifications';

/** 任务开始前多久提醒（分钟） */
const REMINDER_MINUTES_BEFORE = 15;

/** 为 taskId 生成稳定的 int 范围通知 ID */
function makeNotifId(taskId: string): number {
  let hash = 0;
  for (let i = 0; i < taskId.length; i++) {
    hash = ((hash << 5) - hash) + taskId.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash) % 2000000000 + 1;
}

/**
 * 为任务预调度系统通知（任务开始前 15 分钟触发）
 * 如果提醒时间已过，则不调度。
 */
export async function scheduleTaskReminder(taskId: string, title: string, date: string, time: string) {
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  if (!year || isNaN(hour)) return;

  const taskAt = new Date(year, month - 1, day, hour, minute);
  const notifyAt = new Date(taskAt.getTime() - REMINDER_MINUTES_BEFORE * 60 * 1000);

  // 如果提醒时间已过，不调度
  if (notifyAt.getTime() <= Date.now()) return;

  try {
    await LocalNotifications.schedule({
      notifications: [{
        id: makeNotifId(taskId),
        title: '⏰ 日程提醒',
        body: `「${title}」将在 ${time} 开始`,
        schedule: { at: notifyAt },
        sound: 'default',
        extra: { taskId },
      }],
    });
  } catch (err) {
    console.warn('[NotifySchedule] schedule failed:', err);
  }
}

/**
 * 取消某个任务的所有预调度通知
 */
export async function cancelTaskReminder(taskId: string) {
  try {
    const pending = await LocalNotifications.getPending();
    const idToCancel = makeNotifId(taskId);
    const match = pending.notifications.find(n => n.id === idToCancel);
    if (match) {
      await LocalNotifications.cancel({ notifications: [{ id: idToCancel }] });
    }
  } catch (err) {
    console.warn('[NotifySchedule] cancel failed:', err);
  }
}
