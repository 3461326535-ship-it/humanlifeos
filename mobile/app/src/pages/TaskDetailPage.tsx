import { useState } from 'react';
import { SketchIcon } from '@/components/icons/SketchIcon';
import { SketchCheckbox } from '@/components/sketch/SketchCheckbox';
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
  blue: '#5FB8E8',
  green: '#8CC152',
  red: '#F4746B',
  purple: '#B58BE0',
  yellow: '#FFC93C',
  gray: '#C9BEA3',
};

const recurrenceLabels: Record<string, string> = {
  daily: '每天',
  weekly: '每周',
  monthly: '每月',
  yearly: '每年',
};

const colorLabelMap: Record<string, string> = {
  blue: '蓝色',
  green: '绿色',
  red: '红色',
  purple: '紫色',
  yellow: '黄色',
  gray: '灰色',
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
      style={{
        backgroundImage: 'radial-gradient(#E2D6B8 1px, transparent 1.4px)',
        backgroundSize: '15px 15px',
      }}
    >
      {/* Header */}
      <div className="shrink-0 bg-[var(--bg-card)] px-4 py-3 flex items-center gap-3 border-b-2 border-dashed border-[var(--ink-soft)]">
        <button
          onClick={onBack}
          className="flex items-center gap-0.5 text-[var(--red)] active:opacity-60 transition-opacity"
        >
          <SketchIcon name="chevron-left" size={22} strokeWidth={2.5} />
          <span className="font-head text-[15px]">返回</span>
        </button>
        <div className="flex-1" />
        <span className="font-head text-[16px] text-[var(--ink)]">任务详情</span>
        <div className="flex-1" />
        <button
          onClick={() => onEdit(task)}
          className="w-8 h-8 rounded-full flex items-center justify-center active:bg-[var(--fill-quaternary)] transition-colors mr-1"
        >
          <SketchIcon name="pen" size={18} className="text-[var(--red)]" />
        </button>
        <button
          onClick={() => setShowDeleteConfirm(true)}
          className="w-8 h-8 rounded-full flex items-center justify-center active:bg-red-50 transition-colors"
        >
          <SketchIcon name="trash" size={18} className="text-[var(--red)]" />
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
                backgroundColor: isSevere ? 'rgba(244,116,107,0.1)' : 'rgba(255,201,60,0.1)',
                border: `2px solid ${isSevere ? 'rgba(244,116,107,0.3)' : 'rgba(255,201,60,0.3)'}`,
              }}
            >
              <SketchIcon
                name="alert"
                size={20}
                strokeWidth={2}
                style={{ color: isSevere ? 'var(--red)' : 'var(--yellow)' }}
                className="shrink-0"
              />
              <div>
                <p
                  className="font-head text-[14px]"
                  style={{ color: isSevere ? 'var(--red)' : 'var(--yellow)' }}
                >
                  {days === 1 ? '已逾期 1 天' : `已逾期 ${days} 天`}
                </p>
                <p className="text-[12px] text-[var(--ink-soft)] mt-0.5">
                  该任务尚未完成，请尽快处理
                </p>
              </div>
            </motion.div>
          );
        })()}

        {/* Task Card */}
        <div className="bg-[var(--bg-card)] px-4 py-5">
          {/* Status + Title */}
          <div className="flex items-start gap-3">
            <button
              onClick={() => onToggle(task.id)}
              className="mt-0.5 shrink-0"
            >
              <SketchCheckbox checked={task.completed} size={24} />
            </button>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <h2
                  className={`font-head text-[20px] leading-snug ${
                    task.completed
                      ? 'text-[var(--ink-soft)] line-through'
                      : 'text-[var(--ink)]'
                  }`}
                >
                  {task.title}
                </h2>
                {task.recurrence && (
                  <SketchIcon name="repeat" size={16} className="text-[var(--ink-soft)] shrink-0" />
                )}
              </div>
            </div>
          </div>

          {/* Meta Info */}
          <div className="mt-4 space-y-3">
            <div className="flex items-center gap-3">
              <span className="text-[13px] text-[var(--ink-soft)] w-14 shrink-0">日期</span>
              <span className="text-[15px] text-[var(--ink)]">{formatDate(task.date)}</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[13px] text-[var(--ink-soft)] w-14 shrink-0">时间</span>
              <span className="text-[15px] text-[var(--red)] font-medium">{task.time}</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[13px] text-[var(--ink-soft)] w-14 shrink-0">分类</span>
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: categoryColor }} />
                <span className="text-[15px] text-[var(--ink)]">{categoryName}</span>
              </div>
            </div>
            {task.description && (
              <div className="flex items-start gap-3">
                <span className="text-[13px] text-[var(--ink-soft)] w-14 shrink-0 pt-0.5">描述</span>
                <p
                  className={`text-[14px] leading-relaxed flex-1 font-body ${
                    task.completed
                      ? 'text-[var(--ink-soft)] line-through'
                      : 'text-[var(--ink-soft)]'
                  }`}
                >
                  {task.description}
                </p>
              </div>
            )}
            {task.recurrence && (
              <div className="flex items-center gap-3">
                <span className="text-[13px] text-[var(--ink-soft)] w-14 shrink-0">重复</span>
                <span className="text-[15px] text-[var(--red)]">
                  {recurrenceLabels[task.recurrence] || task.recurrence}
                  {task.recurrenceEndDate && (
                    <span className="text-[13px] text-[var(--ink-soft)] ml-1">
                      · 至 {task.recurrenceEndDate}
                    </span>
                  )}
                </span>
              </div>
            )}
            <div className="flex items-center gap-3">
              <span className="text-[13px] text-[var(--ink-soft)] w-14 shrink-0">状态</span>
              <span
                className={`font-head text-[14px] font-medium px-2.5 py-0.5 rounded-full border-2 sketch-wobble-sm ${
                  task.completed
                    ? 'bg-[var(--green)]/10 text-[var(--green)] border-[var(--green)]'
                    : 'bg-[var(--red)]/10 text-[var(--red)] border-[var(--red)]'
                }`}
              >
                {task.completed ? '已完成' : '进行中'}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[13px] text-[var(--ink-soft)] w-14 shrink-0">标记</span>
              <div className="flex items-center gap-2">
                <div
                  className="w-4 h-4 rounded-full border-2 border-[var(--ink)] sketch-wobble-sm"
                  style={{ backgroundColor: colorMap[task.color] || '#C9BEA3' }}
                />
                <span className="text-[14px] text-[var(--ink-soft)]">
                  {colorLabelMap[task.color] || '灰色'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Subtasks */}
        {task.subtasks && task.subtasks.length > 0 && (
          <div className="mt-3 bg-[var(--bg-card)] px-4 py-4">
            <h3 className="font-head text-[14px] text-[var(--ink)] mb-3">
              子任务 ({task.subtasks.filter((s) => s.completed).length}/{task.subtasks.length})
            </h3>
            <div className="space-y-2">
              {task.subtasks.map((sub) => (
                <div key={sub.id} className="flex items-center gap-3 py-2">
                  <SketchCheckbox checked={sub.completed} size={20} />
                  <span
                    className={`text-[15px] font-body ${
                      sub.completed
                        ? 'text-[var(--ink-soft)] line-through'
                        : 'text-[var(--ink)]'
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
            className="w-full bg-[var(--bg-card)] rounded-t-2xl p-4"
          >
            {!isRecurring ? (
              <>
                <p className="font-head text-[16px] text-[var(--ink)] text-center mb-1">删除任务</p>
                <p className="text-[14px] text-[var(--ink-soft)] text-center mb-4">
                  确定要删除「{task.title}」吗？此操作不可撤销。
                </p>
                <button
                  onClick={() => handleDelete(false)}
                  className="w-full h-12 rounded-xl bg-[var(--red)] text-white text-[16px] font-head font-semibold active:scale-[0.98] transition-all mb-2 border-2 border-[var(--ink)] sketch-wobble-sm"
                >
                  删除
                </button>
              </>
            ) : (
              <>
                <p className="font-head text-[16px] text-[var(--ink)] text-center mb-1">删除周期性任务</p>
                <p className="text-[14px] text-[var(--ink-soft)] text-center mb-4">
                  「{task.title}」是{recurrenceLabels[task.recurrence || ''] || ''}重复任务，请选择删除方式：
                </p>
                <button
                  onClick={() => handleDelete(false)}
                  className="w-full h-12 rounded-xl border-2 border-[var(--ink)] text-[var(--ink)] text-[15px] active:scale-[0.98] transition-all mb-2 flex items-center justify-center gap-2 sketch-wobble-sm"
                >
                  仅删除当天
                </button>
                <button
                  onClick={() => handleDelete(true)}
                  className="w-full h-12 rounded-xl bg-[var(--red)] text-white text-[15px] font-head font-semibold active:scale-[0.98] transition-all mb-2 flex items-center justify-center gap-2 border-2 border-[var(--ink)] sketch-wobble-sm"
                >
                  删除该系列之后全部
                </button>
              </>
            )}
            <button
              onClick={() => setShowDeleteConfirm(false)}
              className="w-full h-12 rounded-xl bg-[var(--fill-quaternary)] text-[var(--ink)] text-[16px] active:scale-[0.98] transition-all font-head"
            >
              取消
            </button>
          </motion.div>
        </div>
      )}
    </motion.div>
  );
}
