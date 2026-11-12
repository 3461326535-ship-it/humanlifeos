/**
 * SVG wobble filter definitions for the hand-drawn sketch effect.
 * Rendered once at the app root so all components can reference url(#wobble) / url(#wobble2).
 */
export default function SketchDefs() {
  return (
    <svg
      className="absolute w-0 h-0 overflow-hidden"
      aria-hidden="true"
      style={{ position: 'absolute', width: 0, height: 0 }}
    >
      <filter id="wobble">
        <feTurbulence
          type="fractalNoise"
          baseFrequency="0.018"
          numOctaves="3"
          seed="7"
          result="n"
        />
        <feDisplacementMap in="SourceGraphic" in2="n" scale="3.4" />
      </filter>
      <filter id="wobble2">
        <feTurbulence
          type="fractalNoise"
          baseFrequency="0.03"
          numOctaves="2"
          seed="3"
          result="n"
        />
        <feDisplacementMap in="SourceGraphic" in2="n" scale="2.2" />
      </filter>
    </svg>
  );
}
