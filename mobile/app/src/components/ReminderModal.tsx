import { SketchIcon } from '@/components/icons/SketchIcon';
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
            className="absolute bottom-0 left-0 right-0 bg-[var(--bg-card)] rounded-t-2xl z-[70]"
          >
            <div className="flex items-center justify-between px-4 py-3 border-b-2 border-dashed border-[var(--ink-soft)]">
              <h2 className="font-head text-[17px] text-[var(--ink)]">提醒设置</h2>
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-full bg-[var(--fill-quaternary)] flex items-center justify-center active:scale-95 transition-transform"
              >
                <SketchIcon name="x" size={18} strokeWidth={2.5} className="text-[var(--ink-soft)]" />
              </button>
            </div>

            {!granted && (
              <div className="px-4 pt-3">
                <div className={`flex items-center gap-3 px-3 py-2.5 rounded-xl sketch-wobble-sm border-2 ${
                  denied ? 'bg-red-50 border-[var(--red)]' : 'bg-[var(--red)]/10 border-[var(--red)]'
                }`}>
                  {denied ? (
                    <SketchIcon name="bell-off" size={18} strokeWidth={2} className="text-[var(--red)] shrink-0" />
                  ) : (
                    <SketchIcon name="bell" size={18} strokeWidth={2} className="text-[var(--red)] shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className={`font-head text-[13px] ${denied ? 'text-[var(--red)]' : 'text-[var(--red)]'}`}>
                      {denied ? '通知权限被拒绝' : '需要通知权限'}
                    </p>
                    <p className="text-[11px] text-[var(--ink-soft)] font-body">
                      {denied ? '请在浏览器设置中允许通知' : '开启后才能收到任务提醒'}
                    </p>
                  </div>
                  {!denied && (
                    <button
                      onClick={onRequestPermission}
                      className="px-3 py-1.5 rounded-lg bg-[var(--red)] text-white text-[12px] font-head font-medium shrink-0 active:scale-95 transition-transform border-2 border-[var(--ink)] sketch-wobble-sm"
                    >
                      授权
                    </button>
                  )}
                </div>
              </div>
            )}

            <div className="px-4 py-3">
              <div className="flex flex-col gap-[11px]">
                {items.map((item) => {
                  const enabled = settings[item.key];
                  return (
                    <div key={item.key} className="sketch-card flex items-center justify-between px-4 py-3.5">
                      <div className="flex-1 min-w-0 mr-4">
                        <p className="font-head text-[15px] text-[var(--ink)]">{item.label}</p>
                        <p className="text-[12px] text-[var(--ink-soft)] mt-0.5 font-body">{item.desc}</p>
                      </div>
                      <button
                        onClick={() => onToggle(item.key)}
                        disabled={!granted}
                        className={`w-12 h-7 rounded-full transition-colors duration-200 relative shrink-0 border-2 border-[var(--ink)] sketch-wobble-sm ${
                          enabled && granted ? 'bg-[var(--green)]' : 'bg-[var(--icon-gray)]'
                        }`}
                      >
                        <motion.div
                          className="w-5 h-5 rounded-full bg-white absolute top-0.5"
                          animate={{ left: enabled && granted ? 26 : 4, opacity: granted ? 1 : 0.6 }}
                          transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                        />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            {granted && (
              <div className="px-4 pb-4">
                <button
                  onClick={onTest}
                  className="w-full h-11 rounded-xl bg-[var(--bg-card)] border-2 border-[var(--ink)] text-[14px] text-[var(--red)] font-head font-medium active:bg-[var(--fill-quaternary)] transition-colors sketch-wobble-sm"
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
