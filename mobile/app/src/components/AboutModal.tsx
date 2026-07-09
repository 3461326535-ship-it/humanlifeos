import { X, Calendar, Github, Heart } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

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
            className="absolute top-1/2 left-4 right-4 -translate-y-1/2 bg-white rounded-2xl z-[70] p-6 max-w-sm mx-auto"
          >
            {/* Close */}
            <button
              onClick={onClose}
              className="absolute top-3 right-3 w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center active:scale-95 transition-transform"
            >
              <X size={16} className="text-[var(--text-secondary)]" />
            </button>

            {/* Icon */}
            <div className="flex flex-col items-center mt-2">
              <div className="w-16 h-16 rounded-2xl bg-[var(--primary-blue)] flex items-center justify-center mb-3">
                <Calendar size={32} strokeWidth={2} className="text-white" />
              </div>
              <h2 className="text-[20px] font-bold text-[var(--text-primary)]">LifeOs</h2>
              <p className="text-[13px] text-[var(--text-tertiary)] mt-1">v2.1.0</p>
            </div>

            {/* Info */}
            <div className="mt-5 space-y-3">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-[var(--bg-primary)] flex items-center justify-center shrink-0">
                  <Heart size={16} className="text-[var(--red)]" />
                </div>
                <div>
                  <p className="text-[14px] font-medium text-[var(--text-primary)]">简洁高效</p>
                  <p className="text-[12px] text-[var(--text-tertiary)] mt-0.5">
                    专注于日程管理与任务追踪，让时间管理更简单 — LifeOs
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-[var(--bg-primary)] flex items-center justify-center shrink-0">
                  <Github size={16} className="text-[var(--text-secondary)]" />
                </div>
                <div>
                  <p className="text-[14px] font-medium text-[var(--text-primary)]">开源技术</p>
                  <p className="text-[12px] text-[var(--text-tertiary)] mt-0.5">
                    基于 React + TypeScript + Tailwind CSS 构建
                  </p>
                </div>
              </div>
            </div>

            {/* Footer */}
            <p className="text-center text-[11px] text-[var(--text-tertiary)] mt-5">
              2026 LifeOs · All Rights Reserved
            </p>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
