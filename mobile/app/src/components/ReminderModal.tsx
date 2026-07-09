import { X, Bell, BellOff } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { NotificationSettings } from '@/hooks/useNotifications';

interface ReminderModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: NotificationSettings;
  permission: NotificationPermission;
  onToggle: (key: 'taskStart' | 'dailySummary' | 'deadlineReminder' | 'weeklyReport') => void;
  onRequestPermission: () => void;
  onTest: () => void;
}

const items: { key: 'taskStart' | 'dailySummary' | 'deadlineReminder' | 'weeklyReport'; label: string; desc: string }[] = [
  { key: 'taskStart', label: '任务开始前提醒', desc: '任务开始前15分钟通知' },
  { key: 'dailySummary', label: '每日待办汇总', desc: '每天早上9点推送今日任务' },
  { key: 'deadlineReminder', label: '任务截止提醒', desc: '过期未完成任务通知' },
  { key: 'weeklyReport', label: '周完成报告', desc: '每周日晚推送完成统计' },
];

export default function ReminderModal({
  isOpen,
  onClose,
  settings,
  permission,
  onToggle,
  onRequestPermission,
  onTest,
}: ReminderModalProps) {
  const granted = permission === 'granted';
  const denied = permission === 'denied';

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/40 z-[60]"
          />
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="absolute bottom-0 left-0 right-0 bg-[var(--bg-primary)] rounded-t-2xl z-[70]"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--divider)]">
              <h2 className="text-[17px] font-semibold text-[var(--text-primary)]">提醒设置</h2>
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center active:scale-95 transition-transform"
              >
                <X size={18} className="text-[var(--text-secondary)]" />
              </button>
            </div>

            {/* Permission Banner */}
            {!granted && (
              <div className="px-4 pt-3">
                <div
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-xl ${
                    denied ? 'bg-red-50' : 'bg-[var(--primary-blue)]/10'
                  }`}
                >
                  {denied ? (
                    <BellOff size={18} className="text-[var(--red)] shrink-0" />
                  ) : (
                    <Bell size={18} className="text-[var(--primary-blue)] shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className={`text-[13px] font-medium ${denied ? 'text-[var(--red)]' : 'text-[var(--primary-blue)]'}`}>
                      {denied ? '通知权限被拒绝' : '需要通知权限'}
                    </p>
                    <p className="text-[11px] text-[var(--text-tertiary)]">
                      {denied
                        ? '请在浏览器设置中允许通知'
                        : '开启后才能收到任务提醒'}
                    </p>
                  </div>
                  {!denied && (
                    <button
                      onClick={onRequestPermission}
                      className="px-3 py-1.5 rounded-lg bg-[var(--primary-blue)] text-white text-[12px] font-medium shrink-0 active:scale-95 transition-transform"
                    >
                      授权
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Settings List */}
            <div className="px-4 py-3">
              <div className="bg-white rounded-xl overflow-hidden">
                {items.map((item, idx) => {
                  const enabled = settings[item.key];
                  return (
                    <div
                      key={item.key}
                      className={`flex items-center justify-between px-4 py-3.5 ${
                        idx < items.length - 1 ? 'border-b border-[var(--divider)]' : ''
                      }`}
                    >
                      <div className="flex-1 min-w-0 mr-4">
                        <p className="text-[15px] text-[var(--text-primary)]">{item.label}</p>
                        <p className="text-[12px] text-[var(--text-tertiary)] mt-0.5">{item.desc}</p>
                      </div>
                      <button
                        onClick={() => onToggle(item.key)}
                        disabled={!granted}
                        className={`w-12 h-7 rounded-full transition-colors duration-200 relative shrink-0 ${
                          enabled && granted
                            ? 'bg-[var(--green)]'
                            : 'bg-[var(--icon-gray)]'
                        }`}
                      >
                        <motion.div
                          className="w-5 h-5 rounded-full bg-white absolute top-1"
                          animate={{
                            left: enabled && granted ? 26 : 4,
                            opacity: granted ? 1 : 0.6,
                          }}
                          transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                          style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.15)' }}
                        />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Test Button */}
            {granted && (
              <div className="px-4 pb-4">
                <button
                  onClick={onTest}
                  className="w-full h-11 rounded-xl bg-white border border-[var(--divider)] text-[14px] text-[var(--primary-blue)] font-medium active:bg-[var(--bg-primary)] transition-colors"
                >
                  发送测试通知
                </button>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
