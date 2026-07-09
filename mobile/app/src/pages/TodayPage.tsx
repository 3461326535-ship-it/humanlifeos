import { useState, useMemo, useEffect, useRef } from 'react';
import { Calendar } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { App as CapacitorApp } from '@capacitor/app';
import TaskCard from '@/components/TaskCard';
import AddTaskModal from '@/components/AddTaskModal';
import EditTaskModal from '@/components/EditTaskModal';
import TaskDetailPage from '@/pages/TaskDetailPage';
import DraggableFAB from '@/components/DraggableFAB';
import type { Task, Category } from '@/types';

// 时间主题诗句库：按年积日选一句，每日一换
const poems: { verse: string; author: string }[] = [
  { verse: '莫等闲，白了少年头', author: '岳飞' },
  { verse: '盛年不重来，一日难再晨', author: '陶渊明' },
  { verse: '劝君惜取少年时', author: '杜秋娘' },
  { verse: '少壮不努力，老大徒伤悲', author: '汉乐府' },
  { verse: '一寸光阴一寸金', author: '王贞白' },
  { verse: '逝者如斯夫，不舍昼夜', author: '孔子' },
  { verse: '花开堪折直须折', author: '杜秋娘' },
  { verse: '及时当勉励，岁月不待人', author: '陶渊明' },
  { verse: '人生如白驹过隙', author: '庄子' },
  { verse: '年年岁岁花相似', author: '刘希夷' },
  { verse: '红了樱桃，绿了芭蕉', author: '蒋捷' },
  { verse: '日月既往，不可复追', author: '曾国藩' },
  { verse: '一寸光阴不可轻', author: '朱熹' },
  { verse: '落日江不尽，此日更须忙', author: '陈师道' },
  { verse: '少年易老学难成', author: '朱熹' },
  { verse: '志士惜日，圣人惜时', author: '魏源' },
  { verse: '天波易谢，寸暑难留', author: '王勃' },
  { verse: '白日莫闲过，青春不再来', author: '林宽' },
  { verse: '读书不觉已春深', author: '王贞白' },
  { verse: '韶华不为少年留', author: '秦观' },
  { verse: '朝如青丝暮成雪', author: '李白' },
  { verse: '青春须早为，岂能长少年', author: '孟郊' },
  { verse: '对酒当歌，人生几何', author: '曹操' },
  { verse: '譬如朝露，去日苦多', author: '曹操' },
  { verse: '岁月不居，时节如流', author: '孔融' },
  { verse: '春宵一刻值千金', author: '苏轼' },
  { verse: '一年好景君须记', author: '苏轼' },
  { verse: '最是橙黄橘绿时', author: '苏轼' },
  { verse: '一万年太久，只争朝夕', author: '毛泽东' },
  { verse: '明日复明日，明日何其多', author: '文嘉' },
  { verse: '我生待明日，万事成蹉跎', author: '文嘉' },
  { verse: '朝看水东流，暮看日西坠', author: '文嘉' },
  { verse: '闲云潭影日悠悠', author: '王勃' },
  { verse: '物换星移几度秋', author: '王勃' },
  { verse: '光阴者，百代之过客', author: '李白' },
  { verse: '今人不见古时月', author: '李白' },
  { verse: '今月曾经照古人', author: '李白' },
  { verse: '无边落木萧萧下', author: '杜甫' },
  { verse: '不尽长江滚滚来', author: '杜甫' },
  { verse: '千古兴亡多少事，悠悠', author: '辛弃疾' },
  { verse: '春花秋月何时了', author: '李煜' },
  { verse: '往事知多少', author: '李煜' },
  { verse: '老骥伏枥，志在千里', author: '曹操' },
  { verse: '烈士暮年，壮心不已', author: '曹操' },
  { verse: '业精于勤，荒于嬉', author: '韩愈' },
  { verse: '行成于思，毁于随', author: '韩愈' },
  { verse: '沉舟侧畔千帆过', author: '刘禹锡' },
  { verse: '病树前头万木春', author: '刘禹锡' },
  { verse: '千淘万漉虽辛苦', author: '刘禹锡' },
  { verse: '吹尽狂沙始到金', author: '刘禹锡' },
];

/** 按当天在一年中的序号选一句诗（同一天始终同一句） */
function todayPoem(): { verse: string; author: string } {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 1);
  const dayOfYear = Math.floor((now.getTime() - start.getTime()) / 86400000);
  return poems[dayOfYear % poems.length];
}

interface TodayPageProps {
  tasks: Task[];
  categories: Category[];
  onAddTask: (task: {
    title: string;
    time: string;
    categoryId: string;
    color: string;
    description?: string;
    recurrence?: string | null;
    recurrenceEndDate?: string;
    subtasks?: { title: string; completed: boolean }[];
  }, date: string) => void;
  onUpdateTask: (taskId: string, updates: {
    title?: string;
    time?: string;
    categoryId?: string;
    color?: string;
    description?: string;
    recurrence?: string | null;
    recurrenceEndDate?: string;
    subtasks?: { title: string; completed: boolean }[];
  }) => void;
  onToggleTask: (id: string) => void;
  onToggleSubtask: (taskId: string, subtaskId: string) => void;
  onDeleteTask: (id: string) => void;
  getCategoryColor: (categoryId: string) => string;
  getCategoryName: (categoryId: string) => string;
}

type FilterType = 'all' | 'upcoming' | 'overdue' | 'completed';

const filters: { key: FilterType; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'upcoming', label: '即将' },
  { key: 'overdue', label: '逾期' },
  { key: 'completed', label: '已完成' },
];

function formatDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const weekDays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];

export default function TodayPage({
  tasks,
  categories,
  onAddTask,
  onUpdateTask,
  onToggleTask,
  onToggleSubtask,
  onDeleteTask,
  getCategoryColor,
  getCategoryName,
}: TodayPageProps) {
  const [activeFilter, setActiveFilter] = useState<FilterType>('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [editingTask, setEditingTask] = useState<Task | null>(null);

  // Today's date (stable for session lifetime)
  const today = useMemo(() => {
    const d = new Date();
    return {
      key: formatDateKey(d),
      dayOfWeek: weekDays[d.getDay()],
    };
  }, []);

  // ── 监听来自桌面 Widget 的任务点击（通过 App.tsx 转发的 open-task 事件）──
  useEffect(() => {
    const handler = (e: Event) => {
      const taskId = (e as CustomEvent).detail as string;
      if (!taskId) return;
      const target = tasks.find(t => t.id === taskId);
      if (target) {
        setSelectedTask(target);
      }
    };
    window.addEventListener('open-task', handler);
    return () => window.removeEventListener('open-task', handler);
  }, [tasks]);

  // ── Android 手势返回拦截：有浮层时关浮层，不退出 App ──
  const overlayRef = useRef({ selectedTask, showAddModal, editingTask });
  overlayRef.current = { selectedTask, showAddModal, editingTask };

  useEffect(() => {
    let handle: { remove: () => void } | null = null;

    (async () => {
      handle = await CapacitorApp.addListener('backButton', () => {
        const s = overlayRef.current;
        if (s.editingTask) {
          setEditingTask(null);
        } else if (s.showAddModal) {
          setShowAddModal(false);
        } else if (s.selectedTask) {
          setSelectedTask(null);
        } else {
          CapacitorApp.exitApp();
        }
      });
    })();

    return () => { handle?.remove(); };
  }, []);

  // Tasks for today
  const todayTasks = useMemo(
    () => tasks.filter((t) => t.date === today.key),
    [tasks, today.key]
  );

  // Stats
  const stats = useMemo(() => {
    const total = todayTasks.length;
    const completed = todayTasks.filter((t) => t.completed).length;
    const pending = total - completed;
    const rate = total > 0 ? Math.round((completed / total) * 100) : 0;
    return { total, completed, pending, rate };
  }, [todayTasks]);

  // 按时间线排序：有时间 → 按时间升序；无时间 → 排到最后
  const sortByTimeline = (taskList: Task[]): Task[] => {
    return [...taskList].sort((a, b) => {
      // 有时间排前，无时间排后
      if (a.time && !b.time) return -1;
      if (!a.time && b.time) return 1;
      if (!a.time && !b.time) return 0;
      // 都有时间则按时间升序
      return a.time.localeCompare(b.time);
    });
  };

  // Filtered tasks
  const filteredTasks = useMemo(() => {
    const now = new Date();
    const nowTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    let result: Task[];
    switch (activeFilter) {
      case 'all':
        result = todayTasks;
        break;
      case 'upcoming':
        result = todayTasks.filter(
          (t) => !t.completed && (t.time === '' || t.time >= nowTime)
        );
        break;
      case 'overdue':
        result = todayTasks.filter(
          (t) => !t.completed && t.time !== '' && t.time < nowTime
        );
        break;
      case 'completed':
        result = todayTasks.filter((t) => t.completed);
        break;
      default:
        result = todayTasks;
    }
    // 按时间线排序，让任务看起来像一天的时间轴
    return sortByTimeline(result);
  }, [todayTasks, activeFilter]);

  const emptyMessage = () => {
    if (todayTasks.length === 0) return { title: '今天没有日程', sub: '点击右下角添加新任务' };
    switch (activeFilter) {
      case 'all': return { title: '今天没有日程', sub: '点击右下角添加新任务' };
      case 'upcoming': return { title: '没有即将开始的任务', sub: '全部任务已过期或已完成' };
      case 'overdue': return { title: '没有逾期的任务', sub: '所有任务都已按时完成' };
      case 'completed': return { title: '还没有完成的任务', sub: '完成任务后将显示在这里' };
    }
  };

  const handleAddTask = (task: {
    title: string;
    time: string;
    categoryId: string;
    color: string;
    description?: string;
    recurrence?: string | null;
    recurrenceEndDate?: string;
    subtasks?: { title: string; completed: boolean }[];
  }) => {
    onAddTask(task, today.key);
  };

  const empty = emptyMessage();
  const poem = todayPoem();

  return (
    <div className="flex flex-col h-full relative">
      {/* Scrollable Content */}
      <div className="content-scrollable px-4 pt-5 pb-24">
        {/* Header */}
        <div className="flex items-end justify-between mb-5">
          <div>
            <h1 className="text-[28px] font-bold text-[var(--text-primary)] tracking-tight">
              今天
            </h1>
            <p className="text-[15px] text-[var(--text-tertiary)] mt-0.5">
              {today.dayOfWeek}
            </p>
          </div>
          <div className="text-right pb-0.5">
            <p className="text-[14px] text-[var(--text-tertiary)] leading-relaxed italic"
               style={{ fontFamily: "'STKaiti', 'KaiTi', 'Noto Serif SC', serif" }}>
              {poem.verse}
            </p>
            <p className="text-[11px] text-[var(--text-tertiary)]/60 mt-0.5">
              — {poem.author}
            </p>
          </div>
        </div>

        {/* Stats Card */}
        <motion.div
          layout
          className="bg-white rounded-2xl card-shadow px-4 py-3 mb-4"
        >
          <p className="text-[12px] text-[var(--text-tertiary)] text-center mb-0.5">
            今日完成度
          </p>
          <div className="text-center">
            <span className="text-[40px] font-bold text-[var(--text-primary)] leading-none">
              {stats.rate}%
            </span>
          </div>
          <p className="text-[12px] text-[var(--text-tertiary)] text-center mb-3">
            {stats.completed}/{stats.total} 任务点
          </p>

          {/* 3-column stats row */}
          <div className="flex items-center justify-between border-t border-[var(--divider)] pt-3">
            <div className="flex-1 text-center">
              <p className="text-[20px] font-bold text-[var(--text-primary)]">
                {stats.total}
              </p>
              <p className="text-[11px] text-[var(--text-tertiary)]">总日程</p>
            </div>
            <div className="flex-1 text-center">
              <p className="text-[20px] font-bold text-[var(--green)]">
                {stats.completed}
              </p>
              <p className="text-[11px] text-[var(--text-tertiary)]">已完成</p>
            </div>
            <div className="flex-1 text-center">
              <p className="text-[20px] font-bold text-[#FF9500]">
                {stats.pending}
              </p>
              <p className="text-[11px] text-[var(--text-tertiary)]">待完成</p>
            </div>
          </div>
        </motion.div>

        {/* Filter Tabs */}
        <div className="flex gap-2 mb-4 overflow-x-auto no-scrollbar">
          {filters.map((f) => (
            <button
              key={f.key}
              onClick={() => setActiveFilter(f.key)}
              className={`shrink-0 px-4 py-1.5 rounded-full text-[13px] font-medium transition-all duration-200 ${
                activeFilter === f.key
                  ? 'bg-[var(--primary-blue)] text-white'
                  : 'bg-white text-[var(--text-secondary)] border border-[var(--divider)]'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Task List or Empty State */}
        <AnimatePresence mode="wait">
          {filteredTasks.length === 0 ? (
            <motion.div
              key="empty"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="flex flex-col items-center justify-center py-16"
            >
              <Calendar
                size={64}
                strokeWidth={1}
                className="text-[var(--icon-gray)] mb-4 opacity-40"
              />
              <p className="text-[15px] text-[var(--text-secondary)] font-medium">
                {empty.title}
              </p>
              <p className="text-[13px] text-[var(--text-tertiary)] mt-1">
                {empty.sub}
              </p>
            </motion.div>
          ) : (
            <motion.div
              key="list"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="space-y-2"
            >
              {filteredTasks.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  onToggle={onToggleTask}
                  onToggleSubtask={onToggleSubtask}
                  categoryColor={getCategoryColor(task.categoryId)}
                  categoryName={getCategoryName(task.categoryId)}
                  onPress={(t) => setSelectedTask(t)}
                  onLongPress={(t) => setEditingTask(t)}
                  onDelete={(t) => {
                    if (confirm(`确定删除「${t.title}」？`)) {
                      onDeleteTask(t.id);
                    }
                  }}
                />
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* FAB */}
      <DraggableFAB onClick={() => setShowAddModal(true)} />

      {/* Add Task Modal */}
      <AddTaskModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onAdd={handleAddTask}
        categories={categories}
        defaultDate={today.key}
      />

      {/* Task Detail Page (overlay) */}
      <AnimatePresence>
        {selectedTask && (
          <TaskDetailPage
            key={selectedTask.id}
            task={selectedTask}
            categoryColor={getCategoryColor(selectedTask.categoryId)}
            categoryName={getCategoryName(selectedTask.categoryId)}
            onBack={() => setSelectedTask(null)}
            onToggle={onToggleTask}
            onDelete={(id) => {
              onDeleteTask(id);
              setSelectedTask(null);
            }}
            onEdit={(task) => {
              setEditingTask(task);
            }}
          />
        )}
      </AnimatePresence>

      {/* Edit Task Modal */}
      <EditTaskModal
        isOpen={!!editingTask}
        onClose={() => setEditingTask(null)}
        onSave={(taskId, updates) => {
          onUpdateTask(taskId, updates);
          if (selectedTask && selectedTask.id === taskId) {
            setSelectedTask({
              ...selectedTask,
              title: updates.title ?? selectedTask.title,
              time: updates.time ?? selectedTask.time,
              categoryId: updates.categoryId ?? selectedTask.categoryId,
              color: (updates.color as Task['color']) ?? selectedTask.color,
              description: updates.description !== undefined ? updates.description : selectedTask.description,
              recurrence: updates.recurrence !== undefined ? (updates.recurrence as Task['recurrence']) : selectedTask.recurrence,
              recurrenceEndDate: updates.recurrenceEndDate !== undefined ? updates.recurrenceEndDate : selectedTask.recurrenceEndDate,
            });
          }
          setEditingTask(null);
        }}
        task={editingTask}
        categories={categories}
      />
    </div>
  );
}
