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

            {/* Days */}
            <AnimatePresence mode="wait">
              <motion.div
                key={`${currentMonth.getFullYear()}-${currentMonth.getMonth()}`}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }}
                className="grid grid-cols-7 gap-y-1"
              >
                {monthCells.map((cell, idx) => {
                  const cellKey = formatDateKey(cell.fullDate);
                  const isSelected = cellKey === selectedKey;
                  const isToday = cellKey === todayKey;
                  const dayTasks = tasks.filter((t) => t.date === cellKey);

                  return (
                    <motion.div
                      key={idx}
                      whileTap={{ scale: 0.9 }}
                      onClick={() => cell.isCurrentMonth && setSelectedDate(cell.fullDate)}
                      className={`flex flex-col items-center justify-center h-10 rounded-full cursor-pointer relative ${
                        isSelected
                          ? 'bg-[var(--primary-blue)]'
                          : isToday
                          ? 'border-2 border-[var(--primary-blue)]'
                          : ''
                      } ${!cell.isCurrentMonth ? 'opacity-30' : ''}`}
                    >
                      <span
                        className={`text-[14px] font-medium ${
                          isSelected ? 'text-white' : 'text-[var(--text-primary)]'
                        }`}
                      >
                        {cell.date}
                      </span>
                      {dayTasks.length > 0 && (
                        <div className="flex items-center gap-[2px] mt-[1px]">
                          {dayTasks.slice(0, 3).map((t, i) => (
                            <div
                              key={i}
                              className="w-1 h-1 rounded-full"
                              style={{ backgroundColor: colorDotMap[t.color] || '#E8887E' }}
                            />
                          ))}
                        </div>
                      )}
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
