import { useState, useRef, useCallback } from 'react';
import { SketchIcon } from '@/components/icons/SketchIcon';
import { SketchCheckbox } from '@/components/sketch/SketchCheckbox';
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
  /** Alternating card rotation index (0 = rot1, 1 = rot2, etc.) */
  rot?: number;
}

const colorMap: Record<string, string> = {
  blue: '#5FB8E8',   // sky
  green: '#8CC152',
  red: '#F4746B',
  purple: '#B58BE0',  // lav
  yellow: '#FFC93C',
  gray: '#C9BEA3',
};

const recurrenceLabels: Record<string, string> = {
  daily: '每天',
  weekly: '每周',
  monthly: '每月',
  yearly: '每年',
};

const SWIPE_BTN_W = 72;
const SWIPE_TOTAL = SWIPE_BTN_W * 2;

const rotClasses = ['sketch-card-rot1', 'sketch-card-rot2'];

export default function TaskCard({
  task,
  onToggle,
  onToggleSubtask,
  categoryColor,
  categoryName,
  onPress,
  onLongPress,
  onDelete,
  rot,
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

  const rotClass = rot !== undefined ? rotClasses[rot % rotClasses.length] : '';

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className={`sketch-card ${rotClass}`}
    >
      {/* ── Swipe-to-Reveal Row ── */}
      <div className="relative overflow-hidden rounded-[14px]">
        {/* Action buttons (behind the card) */}
        <div className="absolute inset-y-0 right-0 flex">
          <button
            onClick={handleEdit}
            className="w-[72px] h-full flex items-center justify-center bg-[var(--red)] text-white text-[13px] font-medium active:opacity-80 transition-opacity"
            style={{ fontFamily: "'ZCOOL KuaiLe', sans-serif" }}
          >
            <SketchIcon name="pen" size={16} strokeWidth={2.5} className="mr-1" stroke="white" />
            编辑
          </button>
          <button
            onClick={handleDelete}
            className="w-[72px] h-full flex items-center justify-center bg-[var(--ink-soft)] text-white text-[13px] font-medium active:opacity-80 transition-opacity"
            style={{ fontFamily: "'ZCOOL KuaiLe', sans-serif" }}
          >
            <SketchIcon name="trash" size={16} strokeWidth={2.5} className="mr-1" stroke="white" />
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
            if (absOffset < 10 && absVelocity < 500) return;
            if (info.offset.x < -60) setSwipedOpen(true);
            else setSwipedOpen(false);
          }}
          className="bg-[var(--bg-card)] relative cursor-pointer active:bg-[#F5F0E0] transition-colors select-none"
          style={{ touchAction: 'pan-y' }}
          onClick={handlePress}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onMouseDown={handleMouseDown}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseLeave}
        >
          <div className="flex items-center gap-[11px] px-[14px] py-[13px]">
            {/* Color dot */}
            <div
              className="w-[9px] h-[9px] rounded-full shrink-0 self-center"
              style={{ backgroundColor: colorMap[task.color] || colorMap.gray }}
            />

            {/* Sketch checkbox */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggle(task.id);
              }}
              className="shrink-0 flex"
            >
              <SketchCheckbox checked={task.completed} size={22} />
            </button>

            {/* Title + Category + Description */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span
                  className={`font-body text-[15px] leading-5 font-bold ${
                    task.completed
                      ? 'text-[var(--ink-soft)] line-through'
                      : 'text-[var(--ink)]'
                  }`}
                >
                  {task.title}
                </span>
                {task.recurrence && (
                  <SketchIcon name="repeat" size={12} strokeWidth={2} className="text-[var(--ink-soft)] shrink-0" />
                )}
              </div>
              {categoryName && (
                <div className="flex items-center mt-[3px] gap-[8px]">
                  <div className="flex items-center gap-1">
                    <div
                      className="w-[9px] h-[9px] rounded-full"
                      style={{ backgroundColor: categoryColor || '#C9BEA3' }}
                    />
                    <span className="text-[12px] text-[var(--ink-soft)]">{categoryName}</span>
                  </div>
                  {task.recurrence && (
                    <span className="text-[10px] text-[var(--ink-soft)]">
                      · {recurrenceLabels[task.recurrence] || task.recurrence}
                    </span>
                  )}
                </div>
              )}
              {hasDescription && !expanded && (
                <p
                  className={`text-[12px] mt-[3px] truncate ${
                    task.completed
                      ? 'text-[var(--ink-soft)] line-through'
                      : 'text-[var(--ink-soft)]'
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
                className="ml-auto p-1 shrink-0 text-[var(--ink-soft)] active:bg-[#F5F0E0] rounded-full transition-colors"
              >
                {expanded ? (
                  <SketchIcon name="chevron-up" size={16} strokeWidth={2.5} />
                ) : (
                  <SketchIcon name="chevron-down" size={16} strokeWidth={2.5} />
                )}
              </button>
            )}

            {/* Time */}
            <span className="text-[13px] font-medium text-[var(--red)] shrink-0">
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
                  className={`text-[13px] leading-relaxed font-body ${
                    task.completed
                      ? 'text-[var(--ink-soft)] line-through'
                      : 'text-[var(--ink-soft)]'
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
                  <div className="absolute left-[3px] top-2 w-2 h-2 rounded-full border border-[var(--divider)] bg-[var(--bg-card)] z-10" />
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleSubtask?.(task.id, sub.id);
                    }}
                    className="ml-6 mr-3 shrink-0 flex"
                  >
                    <SketchCheckbox checked={sub.completed} size={18} />
                  </button>
                  <span
                    className={`text-[14px] font-body ${
                      sub.completed
                        ? 'text-[var(--ink-soft)] line-through'
                        : 'text-[var(--ink-soft)]'
                    }`}
                  >
                    {sub.title}
                  </span>
                  <span className="text-[12px] text-[var(--red)] ml-auto">
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
