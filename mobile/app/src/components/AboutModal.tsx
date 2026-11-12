import { SketchIcon } from '@/components/icons/SketchIcon';
import { motion, AnimatePresence } from 'framer-motion';
import { APP_VERSION } from '@/config';

interface AboutModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function AboutModal({ isOpen, onClose }: AboutModalProps) {
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
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="absolute top-1/2 left-4 right-4 -translate-y-1/2 bg-[var(--bg-card)] rounded-2xl z-[70] p-6 max-w-sm mx-auto sketch-wobble-sm border-2 border-[var(--ink)]"
          >
            <button
              onClick={onClose}
              className="absolute top-3 right-3 w-8 h-8 rounded-full bg-[var(--fill-quaternary)] flex items-center justify-center active:scale-95 transition-transform"
            >
              <SketchIcon name="x" size={16} strokeWidth={2.5} className="text-[var(--ink-soft)]" />
            </button>

            <div className="flex flex-col items-center mt-2">
              <div className="w-16 h-16 rounded-2xl bg-[var(--red)] flex items-center justify-center mb-3 border-2 border-[var(--ink)] sketch-wobble-sm">
                <SketchIcon name="calendar" size={32} strokeWidth={2} stroke="white" />
              </div>
              <h2 className="font-head text-[20px] text-[var(--ink)]">小日志</h2>
              <p className="text-[13px] text-[var(--ink-soft)] mt-1 font-caveat">v{APP_VERSION}</p>
            </div>

            <div className="mt-5 flex flex-col gap-[11px]">
              <div className="sketch-card p-[12px_14px] flex items-start gap-3">
                <div className="sketch-mitem-icon bg-[var(--red)]">
                  <SketchIcon name="heart" size={16} strokeWidth={2.5} stroke="white" />
                </div>
                <div>
                  <p className="font-head text-[14px] text-[var(--ink)]">简洁高效</p>
                  <p className="text-[12px] text-[var(--ink-soft)] mt-0.5 font-body">
                    专注于日程管理与任务追踪，让时间管理更简单
                  </p>
                </div>
              </div>
              <div className="sketch-card p-[12px_14px] flex items-start gap-3">
                <div className="sketch-mitem-icon bg-[var(--lav)]">
                  <SketchIcon name="sparkle" size={16} strokeWidth={2.5} stroke="white" />
                </div>
                <div>
                  <p className="font-head text-[14px] text-[var(--ink)]">开源技术</p>
                  <p className="text-[12px] text-[var(--ink-soft)] mt-0.5 font-body">
                    基于 React + TypeScript + Tailwind CSS 构建
                  </p>
                </div>
              </div>
            </div>

            <p className="text-center text-[11px] text-[var(--ink-soft)] mt-5 font-caveat">
{new Date().getFullYear()} 小日志 · All Rights Reserved
            </p>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
