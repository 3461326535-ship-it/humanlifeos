import { useState, useMemo, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { App as CapacitorApp } from '@capacitor/app';
import { SketchIcon } from '@/components/icons/SketchIcon';
import { SketchRing } from '@/components/sketch/SketchRing';
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
  onDeleteTask: (id: string, deleteChain?: boolean) => void;
  getCategoryColor: (categoryId: string) => string;
  getCategoryName: (categoryId: string) => string;
}

type FilterType = 'all' | 'completed';

const filters: { key: FilterType; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'completed', label: '已完成' },
];

function formatDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const weekDays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];

const months = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];

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

  const today = useMemo(() => {
    const d = new Date();
    return {
      key: formatDateKey(d),
      dayOfWeek: weekDays[d.getDay()],
      month: months[d.getMonth()],
      dayNum: d.getDate(),
    };
  }, []);

  // ── 监听来自桌面 Widget 的任务点击 ──
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

  // ── Android 手势返回拦截 ──
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

  const todayTasks = useMemo(
    () => tasks.filter((t) => t.date === today.key),
    [tasks, today.key]
  );

  const stats = useMemo(() => {
    const total = todayTasks.length;
    const completed = todayTasks.filter((t) => t.completed).length;
    const pending = total - completed;
    const rate = total > 0 ? Math.round((completed / total) * 100) : 0;
    return { total, completed, pending, rate };
  }, [todayTasks]);

  const sortByTimeline = (taskList: Task[]): Task[] => {
    return [...taskList].sort((a, b) => {
      if (a.time && !b.time) return -1;
      if (!a.time && b.time) return 1;
      if (!a.time && !b.time) return 0;
      return a.time.localeCompare(b.time);
    });
  };

  const filteredTasks = useMemo(() => {
    switch (activeFilter) {
      case 'all':
        return sortByTimeline(todayTasks);
      case 'completed':
        return sortByTimeline(todayTasks.filter((t) => t.completed));
      default:
        return sortByTimeline(todayTasks);
    }
  }, [todayTasks, activeFilter]);

  const emptyMessage = () => {
    if (todayTasks.length === 0) return { title: '今天没有日程', sub: '点击右下角添加新任务' };
    if (activeFilter === 'completed') return { title: '还没有完成的任务', sub: '完成任务后将显示在这里' };
    return { title: '今天没有日程', sub: '点击右下角添加新任务' };
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

  // Compute "Next" card: first uncompleted, timed, non-overdue task
  const nextTask = useMemo(() => {
    const now = new Date();
    const nowTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    return sortByTimeline(
      todayTasks.filter(t => !t.completed && t.time && t.time >= nowTime)
    )[0];
  }, [todayTasks]);

  return (
    <div className="flex flex-col h-full relative">
      {/* Scrollable Content */}
      <div className="content-scrollable px-0 pt-4 pb-24">
        {/* Hero Card */}
        <div className="sketch-hero">
          <div className="sketch-tape" />
          <div className="font-caveat text-[16px] text-[var(--ink-soft)]">
            {today.month}{today.dayNum}日 · {today.dayOfWeek}
          </div>
          <div className="font-head text-[27px] mt-[-2px] flex items-center gap-[6px] text-[var(--ink)]">
            今天
            <SketchIcon name="pen" size={20} strokeWidth={2.2} />
          </div>
          <div className="font-body text-[13px] text-[var(--ink-soft)] mt-[6px] italic">
            "{poem.verse}" — {poem.author}
          </div>
          <div className="flex items-center gap-[14px] mt-[12px]">
            <SketchRing
              percentage={stats.rate}
              size={56}
              strokeColor="var(--red)"
              label={`${stats.rate}%`}
            />
            <div>
              <div className="font-head text-[15px] text-[var(--ink)]">
                {stats.completed} / {stats.total} 已完成
              </div>
              <div className="text-[12px] text-[var(--ink-soft)] mt-[2px]">
                {stats.pending > 0
                  ? `还有 ${stats.pending} 项待办 · 加油 ⚡`
                  : stats.total > 0
                    ? '全部完成，太棒了 🎉'
                    : '今天还没有计划'}
              </div>
            </div>
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="flex gap-[8px] px-[16px] pt-[15px] pb-[4px] overflow-x-auto no-scrollbar">
          {filters.map((f) => (
            <button
              key={f.key}
              onClick={() => setActiveFilter(f.key)}
              className={`sketch-chip ${activeFilter === f.key ? 'on' : ''}`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Next Card */}
        {nextTask && (
          <div className="sketch-card mx-[16px] mt-[8px] p-[13px_15px] bg-[#E7F6F0]">
            <div className="font-caveat text-[14px] text-[var(--teal)] font-bold">
              Next · 接下来
            </div>
            <div className="font-head text-[16px] mt-[2px] text-[var(--ink)]">
              {nextTask.title}
            </div>
            <div className="text-[12px] text-[var(--ink-soft)] mt-[3px]">
              {getCategoryName(nextTask.categoryId)} · {nextTask.time || '全天'} · 还没做
            </div>
          </div>
        )}

        {/* Task List or Empty State */}
        <div className="px-[16px] pt-[14px] flex flex-col gap-[12px]">
          <AnimatePresence mode="wait">
            {filteredTasks.length === 0 ? (
              <motion.div
                key="empty"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="flex flex-col items-center justify-center py-16"
              >
                <SketchIcon name="calendar" size={64} strokeWidth={1.5} className="text-[var(--icon-gray)] mb-4 opacity-40" />
                <p className="font-head text-[15px] text-[var(--ink-soft)]">
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
                className="flex flex-col gap-[12px]"
              >
                {filteredTasks.map((task, idx) => (
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
                    rot={idx}
                  />
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
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
            onDelete={(id, deleteChain) => {
              onDeleteTask(id, deleteChain);
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
