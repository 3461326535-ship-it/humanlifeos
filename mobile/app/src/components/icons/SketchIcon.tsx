import type { SVGProps } from 'react';
import { SKETCH_ICON_PATHS, type SketchIconName } from './sketchIconPaths';

interface SketchIconProps extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  name: SketchIconName | string;
  size?: number;
  strokeWidth?: number;
}

/**
 * Hand-drawn SVG icon component.
 * API mirrors lucide-react: `<SketchIcon name="plus" size={20} />`.
 * Falls back to rendering nothing if name is not found.
 */
export function SketchIcon({
  name,
  size = 20,
  strokeWidth = 2.2,
  className,
  ...rest
}: SketchIconProps) {
  const paths = SKETCH_ICON_PATHS[name];
  if (!paths) return null;

  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`sketch-ico ${className ?? ''}`}
      {...rest}
    >
      {paths.map((d, i) => (
        <path key={i} d={d} />
      ))}
    </svg>
  );
}

export default SketchIcon;
