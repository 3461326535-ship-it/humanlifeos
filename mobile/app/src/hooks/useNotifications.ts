import { useState, useEffect, useRef, useCallback } from 'react';
import { toast } from 'sonner';
import { LocalNotifications as LN } from '@capacitor/local-notifications';
import type { Task } from '@/types';
import {
  generateDailyReport,
  generateWeeklyReport,
  saveReportToChat,
  scheduleReportNotifications,
} from '@/lib/scheduledReports';

/** 检测是否运行在 Capacitor 原生环境（APK） */
function isNative(): boolean {
  try {
    const C = (window as any).Capacitor;
    if (!C) return false;
    // Capacitor 6: isNativePlatform() 方法
    if (typeof C.isNativePlatform === 'function') return C.isNativePlatform();
    // Capacitor 5: isNative 属性（boolean）
    if (typeof C.isNative === 'boolean') return C.isNative;
    // Capacitor 5: isNative() 方法
    if (typeof C.isNative === 'function') return C.isNative();
    // Fallback: 检查 getPlatform()
    if (typeof C.getPlatform === 'function') return C.getPlatform() !== 'web';
    return false;
  } catch {
    return false;
  }
}

/** 获取 LocalNotifications 实例（安全，失败时返回 null） */
function getLocalNotifications() {
  try {
    // 静态 import 已经加载，直接返回；通过 requestPermissions 方法是否存在来判断可用性
    if (!LN || typeof LN.requestPermissions !== 'function') return null;
    return LN;
  } catch {
    return null;
  }
}

/** 带超时的 Promise 包装（默认 8 秒），防止原生调用永久挂起 */
function withTimeout<T>(promise: Promise<T>, ms = 8000, label = 'native call'): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout: ${label}`)), ms)
    ),
  ]);
}

export interface NotificationSettings {
  taskStart: boolean;
  dailySummary: boolean;
  deadlineReminder: boolean;
  weeklyReport: boolean;
}

const STORAGE_KEY = 'notification-settings';
const NOTIFIED_KEY = 'notified-tasks';

const defaultSettings: NotificationSettings = {
  taskStart: true,
  dailySummary: true,
  deadlineReminder: true,
  weeklyReport: true,
};

function loadSettings(): NotificationSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? { ...defaultSettings, ...JSON.parse(raw) } : { ...defaultSettings };
  } catch {
    return { ...defaultSettings };
  }
}

function saveSettings(s: NotificationSettings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
}

function loadNotified(): Record<string, string> {
  try {
    const raw = localStorage.getItem(NOTIFIED_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveNotified(n: Record<string, string>) {
  localStorage.setItem(NOTIFIED_KEY, JSON.stringify(n));
}

function getTodayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

function getWeekKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-W${Math.ceil((d.getDate() + 6 - d.getDay()) / 7)}`;
}

/** Check if the browser truly supports the Notification API, or if running natively */
function isNotificationSupported(): boolean {
  return isNative() || ('Notification' in window && typeof Notification.requestPermission === 'function');
}

// ── 通知 ID 生成器（必须在 Java int 范围内：1 ~ 2,147,483,647）──
let notifIdCounter = 0;
function nextNotifId(): number {
  notifIdCounter++;
  if (notifIdCounter > 2000000000) notifIdCounter = 1;
  return notifIdCounter;
}

// ── Notification sound (Web Audio API, no external file needed) ──

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  try {
    if (!audioCtx || audioCtx.state === 'closed') {
      audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    // Resume if suspended (browsers require user gesture)
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    return audioCtx;
  } catch {
    return null;
  }
}

/**
 * Play a short notification chime.
 * Two-tone ascending ding: C5→E5, gentle sine wave, ~400ms.
 */
function playChime() {
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const t = ctx.currentTime;

    // First tone: C5 (~523 Hz), 120ms
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.value = 523.25;
    gain1.gain.setValueAtTime(0, t);
    gain1.gain.linearRampToValueAtTime(0.25, t + 0.02);
    gain1.gain.linearRampToValueAtTime(0.15, t + 0.10);
    gain1.gain.linearRampToValueAtTime(0, t + 0.18);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(t);
    osc1.stop(t + 0.18);

    // Second tone: E5 (~659 Hz), 150ms, slightly delayed
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.value = 659.25;
    gain2.gain.setValueAtTime(0, t + 0.12);
    gain2.gain.linearRampToValueAtTime(0.25, t + 0.14);
    gain2.gain.linearRampToValueAtTime(0.15, t + 0.24);
    gain2.gain.linearRampToValueAtTime(0, t + 0.35);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(t + 0.12);
    osc2.stop(t + 0.35);
  } catch {
    // Silently ignore — sound is non-critical
  }
}

export function useNotifications(tasks: Task[]) {
  const [settings, setSettings] = useState<NotificationSettings>(loadSettings);
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const notifiedRef = useRef<Record<string, string>>(loadNotified());
  const lastCheckRef = useRef<number>(0);
  const permissionRequestedRef = useRef(false);

  // Check permission on mount
  useEffect(() => {
    if (!isNotificationSupported()) return;

    // 原生环境：查询真实的系统通知权限状态（持久化的，跨会话保持）
    // 不要无条件设为 'default'，否则每次重启都会让用户重新授权
    if (isNative()) {
      const plugin = getLocalNotifications();
      if (!plugin) { setPermission('default'); return; }
      plugin.checkPermissions().then(result => {
        if (result.display === 'granted') {
          setPermission('granted');
        } else if (result.display === 'denied') {
          setPermission('denied');
        } else {
          // 'prompt' | 'prompt-with-rationale' → 用户尚未授权，显示默认状态
          setPermission('default');
        }
      }).catch(() => {
        setPermission('default');
      });
      return;
    }

    // 浏览器环境：使用 Web Notification API 的 permission 状态
    try {
      setPermission(Notification.permission);
    } catch {
      setPermission('default');
    }
  }, []);

  // Request notification permission (MUST be called from a user gesture)
  const requestPermission = useCallback(async (): Promise<boolean> => {
    if (!isNotificationSupported()) {
      toast.warning('此设备不支持通知功能');
      return false;
    }

    // 原生环境走 Capacitor LocalNotifications
    if (isNative()) {
      try {
        const plugin = getLocalNotifications();
        if (!plugin) { toast.error('通知插件未就绪'); return false; }
        const result = await withTimeout(plugin.requestPermissions(), 8000, 'requestPermissions');
        if (result.display === 'granted') {
          setPermission('granted');
          toast.success('通知已开启');
          return true;
        } else {
          setPermission('denied');
          toast.error('通知权限被拒绝，请在系统设置中开启');
          return false;
        }
      } catch (err: any) {
        console.error('Native permission request failed:', err);
        toast.error(err?.message === 'Timeout: requestPermissions'
          ? '通知服务响应超时，请重试'
          : '请求通知权限失败');
        return false;
      }
    }

    if (permissionRequestedRef.current && Notification.permission === 'denied') {
      toast.error('通知权限已被拒绝，请在浏览器设置中手动开启');
      return false;
    }

    try {
      permissionRequestedRef.current = true;
      const result = await Notification.requestPermission();
      setPermission(result);

      if (result === 'granted') {
        toast.success('通知已开启');
        return true;
      } else if (result === 'denied') {
        toast.error('通知权限被拒绝');
        return false;
      } else {
        toast('通知权限未授予，可在设置中重新开启');
        return false;
      }
    } catch (err) {
      console.error('Request permission failed:', err);
      toast.error('请求通知权限失败');
      return false;
    }
  }, []);

  // Update setting
  const updateSetting = useCallback(
    (key: keyof NotificationSettings, value: boolean) => {
      const next = { ...settings, [key]: value };
      setSettings(next);
      saveSettings(next);

      // Auto request permission when enabling
      if (value && permission !== 'granted' && isNotificationSupported()) {
        requestPermission();
      }
    },
    [settings, permission, requestPermission]
  );

  // Send notification — returns true if notification was sent
  const sendBrowserNotification = useCallback(async (title: string, body: string): Promise<boolean> => {
    // 原生环境：使用 Capacitor LocalNotifications（即时触发）
    if (isNative()) {
      try {
        const plugin = getLocalNotifications();
        if (!plugin) return false;
        await withTimeout(plugin.schedule({
          notifications: [{
            id: nextNotifId(),
            title,
            body,
            schedule: { at: new Date(Date.now() + 500) },
            sound: 'default',
          }],
        }), 5000, 'schedule');
        return true;
      } catch (err) {
        console.warn('Native notification failed:', err);
        return false;
      }
    }

    // 浏览器环境：Web Notification API
    if (!isNotificationSupported() || Notification.permission !== 'granted') return false;

    try {
      new Notification(title, {
        body,
        icon: '/favicon.ico',
        tag: title,
        requireInteraction: false,
      });
      return true;
    } catch (err) {
      console.warn('Browser notification failed:', err);
      return false;
    }
  }, []);

  // Unified notify: tries native/browser notification, falls back to toast. Plays sound.
  const notify = useCallback(async (title: string, body: string) => {
    const sent = await sendBrowserNotification(title, body);
    if (!sent) {
      // Fallback: show toast so user still sees the reminder
      toast(body, { description: title });
    }
    playChime();
  }, [sendBrowserNotification]);

  // Mark as notified
  const markNotified = useCallback((key: string) => {
    notifiedRef.current[key] = getTodayKey();
    saveNotified(notifiedRef.current);
  }, []);

  const isNotifiedToday = useCallback((key: string): boolean => {
    return notifiedRef.current[key] === getTodayKey();
  }, []);

  // Main check loop — runs only when permission is granted OR as fallback when settings are on
  useEffect(() => {
    const check = () => {
      const now = Date.now();
      // Throttle to once per 30 seconds (reduced from 60s for better responsiveness)
      if (now - lastCheckRef.current < 30_000) return;
      lastCheckRef.current = now;

      const nowDate = new Date();
      const todayStr = `${nowDate.getFullYear()}-${String(nowDate.getMonth() + 1).padStart(2, '0')}-${String(nowDate.getDate()).padStart(2, '0')}`;
      const currentHour = nowDate.getHours();
      const currentMin = nowDate.getMinutes();

      const todayTasks = tasks.filter((t) => t.date === todayStr && !t.completed);

      // 1. Task start reminder (within 15 min)
      if (settings.taskStart) {
        todayTasks.forEach((task) => {
          const [h, m] = task.time.split(':').map(Number);
          if (isNaN(h) || isNaN(m)) return;
          const taskMinutes = h * 60 + m;
          const currentMinutes = currentHour * 60 + currentMin;
          const diff = taskMinutes - currentMinutes;

          if (diff >= 0 && diff <= 15) {
            const key = `start-${task.id}-${todayStr}`;
            if (!isNotifiedToday(key)) {
              notify('⏰ 任务即将开始', `「${task.title}」将在 ${task.time} 开始`);
              markNotified(key);
            }
          }
        });
      }

      // 2. AI 日报 (每天下午 18:00-18:05)
      if (settings.dailySummary && currentHour === 18 && currentMin >= 0 && currentMin <= 5) {
        const key = `daily-${todayStr}`;
        if (!isNotifiedToday(key)) {
          markNotified(key); // 先标记，避免重复触发
          generateDailyReport()
            .then((report) => {
              saveReportToChat(report);
              notify('📋 今日日报', report.slice(0, 120) + (report.length > 120 ? '…' : ''));
              // 重新调度下一次通知
              scheduleReportNotifications();
            })
            .catch(() => {
              notify('📋 今日日报', '生成日报失败，请稍后查看');
            });
        }
      }

      // 3. Deadline reminder (overdue tasks, at 10:00 and 18:00)
      if (settings.deadlineReminder && ((currentHour === 10 && currentMin <= 5) || (currentHour === 18 && currentMin <= 5))) {
        const overdueTasks = tasks.filter((t) => {
          if (t.completed) return false;
          return t.date < todayStr;
        });

        if (overdueTasks.length > 0) {
          const key = `deadline-${todayStr}-${currentHour}`;
          if (!isNotifiedToday(key)) {
            const titles = overdueTasks.slice(0, 3).map((t) => t.title).join('、');
            notify('⚠️ 任务已过期', `「${titles}」等 ${overdueTasks.length} 项任务已过期`);
            markNotified(key);
          }
        }
      }

      // 4. AI 周报 (每周六下午 14:00-14:05)
      if (settings.weeklyReport && nowDate.getDay() === 6 && currentHour === 14 && currentMin >= 0 && currentMin <= 5) {
        const key = `weekly-${getWeekKey()}`;
        if (!isNotifiedToday(key)) {
          markNotified(key); // 先标记，避免重复触发
          generateWeeklyReport()
            .then((report) => {
              saveReportToChat(report);
              notify('📊 本周周报', report.slice(0, 120) + (report.length > 120 ? '…' : ''));
              // 重新调度下一次通知
              scheduleReportNotifications();
            })
            .catch(() => {
              notify('📊 本周周报', '生成周报失败，请稍后查看');
            });
        }
      }
    };

    // Always run the check loop — even without browser permission,
    // the fallback toast will surface reminders to the user
    check();

    const interval = setInterval(check, 30_000); // every 30 seconds
    return () => clearInterval(interval);
  }, [permission, settings, tasks, notify, markNotified, isNotifiedToday]);

  // Test notification — always gives visual feedback
  const testNotify = useCallback(async () => {
    const supported = isNotificationSupported();

    if (!supported) {
      toast.warning('此设备不支持系统通知，提醒将以应用内弹窗方式展示');
      setTimeout(() => {
        notify('🔔 提醒测试', '应用内通知工作正常！');
      }, 800);
      return;
    }

    if (permission === 'denied') {
      toast.error('通知权限已被拒绝，请在系统设置中手动开启后重试', {
        duration: 5000,
      });
      return;
    }

    if (permission !== 'granted') {
      // 原生环境
      if (isNative()) {
        try {
          const plugin = getLocalNotifications();
          if (!plugin) { toast.error('通知插件未就绪'); return; }
          const result = await withTimeout(plugin.requestPermissions(), 8000, 'requestPermissions');
          setPermission(result.display === 'granted' ? 'granted' : 'denied');
          if (result.display === 'granted') {
            playChime();
            const sent = await sendBrowserNotification('✅ 提醒已开启', '你将收到任务相关的通知');
            if (sent) {
              toast.success('通知测试成功！请查看系统通知栏');
            } else {
              toast.success('通知权限已开启');
              notify('✅ 提醒已开启', '你将收到任务相关的通知');
            }
          } else {
            toast.error('通知权限被拒绝，无法发送通知');
          }
        } catch (err: any) {
          toast.error(err?.message === 'Timeout: requestPermissions'
            ? '通知服务响应超时，请重试'
            : '请求通知权限失败');
        }
        return;
      }

      // 浏览器环境
      Notification.requestPermission().then(async (result) => {
        setPermission(result);
        if (result === 'granted') {
          playChime();
          const sent = await sendBrowserNotification('✅ 提醒已开启', '你将收到任务相关的通知');
          if (sent) {
            toast.success('通知测试成功！请查看系统通知栏');
          } else {
            toast.success('通知权限已开启，提醒将以弹窗方式展示');
            notify('✅ 提醒已开启', '你将收到任务相关的通知');
          }
        } else if (result === 'denied') {
          toast.error('通知权限被拒绝，无法发送通知');
        } else {
          toast('通知权限未授予，可在浏览器设置中重新开启');
        }
      }).catch(() => {
        toast.error('请求通知权限失败');
      });
      return;
    }

    // Permission already granted — send test
    playChime();
    const sent = await sendBrowserNotification('🔔 提醒测试', '通知工作正常！');
    if (sent) {
      toast.success('测试通知已发送，请查看系统通知栏');
    } else {
      toast('提醒测试（应用内）', {
        description: '通知暂时不可用，提醒将以应用内弹窗展示',
      });
      notify('🔔 提醒测试', '应用内通知工作正常！');
    }
  }, [permission, sendBrowserNotification, notify]);

  return {
    settings,
    permission,
    updateSetting,
    requestPermission,
    testNotify,
  };
}
