import { ChevronLeft, Check, Circle } from 'lucide-react';
import { motion } from 'framer-motion';
import type { Task, Category } from '@/types';

interface CategoryDetailPageProps {
  category: Category;
  tasks: Task[];
  onBack: () => void;
  onTaskClick: (task: Task) => void;
}

export default function CategoryDetailPage({
  category,
  tasks,
  onBack,
  onTaskClick,
}: CategoryDetailPageProps) {
  const completedCount = tasks.filter((t) => t.completed).length;
  const totalCount = tasks.length;
  const progress = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  // Sort: incomplete first, then by date desc
  const sortedTasks = [...tasks].sort((a, b) => {
    if (a.completed !== b.completed) return a.completed ? 1 : -1;
    return b.date.localeCompare(a.date);
  });

  const formatDate = (dateStr: string) => {
    const [y, m, d] = dateStr.split('-');
    return `${y}年${m}月${d}日`;
  };

  return (
    <motion.div
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ x: '100%' }}
      transition={{ type: 'spring', damping: 25, stiffness: 300 }}
      className="absolute inset-0 bg-[var(--bg-primary)] z-20 flex flex-col"
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
        <div className="flex items-center gap-2">
          <div
            className="w-3 h-3 rounded-full"
            style={{ backgroundColor: category.color }}
          />
          <span className="text-[16px] font-semibold text-[var(--text-primary)]">
            {category.name}
          </span>
        </div>
        <div className="flex-1" />
        <span className="text-[13px] text-[var(--text-tertiary)]">
          {completedCount}/{totalCount}
        </span>
      </div>

      {/* Progress Summary */}
      <div className="bg-white px-4 py-4 mb-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[14px] text-[var(--text-secondary)]">完成进度</span>
          <span className="text-[20px] font-bold" style={{ color: category.color }}>
            {progress}%
          </span>
        </div>
        <div className="w-full h-2.5 bg-[var(--bg-primary)] rounded-full overflow-hidden">
          <motion.div
            className="h-full rounded-full"
            style={{ backgroundColor: category.color }}
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
          />
        </div>
        <div className="flex items-center justify-between mt-2 text-[12px] text-[var(--text-tertiary)]">
          <span>{totalCount - completedCount} 待完成</span>
          <span>{completedCount} 已完成</span>
        </div>
      </div>

      {/* Task List */}
      <div className="content-scrollable px-0">
        {sortedTasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-[var(--text-tertiary)]">
            <p className="text-[15px]">该分类暂无任务</p>
          </div>
        ) : (
          <div className="bg-white">
            {sortedTasks.map((task, idx) => (
              <motion.button
                key={task.id}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.04, duration: 0.25 }}
                onClick={() => onTaskClick(task)}
                className={`w-full flex items-center px-4 py-3.5 text-left active:bg-[var(--bg-primary)] transition-colors ${
                  idx < sortedTasks.length - 1 ? 'border-b border-[var(--divider)]' : ''
                }`}
              >
                <div className="mr-3 shrink-0">
                  {task.completed ? (
                    <div className="w-5 h-5 rounded-full bg-[var(--green)] flex items-center justify-center">
                      <Check size={12} strokeWidth={3} className="text-white" />
                    </div>
                  ) : (
                    <Circle
                      size={20}
                      strokeWidth={1.5}
                      className="text-[var(--icon-gray)]"
                    />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p
                    className={`text-[15px] truncate ${
                      task.completed
                        ? 'text-[var(--text-tertiary)] line-through'
                        : 'text-[var(--text-primary)]'
                    }`}
                  >
                    {task.title}
                  </p>
                  <p className="text-[12px] text-[var(--text-tertiary)] mt-0.5">
                    {formatDate(task.date)} · {task.time}
                  </p>
                </div>
                {task.subtasks && task.subtasks.length > 0 && (
                  <span className="text-[11px] text-[var(--text-tertiary)] bg-[var(--bg-primary)] px-2 py-0.5 rounded-full mr-2">
                    {task.subtasks.filter((s) => s.completed).length}/{task.subtasks.length}
                  </span>
                )}
                <ChevronLeft
                  size={16}
                  className="text-[var(--icon-gray)] rotate-180 shrink-0"
                />
              </motion.button>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}
