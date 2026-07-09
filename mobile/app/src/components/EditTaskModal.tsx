import { useState, useEffect } from 'react';
import { X, Repeat } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Task, Category } from '@/types';

interface EditTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (taskId: string, updates: {
    title?: string;
    time?: string;
    categoryId?: string;
    color?: string;
    description?: string;
    recurrence?: string | null;
    recurrenceEndDate?: string;
    subtasks?: { title: string; completed: boolean }[];
  }) => void;
  task: Task | null;
  categories: Category[];
}

const colorOptions = [
  { value: 'blue', label: '红' },
  { value: 'green', label: '绿' },
  { value: 'red', label: '红' },
  { value: 'purple', label: '紫' },
  { value: 'yellow', label: '黄' },
  { value: 'gray', label: '灰' },
];

const recurrenceOptions = [
  { value: '', label: '不重复' },
  { value: 'daily', label: '每天' },
  { value: 'weekly', label: '每周' },
  { value: 'monthly', label: '每月' },
  { value: 'yearly', label: '每年' },
];

export default function EditTaskModal({
  isOpen,
  onClose,
  onSave,
  task,
  categories,
}: EditTaskModalProps) {
  const [title, setTitle] = useState('');
  const [time, setTime] = useState('14:00');
  const [categoryId, setCategoryId] = useState('');
  const [color, setColor] = useState('blue');
  const [description, setDescription] = useState('');
  const [recurrence, setRecurrence] = useState('');
  const [recurrenceEndDate, setRecurrenceEndDate] = useState('');
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');
  const [subtasks, setSubtasks] = useState<{ title: string; completed: boolean }[]>([]);

  const colorMap: Record<string, string> = {
    blue: '#E8887E',  // macaron coral red
    green: '#34C759',
    red: '#FF3B30',
    purple: '#AF52DE',
    yellow: '#FFCC00',
    gray: '#8E8E93',
  };

  // Pre-fill when task changes
  useEffect(() => {
    if (task) {
      setTitle(task.title);
      setTime(task.time);
      setCategoryId(task.categoryId);
      setColor(task.color);
      setDescription(task.description || '');
      setRecurrence(task.recurrence || '');
      setRecurrenceEndDate(task.recurrenceEndDate || '');
      setSubtasks((task.subtasks || []).map(st => ({ title: st.title, completed: st.completed })));
    }
  }, [task]);

  const handleSubmit = () => {
    if (!title.trim() || !task) return;
    onSave(task.id, {
      title: title.trim(),
      time,
      categoryId,
      color,
      description: description.trim(),
      recurrence: recurrence || null,
      recurrenceEndDate: recurrenceEndDate || undefined,
      subtasks,
    });
    onClose();
  };

  const addSubtask = () => {
    if (!newSubtaskTitle.trim()) return;
    setSubtasks(prev => [...prev, { title: newSubtaskTitle.trim(), completed: false }]);
    setNewSubtaskTitle('');
  };

  const removeSubtask = (idx: number) => {
    setSubtasks(prev => prev.filter((_, i) => i !== idx));
  };

  if (!task) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/40 z-[60]"
          />
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed bottom-0 left-0 right-0 bg-[var(--bg-primary)] rounded-t-2xl z-[70] max-h-[85vh] overflow-y-auto"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--divider)] sticky top-0 bg-[var(--bg-primary)]">
              <h2 className="text-[17px] font-semibold text-[var(--text-primary)]">编辑任务</h2>
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center active:scale-95 transition-transform"
              >
                <X size={18} className="text-[var(--text-secondary)]" />
              </button>
            </div>

            <div className="px-4 py-4 space-y-4">
              {/* Task Title */}
              <div>
                <label className="text-[13px] text-[var(--text-tertiary)] mb-1.5 block">
                  任务名称
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="输入任务名称"
                  className="w-full h-11 px-3 rounded-lg bg-white border border-[var(--divider)] text-[15px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none focus:border-[var(--primary-blue)] transition-colors"
                />
              </div>

              {/* Description */}
              <div>
                <label className="text-[13px] text-[var(--text-tertiary)] mb-1.5 block">
                  描述
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="添加任务描述（可选）"
                  rows={2}
                  className="w-full px-3 py-2 rounded-lg bg-white border border-[var(--divider)] text-[14px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none focus:border-[var(--primary-blue)] transition-colors resize-none"
                />
              </div>

              {/* Time */}
              <div>
                <label className="text-[13px] text-[var(--text-tertiary)] mb-1.5 block">
                  时间
                </label>
                <input
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  className="w-full h-11 px-3 rounded-lg bg-white border border-[var(--divider)] text-[15px] text-[var(--text-primary)] outline-none focus:border-[var(--primary-blue)] transition-colors"
                />
              </div>

              {/* Category */}
              <div>
                <label className="text-[13px] text-[var(--text-tertiary)] mb-1.5 block">
                  分类
                </label>
                <div className="flex flex-wrap gap-2">
                  {categories.map((cat) => (
                    <button
                      key={cat.id}
                      onClick={() => setCategoryId(cat.id)}
                      className={`px-3 py-1.5 rounded-full text-[13px] font-medium transition-all ${
                        categoryId === cat.id
                          ? 'text-white'
                          : 'bg-white text-[var(--text-secondary)] border border-[var(--divider)]'
                      }`}
                      style={
                        categoryId === cat.id
                          ? { backgroundColor: cat.color }
                          : undefined
                      }
                    >
                      {cat.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Recurrence */}
              <div>
                <label className="text-[13px] text-[var(--text-tertiary)] mb-1.5 flex items-center gap-1">
                  <Repeat size={13} />
                  重复
                </label>
                <div className="flex flex-wrap gap-2 mb-2">
                  {recurrenceOptions.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setRecurrence(opt.value)}
                      className={`px-3 py-1.5 rounded-full text-[13px] font-medium transition-all ${
                        recurrence === opt.value
                          ? 'bg-[var(--primary-blue)] text-white'
                          : 'bg-white text-[var(--text-secondary)] border border-[var(--divider)]'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                {recurrence && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="pl-1"
                  >
                    <label className="text-[12px] text-[var(--text-tertiary)] mb-1 block">
                      结束日期（可选，留空则无限重复）
                    </label>
                    <input
                      type="date"
                      value={recurrenceEndDate}
                      onChange={(e) => setRecurrenceEndDate(e.target.value)}
                      className="w-full h-10 px-3 rounded-lg bg-white border border-[var(--divider)] text-[14px] text-[var(--text-primary)] outline-none focus:border-[var(--primary-blue)] transition-colors"
                    />
                  </motion.div>
                )}
              </div>

              {/* Subtasks */}
              <div>
                <label className="text-[13px] text-[var(--text-tertiary)] mb-1.5 block">
                  子任务
                </label>
                {subtasks.length > 0 && (
                  <div className="space-y-2 mb-2">
                    {subtasks.map((st, idx) => (
                      <div key={idx} className="flex items-center gap-2 bg-white rounded-lg px-3 py-2 border border-[var(--divider)]">
                        <span className={`flex-1 text-[14px] ${st.completed ? 'line-through text-[var(--text-tertiary)]' : 'text-[var(--text-primary)]'}`}>
                          {st.title}
                        </span>
                        <button
                          onClick={() => removeSubtask(idx)}
                          className="text-[var(--red)] text-[12px] px-2 py-0.5 active:scale-90"
                        >
                          删除
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newSubtaskTitle}
                    onChange={(e) => setNewSubtaskTitle(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && addSubtask()}
                    placeholder="添加子任务"
                    className="flex-1 h-10 px-3 rounded-lg bg-white border border-[var(--divider)] text-[14px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none focus:border-[var(--primary-blue)] transition-colors"
                  />
                  <button
                    onClick={addSubtask}
                    disabled={!newSubtaskTitle.trim()}
                    className="px-3 h-10 rounded-lg bg-[var(--primary-blue)] text-white text-[13px] font-medium disabled:opacity-40 active:scale-95 transition-all"
                  >
                    添加
                  </button>
                </div>
              </div>

              {/* Color */}
              <div>
                <label className="text-[13px] text-[var(--text-tertiary)] mb-1.5 block">
                  标记颜色
                </label>
                <div className="flex gap-3">
                  {colorOptions.map((c) => (
                    <button
                      key={c.value}
                      onClick={() => setColor(c.value)}
                      className={`w-8 h-8 rounded-full flex items-center justify-center text-[10px] text-white font-medium transition-all active:scale-90 ${
                        color === c.value ? 'ring-2 ring-offset-2 ring-[var(--primary-blue)]' : ''
                      }`}
                      style={{ backgroundColor: colorMap[c.value] }}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Submit */}
              <button
                onClick={handleSubmit}
                disabled={!title.trim()}
                className="w-full h-12 rounded-xl bg-[var(--primary-blue)] text-white text-[16px] font-semibold disabled:opacity-40 active:scale-[0.98] transition-all"
              >
                保存
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
