import { useState, useMemo } from 'react';
import { SketchIcon } from '@/components/icons/SketchIcon';
import { motion, AnimatePresence } from 'framer-motion';
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
          stroke="var(--ink)"
          strokeWidth={strokeWidth}
          fill="transparent"
          r={normalizedRadius}
          cx={radius}
          cy={radius}
          filter="url(#wobble)"
        />
        <motion.circle
          stroke="var(--yellow)"
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
          filter="url(#wobble)"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="flex items-baseline">
          <span className="font-head text-[36px] text-[var(--ink)] leading-none">{percentage}</span>
          <span className="font-head text-[20px] text-[var(--ink)] ml-0.5">%</span>
        </div>
        <span className="text-[12px] text-[var(--ink-soft)] mt-1 font-caveat">完成率</span>
      </div>
    </div>
  );
}

function OverdueBar({ tasks }: { tasks: Task[] }) {
  const todayStr = getTodayStr();

  const breakdown = useMemo(() => {
    const overdue = tasks.filter((t) => !t.completed && t.date < todayStr);
    let severe = 0;
    let moderate = 0;

    for (const t of overdue) {
      const days = getOverdueDays(t.date);
      if (days >= 7) severe++;
      else if (days >= 1) moderate++;
    }

    const dueToday = tasks.filter((t) => !t.completed && t.date === todayStr).length;
    return { severe, moderate, dueToday };
  }, [tasks, todayStr]);

  const total = breakdown.severe + breakdown.moderate + breakdown.dueToday;
  if (total === 0) return null;

  return (
    <div className="mt-4 mx-4">
      <div className="sketch-card px-4 py-3 flex items-center justify-around">
        <div className="flex flex-col items-center gap-0.5">
          <span className="font-head text-[20px] text-[var(--red)]">{breakdown.severe}</span>
          <div className="flex items-center gap-1">
            <SketchIcon name="alert" size={12} strokeWidth={2} className="text-[var(--red)]" />
            <span className="text-[11px] text-[var(--ink-soft)]">严重逾期</span>
          </div>
        </div>
        <div className="w-px h-8 bg-[var(--divider)]" />
        <div className="flex flex-col items-center gap-0.5">
          <span className="font-head text-[20px] text-[var(--yellow)]">{breakdown.moderate}</span>
          <div className="flex items-center gap-1">
            <SketchIcon name="clock" size={12} strokeWidth={2} className="text-[var(--yellow)]" />
            <span className="text-[11px] text-[var(--ink-soft)]">近期逾期</span>
          </div>
        </div>
        <div className="w-px h-8 bg-[var(--divider)]" />
        <div className="flex flex-col items-center gap-0.5">
          <span className="font-head text-[20px] text-[var(--yellow)]">{breakdown.dueToday}</span>
          <div className="flex items-center gap-1">
            <SketchIcon name="clock" size={12} strokeWidth={2} className="text-[var(--yellow)]" />
            <span className="text-[11px] text-[var(--ink-soft)]">今天到期</span>
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

  const filteredTasks = useMemo(() => filterByRange(tasks), [tasks, filterByRange]);

  // ── 只统计到今天为止的任务（未来任务不参与完成率计算，避免拉低百分比）──
  const tasksUpToToday = useMemo(
    () => filteredTasks.filter((t) => t.date <= todayStr),
    [filteredTasks, todayStr]
  );

  const filteredCategoryStats = useMemo((): CategoryStat[] =>
    categoryStats.map((stat) => {
      const catTasks = filterByCategory(tasks, stat.category.id).filter(t => t.date <= todayStr);
      return {
        category: stat.category,
        completedCount: catTasks.filter((t) => t.completed).length,
        totalCount: catTasks.length,
      };
    }), [tasks, categoryStats, filterByCategory, todayStr]);

  const completionRate =
    tasksUpToToday.length > 0
      ? Math.round((tasksUpToToday.filter((t) => t.completed).length / tasksUpToToday.length) * 100)
      : 0;

  const overdueTasks = useMemo(() =>
    filteredTasks
      .filter((t) => !t.completed && t.date < todayStr)
      .sort((a, b) => a.date.localeCompare(b.date)),
  [filteredTasks, todayStr]);

  const allOverdueTasks = useMemo(() =>
    tasks.filter((t) => !t.completed && t.date <= todayStr),
  [tasks, todayStr]);

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

  const rangeLabel = timeRange === 'week' ? '本周' : timeRange === 'month' ? '本月' : '本年';

  // ── 动态日期副标题 ──
  const subtitle = useMemo(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    if (timeRange === 'month') {
      const days = new Date(y, m + 1, 0).getDate();
      return `${y}年${m + 1}月 · 共 ${days} 天`;
    }
    if (timeRange === 'week') {
      const day = now.getDay();
      const monday = new Date(now);
      monday.setDate(now.getDate() - (day === 0 ? 6 : day - 1));
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      return `${monday.getMonth() + 1}/${monday.getDate()} - ${sunday.getMonth() + 1}/${sunday.getDate()}`;
    }
    return `${y}年`;
  }, [timeRange]);

  // ── 动态洞察文案（随 timeRange / completionRate 变化）──
  const insight = useMemo(() => {
    const catsWithTasks = filteredCategoryStats.filter(s => s.totalCount > 0);
    if (catsWithTasks.length === 0) return `${rangeLabel}还没有任务数据，开始计划吧～`;

    const lowest = catsWithTasks.reduce((a, b) => {
      const aPct = a.totalCount > 0 ? a.completedCount / a.totalCount : 1;
      const bPct = b.totalCount > 0 ? b.completedCount / b.totalCount : 1;
      return aPct < bPct ? a : b;
    });

    const lowestPct = Math.round((lowest.completedCount / lowest.totalCount) * 100);
    const totalTasks = catsWithTasks.reduce((s, c) => s + c.totalCount, 0);

    if (completionRate >= 80) return `${rangeLabel}完成${completionRate}%，共 ${totalTasks} 项任务，继续保持 🎉`;
    if (completionRate >= 50) return `${rangeLabel}「${lowest.category.name}」只完成 ${lowestPct}%，加把劲～`;
    if (completionRate > 0) return `${rangeLabel}完成率 ${completionRate}%，从「${lowest.category.name}」开始吧`;
    return `${rangeLabel}还没有完成任务，从一个小目标开始 ⚡`;
  }, [filteredCategoryStats, completionRate, rangeLabel]);

  return (
    <div className="flex flex-col h-full relative">
      <div className="content-scrollable">
        {/* Section Head */}
        <div className="sketch-section-head">
          <h2 className="sketch-underline sketch-underline-yellow">统计</h2>
          <p className="text-[12px] text-[var(--ink-soft)] mt-[7px] font-caveat">
            {subtitle}
          </p>
        </div>

        {/* Time Range Selector */}
        <div className="px-4 py-3">
          <div className="inline-flex gap-[8px]">
            {timeRanges.map((range) => (
              <button
                key={range.key}
                onClick={() => setTimeRange(range.key)}
                className={`sketch-chip ${timeRange === range.key ? 'on' : ''}`}
              >
                {range.label}
              </button>
            ))}
          </div>
        </div>

        {/* Progress Ring Card */}
        <div className="sketch-card sketch-card-rot1 mx-[16px] mt-[12px] p-[20px] flex items-center gap-[16px] bg-[var(--bg-card)]">
          <ProgressRing percentage={completionRate} />
          <div className="flex-1">
            <div className="font-head text-[15px] text-[var(--ink)]">{rangeLabel}完成率</div>
            <div className="font-body text-[12.5px] text-[var(--ink)] mt-[6px] leading-[1.55]">
              {insight}
            </div>
          </div>
        </div>

        {/* Category Bars */}
        <div className="px-[16px] pt-[14px] flex flex-col gap-[11px]">
          {filteredCategoryStats.map((stat) => {
            const pct = stat.totalCount > 0 ? Math.round((stat.completedCount / stat.totalCount) * 100) : 0;
            return (
              <button
                key={stat.category.id}
                onClick={() => handleCategoryClick(stat.category)}
                className="sketch-card p-[12px_14px] text-left"
              >
                <div className="flex justify-between font-head text-[14px] text-[var(--ink)]">
                  <span>{stat.category.name}</span>
                  <span className="font-caveat text-[16px] text-[var(--ink-soft)]">{pct}%</span>
                </div>
                <div className="sketch-bar">
                  <span
                    className="sketch-bar-fill"
                    style={{ width: `${pct}%`, backgroundColor: stat.category.color }}
                  />
                </div>
              </button>
            );
          })}
        </div>

        {/* ── 逾期概览条 ── */}
        <OverdueBar tasks={allOverdueTasks} />

        {/* Overdue Tasks */}
        <div className="sketch-overdue mx-[16px] mt-[12px] mb-[12px]">
          <div className="font-head text-[14px] text-[var(--red)] flex items-center gap-[5px]">
            <SketchIcon name="alert" size={16} strokeWidth={2.4} />
            逾期未完成 · {overdueTasks.length} 项
          </div>
          {overdueTasks.length === 0 ? (
            <div className="text-center py-6">
              <div className="w-10 h-10 mx-auto mb-2 rounded-full bg-[var(--green)]/10 flex items-center justify-center sketch-wobble-sm">
                <SketchIcon name="check" size={20} strokeWidth={2.5} className="text-[var(--green)]" />
              </div>
              <p className="font-head text-[14px] text-[var(--ink)]">没有逾期任务</p>
            </div>
          ) : (
            overdueTasks.map((task, idx) => {
              const days = getOverdueDays(task.date);
              return (
                <motion.button
                  key={task.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.05, duration: 0.25 }}
                  onClick={() => handleTaskClick(task)}
                  className="w-full flex items-center justify-between text-left mt-[8px] font-body text-[12.5px] text-[var(--ink)]"
                >
                  <span className="truncate flex-1">{task.title}</span>
                  <span className="text-[var(--ink-soft)] shrink-0 ml-2">{overdueLabel(days)}</span>
                </motion.button>
              );
            })
          )}
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
