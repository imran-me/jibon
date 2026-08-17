/**
 * Icon set.
 *
 * Hand-picked outline paths on a 24×24 grid, drawn with `currentColor` so every
 * icon inherits its context. Kept as data rather than markup files: there are
 * few enough that a lookup table beats a build step, and it means an icon can be
 * requested by name from the taxonomy.
 */

import { h } from '../core/dom.js';

export const PATHS = {
  /* Emergency types — these appear on the citizen icon grid at large size. */
  heart: 'M19.5 12.6 12 20l-7.5-7.4a4.9 4.9 0 0 1 0-7 5 5 0 0 1 7 0l.5.5.5-.5a5 5 0 0 1 7 0 4.9 4.9 0 0 1 0 7z',
  'person-down': 'M5 18h9M7 18a3 3 0 0 1 3-3h4l3-3M17 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4M4 21h16',
  crash: 'M5 17h14M6 17v2M18 17v2M4 13l1.5-4A2 2 0 0 1 7.4 8h9.2a2 2 0 0 1 1.9 1.3L20 13v4H4zM7.5 13h.01M16.5 13h.01M12 3l1.5 3-3 1 1.5 3',
  droplet: 'M12 3.5c3 3.6 6 6.7 6 10a6 6 0 0 1-12 0c0-3.3 3-6.4 6-10z',
  lungs: 'M12 4v8M8.5 8C7 8 5 9.5 4.5 13c-.4 2.6-.5 4.6.5 5.6 1 1 3 .6 3.5-.6.4-1 .5-3 .5-5.5V8zM15.5 8c1.5 0 3.5 1.5 4 5 .4 2.6.5 4.6-.5 5.6-1 1-3 .6-3.5-.6-.4-1-.5-3-.5-5.5V8z',
  brain: 'M9.5 4a2.5 2.5 0 0 0-2.4 3.2A2.5 2.5 0 0 0 5 12a2.5 2.5 0 0 0 1.6 2.3A2.5 2.5 0 0 0 9.5 20H12V4zM14.5 4a2.5 2.5 0 0 1 2.4 3.2A2.5 2.5 0 0 1 19 12a2.5 2.5 0 0 1-1.6 2.3A2.5 2.5 0 0 1 14.5 20H12',
  obstetric: 'M12 21a6 6 0 0 0 6-6c0-3-2-5-2-8a4 4 0 0 0-8 0c0 3-2 5-2 8a6 6 0 0 0 6 6zM10.5 14.5a2 2 0 0 0 3 0',
  flame: 'M12 3c1 3.5 4.5 4.5 4.5 8.5A4.5 4.5 0 0 1 12 16a4.5 4.5 0 0 1-4.5-4.5C7.5 9 9 8 9.5 6c1 1 1.5 2 1.5 3 .5-2 1-4 1-6zM12 16v5',
  poison: 'M9 3h6v3l3.5 9.5A4 4 0 0 1 14.8 21H9.2a4 4 0 0 1-3.7-5.5L9 6zM10 13h4M12 11v4',
  shield: 'M12 3 5 6v6c0 4.4 3 8 7 9 4-1 7-4.6 7-9V6z',
  alert: 'M12 4 2.5 20h19zM12 10v4M12 17h.01',

  /* Navigation and controls. */
  grid: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z',
  list: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01',
  ambulance: 'M3 16V9h11v7M14 11h3.5l2.5 3.5V16M3 16h2M9 16h6M19 16h2M6.5 18.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3M17.5 18.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3M8 11.5h3M9.5 10v3',
  hospital: 'M4 21V8l8-5 8 5v13M4 21h16M10 21v-5h4v5M12 8v4M10 10h4',
  chart: 'M4 20V6M4 20h16M8 20v-6M12 20v-9M16 20v-4M20 20v-11',
  spark: 'M12 2 15 9l7 1-5 5 1.5 7L12 18.5 5.5 22 7 15 2 10l7-1z',
  gear: 'M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2 2 2 0 1 1-4 0 1.7 1.7 0 0 0-2.9-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 3 15a2 2 0 1 1 0-4 1.7 1.7 0 0 0 1.2-2.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 10 4.2a2 2 0 1 1 4 0 1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1A1.7 1.7 0 0 0 21 11a2 2 0 1 1 0 4 1.7 1.7 0 0 0-1.6 1z',

  mic: 'M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3M19 11a7 7 0 0 1-14 0M12 18v3M8 21h8',
  camera: 'M4 8h3l1.5-2h7L17 8h3v11H4zM12 16a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7',
  play: 'M7 4.5v15l13-7.5z',
  stop: 'M6 6h12v12H6z',
  close: 'M18 6 6 18M6 6l12 12',
  chevron: 'm9 18 6-6-6-6',
  check: 'm20 6-11 11-5-5',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M12 7v5l3 2',
  pin: 'M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11M12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5',
  route: 'M6 20a3 3 0 1 0 0-6 3 3 0 0 0 0 6M18 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6M18 10v3a4 4 0 0 1-4 4h-4a4 4 0 0 0-4 4',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8M4 21a8 8 0 0 1 16 0',
  users: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16M21 21l-4.3-4.3',
  send: 'M22 2 11 13M22 2l-7 20-4-9-9-4z',
  shieldCheck: 'M12 3 5 6v6c0 4.4 3 8 7 9 4-1 7-4.6 7-9V6zM9 12l2 2 4-4',
  eye: 'M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6',
  download: 'M12 3v12M7 11l5 4 5-4M4 20h16',
  refresh: 'M20 12a8 8 0 1 1-2.3-5.6M20 4v5h-5',
  arrowRight: 'M4 12h16M14 6l6 6-6 6',
};

/**
 * Build an icon element.
 * @param {string} name Key from PATHS.
 */
export function icon(name, { size = 16, stroke = 1.5, fill = 'none', className = '' } = {}) {
  const spec = PATHS[name] || PATHS.alert;
  const svg = h('svg', {
    class: className,
    viewBox: '0 0 24 24',
    width: size,
    height: size,
    fill,
    stroke: 'currentColor',
    'stroke-width': stroke,
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    'aria-hidden': 'true',
    focusable: 'false',
  });

  for (const d of spec.split('M').filter(Boolean).map((segment) => `M${segment}`)) {
    svg.appendChild(h('path', { d }));
  }
  return svg;
}

export const hasIcon = (name) => name in PATHS;
