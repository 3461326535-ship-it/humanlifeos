interface SketchCheckboxProps {
  checked: boolean;
  size?: number;
  className?: string;
}

/**
 * Hand-drawn checkbox — rounded rect with scribble tick when checked.
 */
export function SketchCheckbox({ checked, size = 22, className }: SketchCheckboxProps) {
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className={`sketch-wobble-sm shrink-0 ${className ?? ''}`}
      fill="none"
    >
      <rect
        x="14"
        y="14"
        width="72"
        height="72"
        rx="14"
        fill={checked ? 'var(--red)' : 'none'}
        stroke="var(--ink)"
        strokeWidth="6"
      />
      {checked && (
        <path
          className="sketch-tick-path"
          d="M32 50l12 13 24-28"
          stroke="#fff"
          strokeWidth="8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
    </svg>
  );
}

export default SketchCheckbox;
