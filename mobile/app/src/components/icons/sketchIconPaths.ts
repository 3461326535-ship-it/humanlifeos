/**
 * Hand-drawn SVG icon paths — sourced from app_sketch_v4.html mockup
 * and extended with additional icons needed by the app.
 *
 * Each icon is an array of SVG <path> d-strings drawn on a 24x24 viewBox.
 */
export const SKETCH_ICON_PATHS: Record<string, string[]> = {
  // Tab bar
  sun: [
    'M12 7.5a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9',
    'M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2',
  ],
  calendar: [
    'M4 5h16v15H4z',
    'M4 9h16M8 3v4M16 3v4',
    'M8 13h.5M11 13h.5M14 13h.5M8 16.5h.5M11 16.5h.5M14 16.5h.5',
  ],
  chart: ['M4 20h16M7 20v-6M12 20V8M17 20v-9'],
  sparkle: ['M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2z'],
  user: ['M12 8a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7', 'M5.5 20a6.5 6.5 0 0 1 13 0'],

  // Actions
  plus: ['M12 5v14M5 12h14'],
  check: ['M5 13l4 4 10-11'],
  x: ['M6 6l12 12M18 6L6 18'],
  pen: ['M4 20l1-4L16 5l3 3L8 19z', 'M14 7l3 3'],
  trash: ['M4 6h16M9 3h6M7 6l1 15h8l1-15M10 10v6M14 10v6'],
  repeat: ['M4 9h13M14 6l3 3-3 3', 'M20 15H7M10 18l-3-3 3-3'],

  // Navigation
  'chevron-left': ['M14.5 5.5L8 12l6.5 6.5'],
  'chevron-right': ['M9.5 5.5L16 12l-6.5 6.5'],
  'chevron-down': ['M5.5 9.5L12 16l6.5-6.5'],
  'chevron-up': ['M5.5 14.5L12 8l6.5 6.5'],
  'arrow-right': ['M5 12h13M13 6l6 6-6 6'],

  // Status
  alert: ['M12 3l9 16H3z', 'M12 10v4M12 17v.5'],
  clock: ['M12 12a8 8 0 1 0 0-16 8 8 0 0 0 0 16', 'M12 7v5l3.5 2'],
  search: [
    'M10.5 10.5a5.5 5.5 0 1 0 0-11 5.5 5.5 0 0 0 0 11',
    'M15 15l5 5',
  ],

  // Data / sync
  folder: ['M4 4h7l9 9-7 7-9-9z', 'M8.5 8.5a1.4 1.4 0 1 0 0 2.8 1.4 1.4 0 0 0 0-2.8'],
  cloud: [
    'M7 18a4 4 0 0 1 .5-8 5 5 0 0 1 9.5 1.5A3.5 3.5 0 0 1 17 18z',
    'M12 14v-5M9.5 11l2.5-2.5L14.5 11',
  ],
  upload: ['M12 16V5M8 9l4-4 4 4', 'M5 20h14'],
  download: ['M12 5v11M8 12l4 4 4-4', 'M5 20h14'],
  sync: ['M4 12a8 8 0 0 1 14-4M20 12a8 8 0 0 1-14 4', 'M18 3v5h-5M6 21v-5h5'],

  // Network
  wifi: ['M5 9a10 10 0 0 1 14 0M8 12.5a6 6 0 0 1 8 0', 'M12 16.5h0.01'],
  'wifi-off': ['M5 9a10 10 0 0 1 4-3M19 9a10 10 0 0 0-4-3', 'M4 4l16 16'],

  // Auth
  login: ['M4 12h13M14 8l4 4-4 4'],
  logout: ['M12 4v7M7 7a7 7 0 1 0 10 0'],

  // Notifications
  bell: ['M6 16v-5a6 6 0 0 1 12 0v5l2 3H4z', 'M10 19a2 2 0 0 0 4 0'],
  'bell-off': ['M6 16v-5a6 6 0 0 1 12 0v5l2 3H4z', 'M4 4l16 16'],

  // Misc
  info: [
    'M9.5 9a3 3 0 1 1 4.6 2.5c-.8.7-1.1 1.2-1.1 2.5',
    'M12.5 17.5h0.01',
  ],
  heart: [
    'M12 20s-7-4.5-9-8.5C1.5 8 4 5 7 5c2 0 3 1 5 3 2-2 3-3 5-3 3 0 5.5 3 4 6.5-2 4-9 8.5-9 8.5z',
  ],
  dots: [
    'M12 12a2.4 2.4 0 1 0 0 4.8 2.4 2.4 0 0 0 0-4.8',
    'M12 6a2.2 2.2 0 1 0 0 4.4 2.2 2.2 0 0 0 0-4.4',
    'M12 18a2.2 2.2 0 1 0 0 4.4 2.2 2.2 0 0 0 0-4.4',
    'M6 12a2.2 2.2 0 1 0 0 4.4 2.2 2.2 0 0 0 0-4.4',
    'M18 12a2.2 2.2 0 1 0 0 4.4 2.2 2.2 0 0 0 0-4.4',
  ],
  tag: ['M4 4h7l9 9-7 7-9-9z', 'M8.5 8.5a1.4 1.4 0 1 0 0 2.8 1.4 1.4 0 0 0 0-2.8'],
};

export type SketchIconName = keyof typeof SKETCH_ICON_PATHS;

/** Check if an icon name exists in the sketch icon set */
export function hasSketchIcon(name: string): name is SketchIconName {
  return name in SKETCH_ICON_PATHS;
}
