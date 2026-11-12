import { useState, useEffect } from 'react';

interface SketchRingProps {
  percentage: number;
  size?: number;
  strokeColor?: string;
  label?: string;
  sub?: string;
  className?: string;
}

/**
 * Hand-drawn SVG progress ring.
 * Animates from 0% to target on mount, and between values on change.
 */
export function SketchRing({
  percentage,
  size = 100,
  strokeColor = 'var(--yellow)',
  label,
  sub,
  className,
}: SketchRingProps) {
  const r = 44;
  const circumference = 2 * Math.PI * r; // ~276.46
  const clampedPct = Math.min(100, Math.max(0, percentage));
  const targetOffset = circumference - (clampedPct / 100) * circumference;

  // Start at 0% (full circumference) then animate to target
  const [animOffset, setAnimOffset] = useState(circumference);

  useEffect(() => {
    // Small delay so the browser paints initial state before transition
    const timer = setTimeout(() => setAnimOffset(targetOffset), 50);
    return () => clearTimeout(timer);
  }, [targetOffset]);

  const textY = sub ? 54 : 58;

  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className={`-rotate-90 ${className ?? ''}`}
      fill="none"
    >
      {/* Track */}
      <circle
        cx="50"
        cy="50"
        r={r}
        fill="none"
        stroke="var(--ink)"
        strokeWidth="4"
        filter="url(#wobble)"
      />
      {/* Progress — CSS transition animates stroke-dashoffset changes */}
      <circle
        cx="50"
        cy="50"
        r={r}
        fill="none"
        stroke={strokeColor}
        strokeWidth="11"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={animOffset}
        filter="url(#wobble)"
        style={{
          transition: 'stroke-dashoffset 1.1s ease-out',
        }}
      />
      {/* Label — rotated back upright */}
      {label && (
        <text
          x="50"
          y={textY}
          textAnchor="middle"
          className="font-head"
          fill="var(--ink)"
          fontSize="23"
          transform="rotate(90 50 50)"
        >
          {label}
        </text>
      )}
      {sub && (
        <text
          x="50"
          y={textY + 14}
          textAnchor="middle"
          className="font-body"
          fill="var(--ink-soft)"
          fontSize="9"
          transform="rotate(90 50 50)"
        >
          {sub}
        </text>
      )}
    </svg>
  );
}

export default SketchRing;
