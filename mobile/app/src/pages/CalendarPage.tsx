import { useState, useMemo } from 'react';
import { SketchIcon } from '@/components/icons/SketchIcon';
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

const EVENT_BG_COLORS = [
  'rgba(95,184,232,0.20)',
  'rgba(181,139,224,0.20)',
  'rgba(244,116,107,0.20)',
  'rgba(255,201,60,0.20)',
  'rgba(140,193,82,0.20)',
  'rgba(57,192,166,0.20)',
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
  blue: '#5FB8E8',
  green: '#8CC152',
  red: '#F4746B',
  purple: '#B58BE0',
  yellow: '#FFC93C',
  gray: '#C9BEA3',
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
    cells.push({ date: i, isCurrentMonth: true, fullDate: new Date(year, month, i) });
  }

  const remaining = (7 - (cells.length % 7)) % 7;
  for (let i = 1; i <= remaining; i++) {
    cells.push({ date: i, isCurrentMonth: false, fullDate: new Date(year, month + 1, i) });
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

  const selectedTasks = tasks
    .filter((t) => t.date === formatDateKey(selectedDate))
    .sort((a, b) => {
      if (a.time && !b.time) return -1;
      if (!a.time && b.time) return 1;
      if (!a.time && !b.time) return 0;
      return a.time.localeCompare(b.time);
    });

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
      {/* Section Head */}
      <div className="sketch-section-head">
        <h2 className="sketch-underline sketch-underline-yellow">视图</h2>
        <p className="text-[12px] text-[var(--ink-soft)] mt-[7px] font-caveat">
          {currentMonth.getFullYear()}年{currentMonth.getMonth() + 1}月 · {new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0).getDate()}天
        </p>
      </div>

      {/* View Toggle */}
      <div className="px-4 pb-3 pt-1">
        <div className="flex gap-[8px]">
          <button
            onClick={() => setViewMode('week')}
            className={`sketch-chip ${viewMode === 'week' ? 'on' : ''}`}
          >
            周视图
          </button>
          <button
            onClick={() => setViewMode('month')}
            className={`sketch-chip ${viewMode === 'month' ? 'on' : ''}`}
          >
            月视图
          </button>
        </div>
      </div>

      <div className="content-scrollable">
        {/* Month Navigation */}
        <div className="px-4 pb-3 flex items-center justify-between">
          <button onClick={goPrev} className="p-2 active:opacity-60 transition-opacity">
            <SketchIcon name="chevron-left" size={20} strokeWidth={2.5} className="text-[var(--ink-soft)]" />
          </button>
          <span className="font-head text-[18px] text-[var(--ink)]">
            {currentMonth.getFullYear()}年{currentMonth.getMonth() + 1}月
          </span>
          <button onClick={goNext} className="p-2 active:opacity-60 transition-opacity">
            <SketchIcon name="chevron-right" size={20} strokeWidth={2.5} className="text-[var(--ink-soft)]" />
          </button>
        </div>

        {viewMode === 'month' ? (
          /* Month Calendar Grid */
          <div className="sketch-calwrap sketch-card mx-[16px]">
            <div className="grid grid-cols-7 mb-1">
              {weekDays.map((day) => (
                <div key={day} className="text-center text-[11px] text-[var(--ink-soft)] py-2 font-head">
                  {day}
                </div>
              ))}
            </div>

            <AnimatePresence mode="wait">
              <motion.div
                key={`${currentMonth.getFullYear()}-${currentMonth.getMonth()}`}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }}
                className="grid grid-cols-7 gap-[2px]"
              >
                {monthCells.map((cell, idx) => {
                  const cellKey = formatDateKey(cell.fullDate);
                  const isSelected = cellKey === selectedKey;
                  const isToday = cellKey === todayKey;
                  const dayTasks = tasks.filter((t) => t.date === cellKey)
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
                        isSelected ? 'ring-2 ring-[var(--red)]' : ''
                      } ${!cell.isCurrentMonth ? 'opacity-40' : ''}`}
                      style={
                        isToday && !isSelected
                          ? { border: '2px solid var(--red)' }
                          : undefined
                      }
                    >
                      <div className="mb-0.5">
                        <span
                          className={`font-caveat text-[14px] ${
                            isSelected ? 'text-[var(--red)]' : isToday ? 'text-[var(--red)]' : 'text-[var(--ink)]'
                          } ${!cell.isCurrentMonth ? 'opacity-30' : ''}`}
                        >
                          {cell.date}
                        </span>
                      </div>

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
                              <div className="text-[10px] text-[var(--red)] cursor-pointer mt-0.5 pl-1 font-head">
                                +{remaining} 更多
                              </div>
                            )}
                          </>
                        ) : (
                          <div className="text-[10px] text-[var(--ink-soft)] italic flex-1 flex items-center justify-center">
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
          <div className="px-3 pb-4">
            <div className="grid grid-cols-7">
              {weekDays.map((day) => (
                <div key={day} className="text-center text-[12px] text-[var(--ink-soft)] py-2 font-head">
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
                    className={`flex flex-col items-center justify-center h-14 rounded-xl cursor-pointer relative sketch-wobble-sm ${
                      isSelected
                        ? 'bg-[var(--red)]'
                        : isToday
                        ? 'border-2 border-[var(--red)]'
                        : 'bg-[var(--bg-card)]'
                    }`}
                  >
                    <span
                      className={`font-head text-[16px] ${
                        isSelected ? 'text-white' : 'text-[var(--ink)]'
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
                            style={{ backgroundColor: colorDotMap[t.color] || '#F4746B' }}
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

        {/* Month Category Summary */}
        {viewMode === 'month' && monthCategorySummary.length > 0 && (
          <div className="px-[16px] pt-[14px] flex flex-col gap-[11px]">
            {monthCategorySummary.map((cat) => {
              const colorIdx = hashCategoryIndex(cat.category);
              const bgColor = EVENT_BG_COLORS[colorIdx];
              return (
                <div key={cat.category} className="sketch-card p-[12px_14px]">
                  <div className="flex justify-between font-head text-[14px] text-[var(--ink)]">
                    <span>{cat.category}</span>
                    <span className="font-caveat text-[16px] text-[var(--ink-soft)]">{cat.completionRate}%</span>
                  </div>
                  <div className="sketch-bar">
                    <span
                      className="sketch-bar-fill"
                      style={{ width: `${cat.completionRate}%`, backgroundColor: bgColor }}
                    />
                  </div>
                  <div className="flex justify-between text-[10px] text-[var(--ink-soft)] mt-1">
                    <span>{cat.completedPoints}/{cat.totalPoints} 任务点</span>
                    <span>{cat.total}项</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Bottom Sheet - Tasks for selected date */}
        <div className="mt-3 px-4 pb-6">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[14px] text-[var(--ink-soft)] font-caveat">
              {selectedDate.getMonth() + 1}月{selectedDate.getDate()}日{' '}
              {weekDays[selectedDate.getDay()]} · {selectedTasks.length}项日程
            </span>
            <button
              onClick={() => setShowAddModal(true)}
              className="w-7 h-7 rounded-full bg-[var(--red)] flex items-center justify-center active:scale-90 transition-transform sketch-wobble-sm border-2 border-[var(--ink)]"
            >
              <SketchIcon name="plus" size={14} strokeWidth={3} className="text-white" stroke="white" />
            </button>
          </div>
          <div className="space-y-2">
            {selectedTasks.map((task, idx) => (
              <TaskCard
                key={task.id}
                task={task}
                onToggle={onToggleTask}
                onToggleSubtask={onToggleSubtask}
                rot={idx}
              />
            ))}
            {selectedTasks.length === 0 && (
              <div className="flex flex-col items-center py-8 text-[var(--ink-soft)]">
                <p className="font-head text-[14px]">暂无日程</p>
                <button
                  onClick={() => setShowAddModal(true)}
                  className="mt-2 text-[13px] text-[var(--red)] active:opacity-70 font-head"
                >
                  点击添加
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

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
