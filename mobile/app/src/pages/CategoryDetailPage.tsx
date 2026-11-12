import { SketchIcon } from '@/components/icons/SketchIcon';
import { SketchCheckbox } from '@/components/sketch/SketchCheckbox';
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
      className="absolute inset-0 z-20 flex flex-col"
      style={{
        backgroundColor: 'var(--bg-primary)',
        backgroundImage: 'radial-gradient(#E2D6B8 1px, transparent 1.4px)',
        backgroundSize: '15px 15px',
      }}
    >
      {/* Header */}
      <div className="shrink-0 bg-[var(--bg-card)] px-4 py-3 flex items-center gap-3 border-b-2 border-dashed border-[var(--ink-soft)]">
        <button onClick={onBack} className="flex items-center gap-0.5 text-[var(--red)] active:opacity-60 transition-opacity">
          <SketchIcon name="chevron-left" size={22} strokeWidth={2.5} />
          <span className="font-head text-[15px]">返回</span>
        </button>
        <div className="flex-1" />
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: category.color }} />
          <span className="font-head text-[16px] text-[var(--ink)]">{category.name}</span>
        </div>
        <div className="flex-1" />
        <span className="text-[13px] text-[var(--ink-soft)] font-caveat">{completedCount}/{totalCount}</span>
      </div>

      {/* Progress Summary */}
      <div className="bg-[var(--bg-card)] px-4 py-4 mb-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[14px] text-[var(--ink-soft)] font-head">完成进度</span>
          <span className="font-head text-[20px]" style={{ color: category.color }}>{progress}%</span>
        </div>
        <div className="sketch-bar">
          <motion.div
            className="sketch-bar-fill"
            style={{ backgroundColor: category.color }}
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
          />
        </div>
        <div className="flex items-center justify-between mt-2 text-[12px] text-[var(--ink-soft)] font-caveat">
          <span>{totalCount - completedCount} 待完成</span>
          <span>{completedCount} 已完成</span>
        </div>
      </div>

      {/* Task List */}
      <div className="content-scrollable px-0">
        {sortedTasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-[var(--ink-soft)]">
            <p className="font-head text-[15px]">该分类暂无任务</p>
          </div>
        ) : (
          <div className="px-[16px] flex flex-col gap-[11px]">
            {sortedTasks.map((task, idx) => (
              <motion.button
                key={task.id}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.04, duration: 0.25 }}
                onClick={() => onTaskClick(task)}
                className="sketch-card p-[13px_14px] flex items-center gap-[11px] text-left"
              >
                <SketchCheckbox checked={task.completed} size={20} />
                <div className="flex-1 min-w-0">
                  <p className={`font-body text-[15px] font-bold truncate ${task.completed ? 'text-[var(--ink-soft)] line-through' : 'text-[var(--ink)]'}`}>
                    {task.title}
                  </p>
                  <p className="text-[12px] text-[var(--ink-soft)] mt-[3px]">
                    {formatDate(task.date)} · {task.time}
                  </p>
                </div>
                {task.subtasks && task.subtasks.length > 0 && (
                  <span className="text-[11px] text-[var(--ink-soft)] bg-[var(--fill-quaternary)] px-2 py-0.5 rounded-full font-head">
                    {task.subtasks.filter((s) => s.completed).length}/{task.subtasks.length}
                  </span>
                )}
                <SketchIcon name="chevron-right" size={16} strokeWidth={2.5} className="text-[var(--icon-gray)]" />
              </motion.button>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}
