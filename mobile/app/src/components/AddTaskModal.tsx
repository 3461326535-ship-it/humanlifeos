import { useState } from 'react';
import { SketchIcon } from '@/components/icons/SketchIcon';
import { motion, AnimatePresence } from 'framer-motion';
import type { Category } from '@/types';

interface AddTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (task: {
    title: string;
    time: string;
    categoryId: string;
    color: string;
    description?: string;
    recurrence?: string | null;
    recurrenceEndDate?: string;
    subtasks?: { title: string; completed: boolean }[];
  }) => void;
  categories: Category[];
  defaultDate: string;
}

const colorOptions = [
  { value: 'blue', label: '蓝' },
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

export default function AddTaskModal({
  isOpen,
  onClose,
  onAdd,
  categories,
}: AddTaskModalProps) {
  const [title, setTitle] = useState('');
  const [time, setTime] = useState('14:00');
  const [categoryId, setCategoryId] = useState(categories[0]?.id || '');
  const [color, setColor] = useState('blue');
  const [description, setDescription] = useState('');
  const [recurrence, setRecurrence] = useState('');
  const [recurrenceEndDate, setRecurrenceEndDate] = useState('');
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');
  const [subtasks, setSubtasks] = useState<{ title: string; completed: boolean }[]>([]);

  const colorMap: Record<string, string> = {
    blue: '#5FB8E8',   // sky
    green: '#8CC152',
    red: '#F4746B',
    purple: '#B58BE0',
    yellow: '#FFC93C',
    gray: '#C9BEA3',
  };

  const addSubtask = () => {
    if (!newSubtaskTitle.trim()) return;
    setSubtasks(prev => [...prev, { title: newSubtaskTitle.trim(), completed: false }]);
    setNewSubtaskTitle('');
  };

  const removeSubtask = (idx: number) => {
    setSubtasks(prev => prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = () => {
    if (!title.trim()) return;
    onAdd({
      title: title.trim(),
      time,
      categoryId,
      color,
      description: description.trim() || undefined,
      recurrence: recurrence || null,
      recurrenceEndDate: recurrenceEndDate || undefined,
      subtasks: subtasks.length > 0 ? subtasks : undefined,
    });
    setTitle('');
    setTime('14:00');
    setCategoryId(categories[0]?.id || '');
    setColor('blue');
    setDescription('');
    setRecurrence('');
    setRecurrenceEndDate('');
    setSubtasks([]);
    setNewSubtaskTitle('');
    onClose();
  };

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
            className="fixed bottom-0 left-0 right-0 bg-[var(--bg-card)] rounded-t-2xl z-[70] max-h-[85vh] overflow-y-auto"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b-2 border-dashed border-[var(--ink-soft)] sticky top-0 bg-[var(--bg-card)]">
              <h2 className="font-head text-[17px] text-[var(--ink)]">添加任务</h2>
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-full bg-[var(--fill-quaternary)] flex items-center justify-center active:scale-95 transition-transform"
              >
                <SketchIcon name="x" size={18} className="text-[var(--ink-soft)]" />
              </button>
            </div>

            <div className="px-4 py-4 space-y-4">
              {/* Task Title */}
              <div>
                <label className="text-[13px] text-[var(--ink-soft)] mb-1.5 block">任务名称</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                  placeholder="输入任务名称"
                  autoFocus
                  className="sketch-input w-full h-11 px-3 text-[15px] text-[var(--ink)] placeholder:text-[var(--text-tertiary)] outline-none"
                />
              </div>

              {/* Description */}
              <div>
                <label className="text-[13px] text-[var(--ink-soft)] mb-1.5 block">描述</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="添加任务描述（可选）"
                  rows={2}
                  className="sketch-input w-full px-3 py-2 text-[14px] text-[var(--ink)] placeholder:text-[var(--text-tertiary)] outline-none resize-none"
                />
              </div>

              {/* Time */}
              <div>
                <label className="text-[13px] text-[var(--ink-soft)] mb-1.5 block">时间</label>
                <input
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  className="sketch-input w-full h-11 px-3 text-[15px] text-[var(--ink)] outline-none"
                />
              </div>

              {/* Category */}
              <div>
                <label className="text-[13px] text-[var(--ink-soft)] mb-1.5 block">分类</label>
                <div className="flex flex-wrap gap-2">
                  {categories.map((cat) => (
                    <button
                      key={cat.id}
                      onClick={() => setCategoryId(cat.id)}
                      className={`sketch-chip ${categoryId === cat.id ? 'on' : ''}`}
                      style={
                        categoryId === cat.id
                          ? { backgroundColor: cat.color, borderColor: 'var(--ink)', color: '#fff' }
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
                <label className="text-[13px] text-[var(--ink-soft)] mb-1.5 flex items-center gap-1">
                  <SketchIcon name="repeat" size={13} strokeWidth={2} />
                  重复
                </label>
                <div className="flex flex-wrap gap-2 mb-2">
                  {recurrenceOptions.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setRecurrence(opt.value)}
                      className={`sketch-chip ${recurrence === opt.value ? 'on' : ''}`}
                      style={
                        recurrence === opt.value
                          ? { backgroundColor: 'var(--red)', borderColor: 'var(--ink)', color: '#fff' }
                          : undefined
                      }
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
                    <label className="text-[12px] text-[var(--ink-soft)] mb-1 block">
                      结束日期（可选，留空则无限重复）
                    </label>
                    <input
                      type="date"
                      value={recurrenceEndDate}
                      onChange={(e) => setRecurrenceEndDate(e.target.value)}
                      className="sketch-input w-full h-10 px-3 text-[14px] text-[var(--ink)] outline-none"
                    />
                  </motion.div>
                )}
              </div>

              {/* Subtasks */}
              <div>
                <label className="text-[13px] text-[var(--ink-soft)] mb-1.5 block">子任务</label>
                {subtasks.length > 0 && (
                  <div className="space-y-2 mb-2">
                    {subtasks.map((st, idx) => (
                      <div key={idx} className="sketch-input flex items-center gap-2 px-3 py-2">
                        <span className="flex-1 text-[14px] text-[var(--ink)]">{st.title}</span>
                        <button
                          onClick={() => removeSubtask(idx)}
                          className="text-[var(--red)] text-[12px] px-2 py-0.5 active:scale-90 font-head"
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
                    className="sketch-input flex-1 h-10 px-3 text-[14px] text-[var(--ink)] placeholder:text-[var(--text-tertiary)] outline-none"
                  />
                  <button
                    onClick={addSubtask}
                    disabled={!newSubtaskTitle.trim()}
                    className="px-3 h-10 rounded-xl bg-[var(--red)] text-white text-[13px] font-head font-medium disabled:opacity-40 active:scale-95 transition-all border-2 border-[var(--ink)] sketch-wobble-sm"
                  >
                    添加
                  </button>
                </div>
              </div>

              {/* Color */}
              <div>
                <label className="text-[13px] text-[var(--ink-soft)] mb-1.5 block">标记颜色</label>
                <div className="flex gap-3">
                  {colorOptions.map((c) => (
                    <button
                      key={c.value}
                      onClick={() => setColor(c.value)}
                      className={`w-8 h-8 rounded-full flex items-center justify-center text-[10px] text-white font-head font-medium transition-all active:scale-90 border-2 border-[var(--ink)] sketch-wobble-sm ${
                        color === c.value ? 'ring-2 ring-offset-2 ring-[var(--red)]' : ''
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
                className="w-full h-12 rounded-xl bg-[var(--red)] text-white text-[16px] font-head font-semibold disabled:opacity-40 active:scale-[0.98] transition-all border-2 border-[var(--ink)] sketch-wobble-sm"
              >
                添加
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
