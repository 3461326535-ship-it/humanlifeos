import { useState } from 'react';
import { ChevronLeft, Check, Circle, Trash2, Pencil, Repeat, AlertTriangle } from 'lucide-react';
import { motion } from 'framer-motion';
import type { Task } from '@/types';
import { getOverdueDays } from '@/hooks/useTimeRange';

interface TaskDetailPageProps {
  task: Task;
  categoryColor: string;
  categoryName: string;
  onBack: () => void;
  onToggle: (taskId: string) => void;
  onDelete: (taskId: string, deleteChain?: boolean) => void;
  onEdit: (task: Task) => void;
}

const colorMap: Record<string, string> = {
  blue: '#E8887E',  // macaron coral red
  green: '#34C759',
  red: '#FF3B30',
  purple: '#AF52DE',
  yellow: '#FFCC00',
  gray: '#8E8E93',
};

const recurrenceLabels: Record<string, string> = {
  daily: '每天',
  weekly: '每周',
  monthly: '每月',
  yearly: '每年',
};

export default function TaskDetailPage({
  task,
  categoryColor,
  categoryName,
  onBack,
  onToggle,
  onDelete,
  onEdit,
}: TaskDetailPageProps) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const weekDays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];

  const formatDate = (dateStr: string) => {
    const [y, m, d] = dateStr.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    return `${y}年${m}月${d}日 ${weekDays[date.getDay()]}`;
  };

  const handleDelete = (deleteChain = false) => {
    onDelete(task.id, deleteChain);
    onBack();
  };

  const isRecurring = task.recurrence && ['daily', 'weekly', 'monthly', 'yearly'].includes(task.recurrence);

  return (
    <motion.div
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ x: '100%' }}
      transition={{ type: 'spring', damping: 25, stiffness: 300 }}
      className="fixed inset-0 bg-[var(--bg-primary)] z-30 flex flex-col"
    >
      {/* Header */}
      <div className="shrink-0 bg-white px-4 py-3 flex items-center gap-3 border-b border-[var(--divider)]">
        <button
          onClick={onBack}
          className="flex items-center gap-0.5 text-[var(--primary-blue)] active:opacity-60 transition-opacity"
        >
          <ChevronLeft size={22} strokeWidth={2.5} />
          <span className="text-[15px]">返回</span>
        </button>
        <div className="flex-1" />
        <span className="text-[16px] font-semibold text-[var(--text-primary)]">
          任务详情
        </span>
        <div className="flex-1" />
        <button
          onClick={() => onEdit(task)}
          className="w-8 h-8 rounded-full flex items-center justify-center active:bg-blue-50 transition-colors mr-1"
        >
          <Pencil size={18} className="text-[var(--primary-blue)]" />
        </button>
        <button
          onClick={() => setShowDeleteConfirm(true)}
          className="w-8 h-8 rounded-full flex items-center justify-center active:bg-red-50 transition-colors"
        >
          <Trash2 size={18} className="text-[var(--red)]" />
        </button>
      </div>

      <div className="content-scrollable">
        {/* Overdue Banner */}
        {!task.completed && (() => {
          const days = getOverdueDays(task.date);
          if (days <= 0) return null;
          const isSevere = days >= 7;
          return (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              className="mx-4 mt-3 px-4 py-3 rounded-xl flex items-center gap-3"
              style={{
                backgroundColor: isSevere ? 'rgba(255,59,48,0.1)' : 'rgba(255,149,0,0.1)',
                border: `1px solid ${isSevere ? 'rgba(255,59,48,0.3)' : 'rgba(255,149,0,0.3)'}`,
              }}
            >
              <AlertTriangle
                size={20}
                strokeWidth={2}
                style={{ color: isSevere ? 'var(--red)' : '#FF9500' }}
                className="shrink-0"
              />
              <div>
                <p
                  className="text-[14px] font-semibold"
                  style={{ color: isSevere ? 'var(--red)' : '#FF9500' }}
                >
                  {days === 1 ? '已逾期 1 天' : `已逾期 ${days} 天`}
                </p>
                <p className="text-[12px] text-[var(--text-tertiary)] mt-0.5">
                  该任务尚未完成，请尽快处理
                </p>
              </div>
            </motion.div>
          );
        })()}

        {/* Task Card */}
        <div className="bg-white px-4 py-5">
          {/* Status + Title */}
          <div className="flex items-start gap-3">
            <button
              onClick={() => onToggle(task.id)}
              className="mt-0.5 shrink-0"
            >
              {task.completed ? (
                <motion.div
                  initial={{ scale: 0.8 }}
                  animate={{ scale: 1 }}
                  className="w-6 h-6 rounded-full bg-[var(--green)] flex items-center justify-center"
                >
                  <Check size={14} strokeWidth={3} className="text-white" />
                </motion.div>
              ) : (
                <Circle
                  size={24}
                  strokeWidth={1.5}
                  className="text-[var(--icon-gray)]"
                />
              )}
            </button>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <h2
                  className={`text-[20px] font-semibold leading-snug ${
                    task.completed
                      ? 'text-[var(--text-tertiary)] line-through'
                      : 'text-[var(--text-primary)]'
                  }`}
                >
                  {task.title}
                </h2>
                {task.recurrence && (
                  <Repeat size={16} className="text-[var(--text-tertiary)] shrink-0" />
                )}
              </div>
            </div>
          </div>

          {/* Meta Info */}
          <div className="mt-4 space-y-3">
            {/* Date */}
            <div className="flex items-center gap-3">
              <span className="text-[13px] text-[var(--text-tertiary)] w-14 shrink-0">
                日期
              </span>
              <span className="text-[15px] text-[var(--text-primary)]">
                {formatDate(task.date)}
              </span>
            </div>

            {/* Time */}
            <div className="flex items-center gap-3">
              <span className="text-[13px] text-[var(--text-tertiary)] w-14 shrink-0">
                时间
              </span>
              <span className="text-[15px] text-[var(--primary-blue)] font-medium">
                {task.time}
              </span>
            </div>

            {/* Category */}
            <div className="flex items-center gap-3">
              <span className="text-[13px] text-[var(--text-tertiary)] w-14 shrink-0">
                分类
              </span>
              <div className="flex items-center gap-1.5">
                <div
                  className="w-2.5 h-2.5 rounded-full"
                  style={{ backgroundColor: categoryColor }}
                />
                <span className="text-[15px] text-[var(--text-primary)]">
                  {categoryName}
                </span>
              </div>
            </div>

            {/* Description */}
            {task.description && (
              <div className="flex items-start gap-3">
                <span className="text-[13px] text-[var(--text-tertiary)] w-14 shrink-0 pt-0.5">
                  描述
                </span>
                <p
                  className={`text-[14px] leading-relaxed flex-1 ${
                    task.completed
                      ? 'text-[var(--text-tertiary)] line-through'
                      : 'text-[var(--text-secondary)]'
                  }`}
                >
                  {task.description}
                </p>
              </div>
            )}

            {/* Recurrence */}
            {task.recurrence && (
              <div className="flex items-center gap-3">
                <span className="text-[13px] text-[var(--text-tertiary)] w-14 shrink-0">
                  重复
                </span>
                <span className="text-[15px] text-[var(--primary-blue)]">
                  {recurrenceLabels[task.recurrence] || task.recurrence}
                  {task.recurrenceEndDate && (
                    <span className="text-[13px] text-[var(--text-tertiary)] ml-1">
                      · 至 {task.recurrenceEndDate}
                    </span>
                  )}
                </span>
              </div>
            )}

            {/* Status */}
            <div className="flex items-center gap-3">
              <span className="text-[13px] text-[var(--text-tertiary)] w-14 shrink-0">
                状态
              </span>
              <span
                className={`text-[14px] font-medium px-2.5 py-0.5 rounded-full ${
                  task.completed
                    ? 'bg-[var(--green)]/10 text-[var(--green)]'
                    : 'bg-[var(--primary-blue)]/10 text-[var(--primary-blue)]'
                }`}
              >
                {task.completed ? '已完成' : '进行中'}
              </span>
            </div>

            {/* Color Tag */}
            <div className="flex items-center gap-3">
              <span className="text-[13px] text-[var(--text-tertiary)] w-14 shrink-0">
                标记
              </span>
              <div className="flex items-center gap-2">
                <div
                  className="w-4 h-4 rounded-full"
                  style={{ backgroundColor: colorMap[task.color] || '#8E8E93' }}
                />
                <span className="text-[14px] text-[var(--text-secondary)]">
                  {task.color === 'blue' && '红'}
                  {task.color === 'green' && '绿色'}
                  {task.color === 'red' && '红色'}
                  {task.color === 'purple' && '紫色'}
                  {task.color === 'yellow' && '黄色'}
                  {task.color === 'gray' && '灰色'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Subtasks */}
        {task.subtasks && task.subtasks.length > 0 && (
          <div className="mt-3 bg-white px-4 py-4">
            <h3 className="text-[14px] font-semibold text-[var(--text-primary)] mb-3">
              子任务 ({task.subtasks.filter((s) => s.completed).length}/{task.subtasks.length})
            </h3>
            <div className="space-y-2">
              {task.subtasks.map((sub) => (
                <div
                  key={sub.id}
                  className="flex items-center gap-3 py-2"
                >
                  {sub.completed ? (
                    <div className="w-5 h-5 rounded-full bg-[var(--green)] flex items-center justify-center shrink-0">
                      <Check size={12} strokeWidth={3} className="text-white" />
                    </div>
                  ) : (
                    <Circle
                      size={20}
                      strokeWidth={1.5}
                      className="text-[var(--icon-gray)] shrink-0"
                    />
                  )}
                  <span
                    className={`text-[15px] ${
                      sub.completed
                        ? 'text-[var(--text-tertiary)] line-through'
                        : 'text-[var(--text-primary)]'
                    }`}
                  >
                    {sub.title}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Delete Confirm */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/40 z-40 flex items-end">
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            className="w-full bg-white rounded-t-2xl p-4"
          >
            {!isRecurring ? (
              <>
                <p className="text-[16px] font-semibold text-[var(--text-primary)] text-center mb-1">
                  删除任务
                </p>
                <p className="text-[14px] text-[var(--text-tertiary)] text-center mb-4">
                  确定要删除「{task.title}」吗？此操作不可撤销。
                </p>
                <button
                  onClick={() => handleDelete(false)}
                  className="w-full h-12 rounded-xl bg-[var(--red)] text-white text-[16px] font-semibold active:scale-[0.98] transition-all mb-2"
                >
                  删除
                </button>
              </>
            ) : (
              <>
                <p className="text-[16px] font-semibold text-[var(--text-primary)] text-center mb-1">
                  删除周期性任务
                </p>
                <p className="text-[14px] text-[var(--text-tertiary)] text-center mb-4">
                  「{task.title}」是{recurrenceLabels[task.recurrence || ''] || ''}重复任务，请选择删除方式：
                </p>
                <button
                  onClick={() => handleDelete(false)}
                  className="w-full h-12 rounded-xl border border-gray-300 text-[var(--text-primary)] text-[15px] active:scale-[0.98] transition-all mb-2 flex items-center justify-center gap-2"
                >
                  <span>📅</span> 仅删除当天
                </button>
                <button
                  onClick={() => handleDelete(true)}
                  className="w-full h-12 rounded-xl bg-[var(--red)] text-white text-[15px] font-semibold active:scale-[0.98] transition-all mb-2 flex items-center justify-center gap-2"
                >
                  <span>🗑️</span> 删除该系列之后全部
                </button>
              </>
            )}
            <button
              onClick={() => setShowDeleteConfirm(false)}
              className="w-full h-12 rounded-xl bg-[var(--bg-primary)] text-[var(--text-primary)] text-[16px] active:scale-[0.98] transition-all"
            >
              取消
            </button>
          </motion.div>
        </div>
      )}
    </motion.div>
  );
}
