import { useState, useRef, useCallback } from 'react';
import { Check, ChevronDown, ChevronUp, Repeat, Pencil, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Task } from '@/types';

interface TaskCardProps {
  task: Task;
  onToggle: (id: string) => void;
  onToggleSubtask?: (taskId: string, subtaskId: string) => void;
  categoryColor?: string;
  categoryName?: string;
  onPress?: (task: Task) => void;
  onLongPress?: (task: Task) => void;
  onDelete?: (task: Task) => void;
}

const colorMap: Record<string, string> = {
  blue: '#E8887E',  // macaron coral red
  green: '#34C759',
  red: '#FF3B30',
  purple: '#AF52DE',
  yellow: '#FFCC00',
  gray: '#8E8E93',
};

const recurrenceLabels: Record<string, string> = {
  daily: '每天',
  weekly: '每周',
  monthly: '每月',
  yearly: '每年',
};

const SWIPE_BTN_W = 72; // 每个操作按钮宽度
const SWIPE_TOTAL = SWIPE_BTN_W * 2; // 编辑 + 删除 = 144px

export default function TaskCard({
  task,
  onToggle,
  onToggleSubtask,
  categoryColor,
  categoryName,
  onPress,
  onLongPress,
  onDelete,
}: TaskCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [swipedOpen, setSwipedOpen] = useState(false);
  const hasSubtasks = task.subtasks && task.subtasks.length > 0;
  const hasDescription = !!task.description;
  const hasExtra = hasSubtasks || hasDescription;

  // ── 长按手势 ──
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragStart = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const suppressClick = useRef(false);
  const LONG_PRESS_MS = 500;

  const clearLongPress = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  const startLongPress = useCallback(() => {
    suppressClick.current = false;
    clearLongPress();
    longPressTimer.current = setTimeout(() => {
      suppressClick.current = true;
      if (onLongPress) onLongPress(task);
    }, LONG_PRESS_MS);
  }, [task, onLongPress, clearLongPress]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const t = e.touches[0];
    dragStart.current = { x: t.clientX, y: t.clientY };
    startLongPress();
  }, [startLongPress]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    const t = e.touches[0];
    const dx = Math.abs(t.clientX - dragStart.current.x);
    const dy = Math.abs(t.clientY - dragStart.current.y);
    if (dx > 10 || dy > 10) clearLongPress();
  }, [clearLongPress]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    dragStart.current = { x: e.clientX, y: e.clientY };
    startLongPress();
  }, [startLongPress]);

  const handleMouseUp = useCallback(() => clearLongPress(), [clearLongPress]);
  const handleMouseLeave = useCallback(() => clearLongPress(), [clearLongPress]);

  const handlePress = () => {
    if (suppressClick.current) return;
    if (swipedOpen) { setSwipedOpen(false); return; }
    if (onPress) onPress(task);
  };

  const handleEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setSwipedOpen(false);
    if (onLongPress) onLongPress(task);
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    setSwipedOpen(false);
    if (onDelete) onDelete(task);
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="bg-white rounded-xl card-shadow overflow-hidden"
    >
      {/* ── Swipe-to-Reveal Row ── */}
      <div className="relative overflow-hidden">
        {/* Action buttons (behind the card) */}
        <div className="absolute inset-y-0 right-0 flex">
          <button
            onClick={handleEdit}
            className="w-[72px] h-full flex items-center justify-center bg-[var(--primary-blue)] text-white text-[13px] font-medium active:opacity-80 transition-opacity"
          >
            <Pencil size={16} className="mr-1" />
            编辑
          </button>
          <button
            onClick={handleDelete}
            className="w-[72px] h-full flex items-center justify-center bg-[var(--red)] text-white text-[13px] font-medium active:opacity-80 transition-opacity"
          >
            <Trash2 size={16} className="mr-1" />
            删除
          </button>
        </div>

        {/* Card row — draggable horizontally */}
        <motion.div
          drag="x"
          dragConstraints={{ left: -SWIPE_TOTAL, right: 0 }}
          dragElastic={0.15}
          dragDirectionLock
          animate={{ x: swipedOpen ? -SWIPE_TOTAL : 0 }}
          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
          onDragEnd={(_, info) => {
            const absOffset = Math.abs(info.offset.x);
            const absVelocity = Math.abs(info.velocity.x);
            // 忽略微动（<10px 且速度慢）—— 防止点击按钮时被误判为滑动
            if (absOffset < 10 && absVelocity < 500) return;
            // 有意识的滑动才切换状态
            if (info.offset.x < -60) setSwipedOpen(true);
            else setSwipedOpen(false);
          }}
          className="bg-white relative cursor-pointer active:bg-gray-50 transition-colors select-none"
          style={{ touchAction: 'pan-y' }}
          onClick={handlePress}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onMouseDown={handleMouseDown}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseLeave}
        >
          <div className="flex items-center px-4 py-3.5">
            {/* Color strip */}
            <div
              className="w-1 h-10 rounded-full mr-3 shrink-0 self-center"
              style={{ backgroundColor: colorMap[task.color] || colorMap.gray }}
            />

            {/* Checkbox */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggle(task.id);
              }}
              className={`w-5 h-5 rounded-full border-2 mr-3 shrink-0 flex items-center justify-center transition-all duration-200 ${
                task.completed
                  ? 'bg-[var(--green)] border-[var(--green)]'
                  : 'border-[var(--icon-gray)]'
              }`}
            >
              {task.completed && <Check size={12} strokeWidth={3} className="text-white" />}
            </button>

            {/* Title + Category + Description */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span
                  className={`text-[15px] leading-5 ${
                    task.completed
                      ? 'text-[var(--text-tertiary)] line-through'
                      : 'text-[var(--text-primary)]'
                  }`}
                >
                  {task.title}
                </span>
                {task.recurrence && (
                  <Repeat size={12} className="text-[var(--text-tertiary)] shrink-0" />
                )}
              </div>
              {categoryName && (
                <div className="flex items-center mt-0.5">
                  <div
                    className="w-1.5 h-1.5 rounded-full mr-1"
                    style={{ backgroundColor: categoryColor || '#8E8E93' }}
                  />
                  <span className="text-[11px] text-[var(--text-tertiary)]">{categoryName}</span>
                  {task.recurrence && (
                    <span className="text-[10px] text-[var(--text-tertiary)] ml-1">
                      · {recurrenceLabels[task.recurrence] || task.recurrence}
                    </span>
                  )}
                </div>
              )}
              {hasDescription && !expanded && (
                <p
                  className={`text-[12px] mt-0.5 truncate ${
                    task.completed
                      ? 'text-[var(--text-tertiary)] line-through'
                      : 'text-[var(--text-tertiary)]'
                  }`}
                >
                  {task.description}
                </p>
              )}
            </div>

            {/* Expand icon */}
            {hasExtra && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setExpanded(!expanded);
                }}
                className="ml-2 p-1 shrink-0 text-[var(--text-tertiary)] active:bg-gray-100 rounded-full transition-colors"
              >
                {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>
            )}

            {/* Time */}
            <span className="text-[13px] font-medium text-[var(--primary-blue)] ml-2 shrink-0">
              {task.time}
            </span>
          </div>
        </motion.div>
      </div>

      {/* Expanded: Description + Subtasks */}
      <AnimatePresence>
        {expanded && hasExtra && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="pl-12 pr-4 pb-3 space-y-2">
              {hasDescription && (
                <p
                  className={`text-[13px] leading-relaxed ${
                    task.completed
                      ? 'text-[var(--text-tertiary)] line-through'
                      : 'text-[var(--text-secondary)]'
                  }`}
                >
                  {task.description}
                </p>
              )}

              {hasSubtasks && task.subtasks!.map((sub, idx) => (
                <div key={sub.id} className="flex items-center relative">
                  {idx < task.subtasks!.length - 1 && (
                    <div className="absolute left-[7px] top-4 w-px h-[calc(100%+8px)] bg-[var(--divider)]" />
                  )}
                  <div className="absolute left-[3px] top-2 w-2 h-2 rounded-full border border-[var(--divider)] bg-white z-10" />
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleSubtask?.(task.id, sub.id);
                    }}
                    className={`w-4 h-4 rounded-full border-2 ml-6 mr-3 shrink-0 flex items-center justify-center transition-all duration-200 ${
                      sub.completed
                        ? 'bg-[var(--green)] border-[var(--green)]'
                        : 'border-[var(--icon-gray)]'
                    }`}
                  >
                    {sub.completed && <Check size={10} strokeWidth={3} className="text-white" />}
                  </button>
                  <span
                    className={`text-[14px] ${
                      sub.completed
                        ? 'text-[var(--text-tertiary)] line-through'
                        : 'text-[var(--text-secondary)]'
                    }`}
                  >
                    {sub.title}
                  </span>
                  <span className="text-[12px] text-[var(--primary-blue)] ml-auto">
                    {task.time}
                  </span>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
