import { useState, useRef, useCallback } from 'react';
import { Plus } from 'lucide-react';
import { motion } from 'framer-motion';

interface DraggableFABProps {
  onClick: () => void;
}

export default function DraggableFAB({ onClick }: DraggableFABProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [hasDragged, setHasDragged] = useState(false);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isLongPress = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handlePointerDown = useCallback(() => {
    isLongPress.current = false;
    setHasDragged(false);
    longPressTimer.current = setTimeout(() => {
      isLongPress.current = true;
    }, 200);
  }, []);

  const handlePointerUp = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  const handleDragStart = useCallback(() => {
    setIsDragging(true);
    setHasDragged(true);
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  const handleDragEnd = useCallback(() => {
    setIsDragging(false);
    setTimeout(() => setHasDragged(false), 50);
  }, []);

  const handleClick = useCallback(() => {
    if (!hasDragged && !isDragging) {
      onClick();
    }
  }, [hasDragged, isDragging, onClick]);

  return (
    <div ref={containerRef} className="absolute inset-0 pointer-events-none z-10">
      <motion.button
        drag
        dragMomentum={false}
        dragConstraints={containerRef}
        dragElastic={0}
        dragTransition={{ bounceStiffness: 300, bounceDamping: 20 }}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onClick={handleClick}
        initial={{ x: 0, y: 0 }}
        style={{
          position: 'absolute',
          right: 16,
          bottom: 16,
          touchAction: 'none',
          pointerEvents: 'auto',
        }}
        whileTap={{ scale: 0.9 }}
        className={`w-12 h-12 rounded-full bg-[var(--primary-blue)] flex items-center justify-center fab-shadow ${
          isDragging ? 'cursor-grabbing opacity-90' : 'cursor-grab'
        }`}
      >
        <Plus size={22} strokeWidth={2.5} className="text-white pointer-events-none" />
      </motion.button>
    </div>
  );
}
