import { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import TaskCard from '@/components/TaskCard';
import AddTaskModal from '@/components/AddTaskModal';
import type { Task, Category, ViewMode } from '@/types';

interface CalendarPageProps {
  tasks: Task[];
  categories: Category[];
  onAddTask: (task: { title: string; time: string; categoryId: string; color: string; description?: string; recurrence?: string | null; recurrenceEndDate?: string }, date: string) => void;
  onToggleTask: (id: string) => void;
  onToggleSubtask: (taskId: string, subtaskId: string) => void;
}

const weekDays = ['日', '一', '二', '三', '四', '五', '六'];

// 8 色事件条背景（与 Web 端 cat-light-0~7 一致，inline 方式避免 Tailwind purge）
const EVENT_BG_COLORS = [
  'rgba(0,122,255,0.20)',
  'rgba(175,82,222,0.20)',
  'rgba(255,45,85,0.20)',
  'rgba(255,149,0,0.20)',
  'rgba(52,199,89,0.20)',
  'rgba(90,200,250,0.20)',
  'rgba(255,59,48,0.20)',
  'rgba(88,86,214,0.20)',
];

function hashCategoryIndex(categoryName: string): number {
  let hash = 0;
  for (let i = 0; i < categoryName.length; i++) {
    hash = ((hash << 5) - hash) + categoryName.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash) % 8;
}

function calculateTaskPoints(task: Task): { totalPoints: number; completedPoints: number } {
  if (!task.subtasks || task.subtasks.length === 0) {
    return { totalPoints: 1, completedPoints: task.completed ? 1 : 0 };
  }
  const totalPoints = task.subtasks.length;
  const completedPoints = task.subtasks.filter(st => st.completed).length;
  return { totalPoints, completedPoints };
}

const colorDotMap: Record<string, string> = {
  blue: '#E8887E',  // macaron coral red (was primary blue)
  green: '#34C759',
  red: '#FF3B30',
  purple: '#AF52DE',
  yellow: '#FFCC00',
  gray: '#8E8E93',
};

function formatDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getMonthData(year: number, month: number) {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startDayOfWeek = firstDay.getDay();
  const daysInMonth = lastDay.getDate();

  const prevMonthLastDay = new Date(year, month, 0).getDate();
  const cells: { date: number; isCurrentMonth: boolean; fullDate: Date }[] = [];

  for (let i = startDayOfWeek - 1; i >= 0; i--) {
    cells.push({
      date: prevMonthLastDay - i,
      isCurrentMonth: false,
      fullDate: new Date(year, month - 1, prevMonthLastDay - i),
    });
  }

  for (let i = 1; i <= daysInMonth; i++) {
    cells.push({
      date: i,
      isCurrentMonth: true,
      fullDate: new Date(year, month, i),
    });
  }

  const remaining = (7 - (cells.length % 7)) % 7;
  for (let i = 1; i <= remaining; i++) {
    cells.push({
      date: i,
      isCurrentMonth: false,
      fullDate: new Date(year, month + 1, i),
    });
  }

  return cells;
}

function getWeekData(centerDate: Date) {
  const day = centerDate.getDay();
  const diff = centerDate.getDate() - day;
  const days: Date[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(centerDate);
    d.setDate(diff + i);
    days.push(d);
  }
  return days;
}

export default function CalendarPage({
  tasks,
  categories,
  onAddTask,
  onToggleTask,
  onToggleSubtask,
}: CalendarPageProps) {
  const today = new Date();
  const [viewMode, setViewMode] = useState<ViewMode>('month');
  const [currentMonth, setCurrentMonth] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState(today);
  const [showAddModal, setShowAddModal] = useState(false);

  const monthCells = useMemo(
    () => getMonthData(currentMonth.getFullYear(), currentMonth.getMonth()),
    [currentMonth]
  );

  const weekDays2 = useMemo(() => getWeekData(selectedDate), [selectedDate]);

  // 按时间线排序：有时间 → 按时间升序；无时间 → 排到最后
  const selectedTasks = tasks
    .filter((t) => t.date === formatDateKey(selectedDate))
    .sort((a, b) => {
      if (a.time && !b.time) return -1;
      if (!a.time && b.time) return 1;
      if (!a.time && !b.time) return 0;
      return a.time.localeCompare(b.time);
    });

  // 本月分类汇总（与 Web 端 renderMonthCategorySummary 一致）
  const monthCategorySummary = useMemo(() => {
    const firstDay = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
    const lastDay = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0);
    const f = (d: Date) => formatDateKey(d);

    const monthTasks = tasks.filter(t => t.date >= f(firstDay) && t.date <= f(lastDay));

    const catMap: Record<string, { total: number; completed: number; totalPoints: number; completedPoints: number }> = {};
    monthTasks.forEach(t => {
      const cat = t.categoryId || '其他';
      if (!catMap[cat]) catMap[cat] = { total: 0, completed: 0, totalPoints: 0, completedPoints: 0 };
      const pts = calculateTaskPoints(t);
      catMap[cat].total++;
      if (t.completed) catMap[cat].completed++;
      catMap[cat].totalPoints += pts.totalPoints;
      catMap[cat].completedPoints += pts.completedPoints;
    });

    return Object.entries(catMap).map(([category, stats]) => ({
      category,
      ...stats,
      completionRate: stats.totalPoints > 0 ? Math.round((stats.completedPoints / stats.totalPoints) * 100) : 0,
    }));
  }, [tasks, currentMonth]);

  const goPrev = () => {
    if (viewMode === 'month') {
      setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
    } else {
      const d = new Date(selectedDate);
      d.setDate(d.getDate() - 7);
      setSelectedDate(d);
      setCurrentMonth(new Date(d.getFullYear(), d.getMonth(), 1));
    }
  };

  const goNext = () => {
    if (viewMode === 'month') {
      setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
    } else {
      const d = new Date(selectedDate);
      d.setDate(d.getDate() + 7);
      setSelectedDate(d);
      setCurrentMonth(new Date(d.getFullYear(), d.getMonth(), 1));
    }
  };

  const handleWeekDayClick = (date: Date) => {
    setSelectedDate(date);
  };

  const handleAddTask = (task: { title: string; time: string; categoryId: string; color: string }) => {
    onAddTask(task, formatDateKey(selectedDate));
  };

  const todayKey = formatDateKey(new Date());
  const selectedKey = formatDateKey(selectedDate);

  return (
    <div className="flex flex-col h-full">
      {/* View Toggle */}
      <div className="bg-white px-4 pb-3 pt-1">
        <div className="flex items-center justify-center">
          <div className="inline-flex bg-[var(--bg-primary)] rounded-lg p-0.5">
            <button
              onClick={() => setViewMode('week')}
              className={`px-6 py-1.5 rounded-md text-[14px] font-medium transition-all duration-200 ${
                viewMode === 'week'
                  ? 'bg-[var(--primary-blue)] text-white'
                  : 'text-[var(--text-secondary)]'
              }`}
            >
              周视图
            </button>
            <button
              onClick={() => setViewMode('month')}
              className={`px-6 py-1.5 rounded-md text-[14px] font-medium transition-all duration-200 ${
                viewMode === 'month'
                  ? 'bg-[var(--primary-blue)] text-white'
                  : 'text-[var(--text-secondary)]'
              }`}
            >
              月视图
            </button>
          </div>
        </div>
      </div>

      <div className="content-scrollable">
        {/* Month Navigation */}
        <div className="bg-white px-4 pb-3 flex items-center justify-between">
          <button
            onClick={goPrev}
            className="p-2 -ml-2 active:bg-gray-100 rounded-full transition-colors"
          >
            <ChevronLeft size={20} className="text-[var(--text-secondary)]" />
          </button>
          <span className="text-[18px] font-semibold text-[var(--text-primary)]">
            {currentMonth.getFullYear()}年{currentMonth.getMonth() + 1}月
          </span>
          <button
            onClick={goNext}
            className="p-2 -mr-2 active:bg-gray-100 rounded-full transition-colors"
          >
            <ChevronRight size={20} className="text-[var(--text-secondary)]" />
          </button>
        </div>

        {viewMode === 'month' ? (
          /* Month Calendar Grid */
          <div className="bg-white px-3 pb-4">
            {/* Week headers */}
            <div className="grid grid-cols-7 mb-2">
              {weekDays.map((day) => (
                <div key={day} className="text-center text-[12px] text-[var(--text-tertiary)] py-2">
                  {day}
                </div>
              ))}
            </div>

            {/* Days — 卡片式日格（与 Web 端一致） */}
            <AnimatePresence mode="wait">
              <motion.div
                key={`${currentMonth.getFullYear()}-${currentMonth.getMonth()}`}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }}
                className="grid grid-cols-7 gap-0.5"
              >
                {monthCells.map((cell, idx) => {
                  const cellKey = formatDateKey(cell.fullDate);
                  const isSelected = cellKey === selectedKey;
                  const isToday = cellKey === todayKey;
                  const dayTasks = tasks
                    .filter((t) => t.date === cellKey)
                    .sort((a, b) => {
                      if (a.time && !b.time) return -1;
                      if (!a.time && b.time) return 1;
                      if (!a.time && !b.time) return 0;
                      return a.time.localeCompare(b.time);
                    });
                  const maxShow = 4;
                  const remaining = dayTasks.length - maxShow;

                  return (
                    <motion.div
                      key={idx}
                      whileTap={{ scale: 0.97 }}
                      onClick={() => cell.isCurrentMonth && setSelectedDate(cell.fullDate)}
                      className={`month-day-cell ${
                        isSelected
                          ? 'ring-2 ring-[var(--primary-blue)]'
                          : isToday
                          ? 'border-2 border-[var(--primary-blue)]'
                          : ''
                      } ${!cell.isCurrentMonth ? 'opacity-40' : ''}`}
                    >
                      {/* 日期头：仅数字 */}
                      <div className="mb-0.5">
                        <span
                          className={`text-[11px] font-medium ${
                            isSelected ? 'text-[var(--primary-blue)]' : 'text-[var(--text-primary)]'
                          }`}
                        >
                          {cell.date}
                        </span>
                      </div>

                      {/* 任务列表 */}
                      <div className="flex-1 overflow-y-auto no-scrollbar">
                        {dayTasks.length > 0 ? (
                          <>
                            {dayTasks.slice(0, maxShow).map((task, i) => {
                              let title = task.title;
                              if (task.subtasks && task.subtasks.length > 0) {
                                const done = task.subtasks.filter(st => st.completed).length;
                                title = `[${done}/${task.subtasks.length}] ${task.title}`;
                              }
                              const bgColor = EVENT_BG_COLORS[hashCategoryIndex(task.categoryId || '其他')];
                              return (
                                <div
                                  key={i}
                                  className="compact-event"
                                  style={{ backgroundColor: bgColor }}
                                  title={`${task.time || ''} - ${task.title}`}
                                >
                                  {title}
                                </div>
                              );
                            })}
                            {remaining > 0 && (
                              <div className="text-[10px] text-[var(--primary-blue)] cursor-pointer mt-0.5 pl-1">
                                +{remaining} 更多
                              </div>
                            )}
                          </>
                        ) : (
                          <div className="text-[10px] text-[var(--text-tertiary)] italic flex-1 flex items-center justify-center">
                            无日程
                          </div>
                        )}
                      </div>
                    </motion.div>
                  );
                })}
              </motion.div>
            </AnimatePresence>
          </div>
        ) : (
          /* Week View */
          <div className="bg-white px-3 pb-4">
            <div className="grid grid-cols-7">
              {weekDays.map((day) => (
                <div key={day} className="text-center text-[12px] text-[var(--text-tertiary)] py-2">
                  {day}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {weekDays2.map((date, idx) => {
                const key = formatDateKey(date);
                const isSelected = key === selectedKey;
                const isToday = key === todayKey;
                const dayTasks = tasks.filter((t) => t.date === key);

                return (
                  <motion.div
                    key={idx}
                    whileTap={{ scale: 0.9 }}
                    onClick={() => handleWeekDayClick(date)}
                    className={`flex flex-col items-center justify-center h-14 rounded-xl cursor-pointer relative ${
                      isSelected
                        ? 'bg-[var(--primary-blue)]'
                        : isToday
                        ? 'border-2 border-[var(--primary-blue)]'
                        : 'bg-[var(--bg-primary)]'
                    }`}
                  >
                    <span
                      className={`text-[16px] font-semibold ${
                        isSelected ? 'text-white' : 'text-[var(--text-primary)]'
                      }`}
                    >
                      {date.getDate()}
                    </span>
                    {dayTasks.length > 0 && (
                      <div className="flex items-center gap-[2px] mt-1">
                        {dayTasks.slice(0, 3).map((t, i) => (
                          <div
                            key={i}
                            className="w-1.5 h-1.5 rounded-full"
                            style={{ backgroundColor: colorDotMap[t.color] || '#E8887E' }}
                          />
                        ))}
                      </div>
                    )}
                  </motion.div>
                );
              })}
            </div>
          </div>
        )}

        {/* Month Category Summary — 与 Web 端 renderMonthCategorySummary 一致 */}
        {viewMode === 'month' && monthCategorySummary.length > 0 && (
          <div className="mt-4 px-4">
            <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-3">本月分类汇总</h3>
            <div className="grid grid-cols-2 gap-3">
              {monthCategorySummary.map((cat) => {
                const colorIdx = hashCategoryIndex(cat.category);
                const bgColor = EVENT_BG_COLORS[colorIdx];
                return (
                  <div
                    key={cat.category}
                    className="category-summary-card bg-white border border-gray-100 rounded-xl shadow-sm p-3"
                  >
                    {/* 分类头 */}
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-1.5">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: bgColor }} />
                        <span className="text-xs font-medium text-[var(--text-primary)]">
                          {cat.category}
                        </span>
                      </div>
                      <span className="text-[11px] font-medium text-[var(--text-tertiary)] bg-gray-50 px-1.5 py-0.5 rounded-full">
                        {cat.total}
                      </span>
                    </div>
                    {/* 进度条 */}
                    <div className="flex justify-between text-[10px] text-[var(--text-tertiary)] mb-1">
                      <span>完成率: {cat.completionRate}%</span>
                      <span>{cat.completedPoints}/{cat.totalPoints} 任务点</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-1.5">
                      <div
                        className={`h-1.5 rounded-full transition-all ${
                          cat.completionRate === 100 ? 'bg-[var(--green)]' : 'bg-[var(--primary-blue)]'
                        }`}
                        style={{ width: `${cat.completionRate}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Bottom Sheet - Tasks for selected date */}
        <div className="mt-3 px-4 pb-6">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[14px] text-[var(--text-tertiary)]">
              {selectedDate.getMonth() + 1}月{selectedDate.getDate()}日{' '}
              {weekDays[selectedDate.getDay()]} {' '}
              <span className="ml-1">{selectedTasks.length}项日程</span>
            </span>
            <button
              onClick={() => setShowAddModal(true)}
              className="w-7 h-7 rounded-full bg-[var(--primary-blue)] flex items-center justify-center active:scale-90 transition-transform"
            >
              <Plus size={14} className="text-white" />
            </button>
          </div>
          <div className="space-y-2">
            {selectedTasks.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                onToggle={onToggleTask}
                onToggleSubtask={onToggleSubtask}
              />
            ))}
            {selectedTasks.length === 0 && (
              <div className="flex flex-col items-center py-8 text-[var(--text-tertiary)]">
                <p className="text-[14px]">暂无日程</p>
                <button
                  onClick={() => setShowAddModal(true)}
                  className="mt-2 text-[13px] text-[var(--primary-blue)] active:opacity-70"
                >
                  点击添加
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Add Task Modal */}
      <AddTaskModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onAdd={handleAddTask}
        categories={categories}
        defaultDate={formatDateKey(selectedDate)}
      />
    </div>
  );
}
