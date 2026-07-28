import { useState, useMemo } from 'react';
import { Check, ChevronRight, AlertCircle, Clock } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import CategoryCard from '@/components/CategoryCard';
import CategoryDetailPage from '@/pages/CategoryDetailPage';
import TaskDetailPage from '@/pages/TaskDetailPage';
import { useTimeRange, getOverdueDays, overdueLabel, getTodayStr } from '@/hooks/useTimeRange';
import type { Task, TimeRange, CategoryStat, Category } from '@/types';

interface StatsPageProps {
  tasks: Task[];
  categoryStats: CategoryStat[];
  onToggleTask: (id: string) => void;
  onDeleteTask: (id: string, deleteChain?: boolean) => void;
  getCategoryColor: (categoryId: string) => string;
  getCategoryName: (categoryId: string) => string;
}

const timeRanges: { key: TimeRange; label: string }[] = [
  { key: 'week', label: '本周' },
  { key: 'month', label: '本月' },
  { key: 'year', label: '本年' },
];

function ProgressRing({ percentage }: { percentage: number }) {
  const radius = 70;
  const strokeWidth = 12;
  const normalizedRadius = radius - strokeWidth / 2;
  const circumference = normalizedRadius * 2 * Math.PI;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  return (
    <div className="relative flex items-center justify-center" style={{ width: radius * 2, height: radius * 2 }}>
      <svg width={radius * 2} height={radius * 2} className="-rotate-90">
        <circle
          stroke="#E5E5EA"
          strokeWidth={strokeWidth}
          fill="transparent"
          r={normalizedRadius}
          cx={radius}
          cy={radius}
        />
        <motion.circle
          stroke="#4A90D9"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          fill="transparent"
          r={normalizedRadius}
          cx={radius}
          cy={radius}
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset }}
          transition={{ duration: 1, ease: 'easeOut' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="flex items-baseline">
          <span className="text-[36px] font-bold text-[var(--text-primary)] leading-none">
            {percentage}
          </span>
          <span className="text-[20px] text-[var(--text-primary)] ml-0.5">%</span>
        </div>
        <span className="text-[12px] text-[var(--text-tertiary)] mt-1">完成率</span>
      </div>
    </div>
  );
}

/** 逾期概览条：按严重程度分组统计 */
function OverdueBar({ tasks }: { tasks: Task[] }) {
  const todayStr = getTodayStr();

  const breakdown = useMemo(() => {
    const overdue = tasks.filter((t) => !t.completed && t.date < todayStr);
    let severe = 0;   // ≥7 天
    let moderate = 0; // 1-7 天

    for (const t of overdue) {
      const days = getOverdueDays(t.date);
      if (days >= 7) severe++;
      else if (days >= 1) moderate++;
    }

    // 今天到期的未完成任务
    const dueToday = tasks.filter((t) => !t.completed && t.date === todayStr).length;

    return { severe, moderate, dueToday };
  }, [tasks, todayStr]);

  const total = breakdown.severe + breakdown.moderate + breakdown.dueToday;
  if (total === 0) return null;

  return (
    <div className="mt-4 mx-4">
      <div className="bg-white rounded-xl card-shadow px-4 py-3 flex items-center justify-around">
        <div className="flex flex-col items-center gap-0.5">
          <span className="text-[20px] font-bold text-[var(--red)]">{breakdown.severe}</span>
          <div className="flex items-center gap-1">
            <AlertCircle size={12} className="text-[var(--red)]" />
            <span className="text-[11px] text-[var(--text-tertiary)]">严重逾期</span>
          </div>
        </div>
        <div className="w-px h-8 bg-[var(--divider)]" />
        <div className="flex flex-col items-center gap-0.5">
          <span className="text-[20px] font-bold" style={{ color: '#FF9500' }}>{breakdown.moderate}</span>
          <div className="flex items-center gap-1">
            <Clock size={12} style={{ color: '#FF9500' }} />
            <span className="text-[11px] text-[var(--text-tertiary)]">近期逾期</span>
          </div>
        </div>
        <div className="w-px h-8 bg-[var(--divider)]" />
        <div className="flex flex-col items-center gap-0.5">
          <span className="text-[20px] font-bold" style={{ color: '#FF9500' }}>{breakdown.dueToday}</span>
          <div className="flex items-center gap-1">
            <Clock size={12} style={{ color: '#FF9500' }} />
            <span className="text-[11px] text-[var(--text-tertiary)]">今天到期</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function StatsPage({
  tasks,
  categoryStats,
  onToggleTask,
  onDeleteTask,
  getCategoryColor,
  getCategoryName,
}: StatsPageProps) {
  const [timeRange, setTimeRange] = useState<TimeRange>('month');
  const [drillDown, setDrillDown] = useState<'none' | 'category' | 'task'>('none');
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);

  const { filterByRange, filterByCategory } = useTimeRange(timeRange);
  const todayStr = getTodayStr();

  // ── 时间范围内的任务 ──
  const filteredTasks = useMemo(() => filterByRange(tasks), [tasks, filterByRange]);

  // ── 分类统计 ──
  const filteredCategoryStats = useMemo((): CategoryStat[] =>
    categoryStats.map((stat) => {
      const catTasks = filterByCategory(tasks, stat.category.id);
      return {
        category: stat.category,
        completedCount: catTasks.filter((t) => t.completed).length,
        totalCount: catTasks.length,
      };
    }), [tasks, categoryStats, filterByCategory]);

  // ── 完成率 ──
  const completionRate =
    filteredTasks.length > 0
      ? Math.round((filteredTasks.filter((t) => t.completed).length / filteredTasks.length) * 100)
      : 0;

  // ── 逾期未完成任务（日期 < 今天 且 未完成，最早过期排前面）──
  const overdueTasks = useMemo(() =>
    filteredTasks
      .filter((t) => !t.completed && t.date < todayStr)
      .sort((a, b) => a.date.localeCompare(b.date)),
  [filteredTasks, todayStr]);

  // ── 所有任务（用于逾期概览条，不限于时间范围）──
  const allOverdueTasks = useMemo(() =>
    tasks.filter((t) => !t.completed && t.date <= todayStr),
  [tasks, todayStr]);

  // Drill down handlers
  const handleCategoryClick = (category: Category) => {
    setSelectedCategory(category);
    setDrillDown('category');
  };

  const handleTaskClick = (task: Task) => {
    setSelectedTask(task);
    setDrillDown('task');
  };

  const handleBack = () => {
    setDrillDown('none');
    setSelectedCategory(null);
    setSelectedTask(null);
  };

  const handleCategoryTaskClick = (task: Task) => {
    setSelectedTask(task);
    setDrillDown('task');
  };

  const handleTaskBack = () => {
    if (selectedCategory) {
      setDrillDown('category');
    } else {
      setDrillDown('none');
    }
    setSelectedTask(null);
  };

  return (
    <div className="flex flex-col h-full relative">
      <div className="content-scrollable">
        {/* Time Range Selector */}
        <div className="bg-white px-4 py-4">
          <div className="flex items-center justify-center">
            <div className="inline-flex bg-[var(--bg-primary)] rounded-lg p-0.5">
              {timeRanges.map((range) => (
                <button
                  key={range.key}
                  onClick={() => setTimeRange(range.key)}
                  className={`px-6 py-1.5 rounded-md text-[14px] font-medium transition-all duration-200 ${
                    timeRange === range.key
                      ? 'bg-[var(--primary-blue)] text-white'
                      : 'text-[var(--text-secondary)]'
                  }`}
                >
                  {range.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Title */}
        <div className="bg-white px-4 pb-3">
          <p className="text-[14px] text-[var(--text-secondary)]">
            {timeRange === 'week' ? '本周' : timeRange === 'month' ? '本月' : '本年'}完成率
          </p>
        </div>

        {/* Progress Ring */}
        <div className="bg-white px-4 pb-6 flex justify-center">
          <ProgressRing percentage={completionRate} />
        </div>

        {/* ── 逾期概览条 ── */}
        <OverdueBar tasks={allOverdueTasks} />

        {/* Category Section */}
        <div className="mt-3 px-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[16px] font-semibold text-[var(--text-primary)]">
              分类完成情况
            </span>
            <span className="text-[13px] text-[var(--text-tertiary)]">
              {categoryStats.length} 个分类
            </span>
          </div>

          <div className="flex gap-3 overflow-x-auto no-scrollbar snap-x snap-mandatory pb-1">
            {filteredCategoryStats.map((stat, idx) => (
              <button
                key={stat.category.id}
                onClick={() => handleCategoryClick(stat.category)}
                className="snap-start flex-shrink-0 w-[calc(33.333%-8px)] text-left"
              >
                <CategoryCard stat={stat} index={idx} />
              </button>
            ))}
          </div>
        </div>

        {/* Overdue Tasks */}
        <div className="mt-4 px-4 pb-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-[16px] font-semibold text-[var(--text-primary)]">
              逾期未完成
            </h3>
            {overdueTasks.length > 0 && (
              <span className="text-[13px] text-[var(--red)] font-medium">
                {overdueTasks.length} 项逾期
              </span>
            )}
          </div>
          <div className="bg-white rounded-xl card-shadow overflow-hidden">
            {overdueTasks.length === 0 ? (
              <div className="text-center py-8">
                <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-[var(--green)]/10 flex items-center justify-center">
                  <Check size={24} strokeWidth={2} className="text-[var(--green)]" />
                </div>
                <p className="text-[15px] text-[var(--text-primary)] font-medium">
                  没有逾期任务
                </p>
                <p className="text-[13px] text-[var(--text-tertiary)] mt-1">
                  所有任务都在计划时间内
                </p>
              </div>
            ) : (
              overdueTasks.map((task, idx) => {
                const days = getOverdueDays(task.date);
                const isUrgent = days >= 7;
                return (
                  <motion.button
                    key={task.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: idx * 0.05, duration: 0.25 }}
                    onClick={() => handleTaskClick(task)}
                    className={`w-full flex items-center px-4 py-3.5 text-left active:bg-[var(--bg-primary)] transition-colors ${
                      idx < overdueTasks.length - 1 ? 'border-b border-[var(--divider)]' : ''
                    }`}
                  >
                    <div
                      className="w-7 h-7 rounded-full flex items-center justify-center mr-3 shrink-0"
                      style={{ backgroundColor: isUrgent ? 'var(--red)' : '#FF9500' }}
                    >
                      {isUrgent ? (
                        <AlertCircle size={16} strokeWidth={2.5} className="text-white" />
                      ) : (
                        <Clock size={16} strokeWidth={2.5} className="text-white" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[15px] text-[var(--text-primary)] truncate">{task.title}</p>
                    </div>
                    <span
                      className="text-[12px] font-medium mr-2 shrink-0"
                      style={{ color: isUrgent ? 'var(--red)' : '#FF9500' }}
                    >
                      {overdueLabel(days)}
                    </span>
                    <span className="text-[12px] text-[var(--text-tertiary)] mr-1">{task.time}</span>
                    <ChevronRight size={16} className="text-[var(--icon-gray)] shrink-0" />
                  </motion.button>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Drill-down: Category Detail */}
      <AnimatePresence>
        {drillDown === 'category' && selectedCategory && (
          <CategoryDetailPage
            category={selectedCategory}
            tasks={filterByCategory(tasks, selectedCategory.id)}
            onBack={handleBack}
            onTaskClick={handleCategoryTaskClick}
          />
        )}
      </AnimatePresence>

      {/* Drill-down: Task Detail */}
      <AnimatePresence>
        {drillDown === 'task' && selectedTask && (
          <TaskDetailPage
            task={selectedTask}
            categoryColor={getCategoryColor(selectedTask.categoryId)}
            categoryName={getCategoryName(selectedTask.categoryId)}
            onBack={handleTaskBack}
            onToggle={onToggleTask}
            onDelete={onDeleteTask}
            onEdit={() => {}}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
