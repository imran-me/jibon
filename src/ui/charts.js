/**
 * Chart primitives, drawn as inline SVG.
 *
 * No charting library: the bundle stays dependency-free, the marks inherit the
 * theme's CSS variables (so light/dark just works), and every mark can be a
 * real focusable, clickable element rather than a canvas hit-test.
 *
 * Charts are measured against their container and redrawn on resize, so text
 * never scales unevenly the way a stretched viewBox would make it.
 */

import { h } from '../core/dom.js';
import * as fmt from '../core/format.js';

/* ── Shared tooltip ───────────────────────────────────────────────────────── */

let tipEl = null;

function tooltip() {
  if (!tipEl) {
    tipEl = h('div.chart-tip', { role: 'presentation' });
    document.body.appendChild(tipEl);
  }
  return tipEl;
}

function showTip(event, label, value, sub) {
  const tip = tooltip();
  tip.replaceChildren(
    h('div', {}, h('span.chart-tip__label', {}, label), h('span.chart-tip__value', {}, value)),
    sub ? h('div.chart-tip__label', { style: { marginTop: '2px' } }, sub) : null,
  );
  tip.style.left = `${event.clientX}px`;
  tip.style.top = `${event.clientY}px`;
  tip.dataset.show = 'true';
}

function hideTip() {
  if (tipEl) tipEl.dataset.show = 'false';
}

/** Attach hover/focus tooltip behaviour and an optional click handler to a mark. */
function interactive(node, { label, value, sub, onPick, ariaLabel }) {
  node.classList.add('mark');
  node.setAttribute('tabindex', '0');
  node.setAttribute('role', onPick ? 'button' : 'img');
  node.setAttribute('aria-label', ariaLabel || `${label}: ${value}`);

  node.addEventListener('mousemove', (event) => showTip(event, label, value, sub));
  node.addEventListener('mouseleave', hideTip);
  node.addEventListener('blur', hideTip);

  node.addEventListener('focus', (event) => {
    const box = node.getBoundingClientRect();
    showTip({ clientX: box.left + box.width / 2, clientY: box.top }, label, value, sub);
    event.stopPropagation();
  });

  if (onPick) {
    node.style.cursor = 'pointer';
    node.addEventListener('click', () => { hideTip(); onPick(); });
    node.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        hideTip();
        onPick();
      }
    });
  }
  return node;
}

/* ── Scales and ticks ─────────────────────────────────────────────────────── */

/** Round an axis maximum up to a readable step (1/2/5 × 10ⁿ). */
export function niceMax(value) {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalised = value / magnitude;
  const step = normalised <= 1 ? 1 : normalised <= 2 ? 2 : normalised <= 5 ? 5 : 10;
  return step * magnitude;
}

function ticks(max, count = 4) {
  const step = max / count;
  return Array.from({ length: count + 1 }, (_, i) => Math.round(step * i));
}

const svgEl = (tag, attrs = {}) => {
  const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value !== null && value !== undefined) node.setAttribute(key, String(value));
  }
  return node;
};

function frame(width, height) {
  const svg = svgEl('svg', {
    class: 'chart',
    width: '100%',
    height,
    viewBox: `0 0 ${width} ${height}`,
    role: 'group',
  });
  svg.addEventListener('mouseleave', hideTip);
  return svg;
}

/**
 * Mount a chart into a container and keep it sized to that container.
 * `draw(width)` must return an SVG element.
 * @returns {() => void} teardown
 */
export function mountChart(container, draw) {
  let lastWidth = 0;

  const render = () => {
    const width = Math.max(240, Math.round(container.clientWidth));
    // Redrawing on sub-pixel jitter would thrash; only react to real changes.
    if (Math.abs(width - lastWidth) < 2) return;
    lastWidth = width;
    container.replaceChildren(draw(width));
  };

  const observer = new ResizeObserver(render);
  observer.observe(container);
  render();

  return () => {
    observer.disconnect();
    hideTip();
  };
}

/* ── Sparkline ────────────────────────────────────────────────────────────── */

/** Decorative micro-trend for KPI tiles. Not interactive by design. */
export function sparkline(values, { width = 120, height = 24, color = 'var(--accent)' } = {}) {
  const svg = frame(width, height);
  if (!values.length) return svg;

  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const span = max - min || 1;
  const stepX = values.length > 1 ? width / (values.length - 1) : width;

  const point = (value, i) => [i * stepX, height - 2 - ((value - min) / span) * (height - 4)];
  const path = values.map((value, i) => `${i ? 'L' : 'M'}${point(value, i).join(' ')}`).join(' ');

  svg.appendChild(svgEl('path', {
    d: `${path} L${width} ${height} L0 ${height} Z`,
    fill: color,
    opacity: 0.13,
    stroke: 'none',
  }));

  svg.appendChild(svgEl('path', { d: path, fill: 'none', stroke: color, 'stroke-width': 1.5, 'stroke-linejoin': 'round' }));

  const [lastX, lastY] = point(values[values.length - 1], values.length - 1);
  svg.appendChild(svgEl('circle', { cx: lastX - 1, cy: lastY, r: 2, fill: color }));

  return svg;
}

/* ── Time-series area chart ───────────────────────────────────────────────── */

/**
 * Single-series trend with a hover cursor. Each day is a click target that can
 * open the drill-down for that date.
 *
 * @param {object} options
 * @param {Array<{ts:number,value:number}>} options.points
 * @param {(point) => void} [options.onPick]
 */
export function areaChart({ points, width = 640, height = 220, color = 'var(--accent)', label = 'Reports', onPick }) {
  const pad = { top: 12, right: 8, bottom: 24, left: 34 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const svg = frame(width, height);

  if (!points.length) return svg;

  const max = niceMax(Math.max(...points.map((p) => p.value), 1));
  const stepX = points.length > 1 ? plotW / (points.length - 1) : plotW;
  const x = (i) => pad.left + i * stepX;
  const y = (value) => pad.top + plotH - (value / max) * plotH;

  // Gridlines and y-axis labels.
  for (const tick of ticks(max)) {
    const ty = y(tick);
    svg.appendChild(svgEl('line', { class: 'grid-line', x1: pad.left, x2: width - pad.right, y1: ty, y2: ty }));
    const text = svgEl('text', { x: pad.left - 8, y: ty + 3, 'text-anchor': 'end' });
    text.textContent = fmt.short(tick);
    svg.appendChild(text);
  }

  const line = points.map((point, i) => `${i ? 'L' : 'M'}${x(i)} ${y(point.value)}`).join(' ');

  svg.appendChild(svgEl('path', {
    class: 'series-area',
    d: `${line} L${x(points.length - 1)} ${pad.top + plotH} L${pad.left} ${pad.top + plotH} Z`,
    fill: color,
  }));

  svg.appendChild(svgEl('path', { class: 'series-line', d: line, stroke: color }));

  // X labels: roughly six, evenly spaced, never crowded.
  const labelStep = Math.max(1, Math.ceil(points.length / 6));
  points.forEach((point, i) => {
    if (i % labelStep !== 0 && i !== points.length - 1) return;
    const text = svgEl('text', { x: x(i), y: height - 6, 'text-anchor': 'middle' });
    text.textContent = fmt.asDate(point.ts);
    svg.appendChild(text);
  });

  // Invisible hit columns give every day a generous target.
  const hitW = plotW / points.length;
  points.forEach((point, i) => {
    const hit = svgEl('rect', {
      x: x(i) - hitW / 2,
      y: pad.top,
      width: hitW,
      height: plotH,
      fill: 'transparent',
    });

    const marker = svgEl('circle', { cx: x(i), cy: y(point.value), r: 3, fill: color, opacity: 0 });

    hit.addEventListener('mouseenter', () => { marker.setAttribute('opacity', '1'); });
    hit.addEventListener('mouseleave', () => { marker.setAttribute('opacity', '0'); });
    hit.addEventListener('focus', () => { marker.setAttribute('opacity', '1'); });
    hit.addEventListener('blur', () => { marker.setAttribute('opacity', '0'); });

    interactive(hit, {
      label: fmt.asDate(point.ts),
      value: `${fmt.num(point.value)} ${label.toLowerCase()}`,
      onPick: onPick ? () => onPick(point) : null,
      ariaLabel: `${fmt.asFullDate(point.ts)}: ${point.value} ${label.toLowerCase()}`,
    });

    svg.appendChild(marker);
    svg.appendChild(hit);
  });

  return svg;
}

/* ── Multi-series line chart ──────────────────────────────────────────────── */

/**
 * @param {Array<{key,label,color,points}>} series
 */
export function multiLineChart({ series, width = 640, height = 260, onPick }) {
  const pad = { top: 12, right: 8, bottom: 24, left: 34 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const svg = frame(width, height);

  const visible = series.filter((s) => s.points?.length);
  if (!visible.length) return svg;

  const length = visible[0].points.length;
  const max = niceMax(Math.max(1, ...visible.flatMap((s) => s.points.map((p) => p.value))));
  const stepX = length > 1 ? plotW / (length - 1) : plotW;
  const x = (i) => pad.left + i * stepX;
  const y = (value) => pad.top + plotH - (value / max) * plotH;

  for (const tick of ticks(max)) {
    const ty = y(tick);
    svg.appendChild(svgEl('line', { class: 'grid-line', x1: pad.left, x2: width - pad.right, y1: ty, y2: ty }));
    const text = svgEl('text', { x: pad.left - 8, y: ty + 3, 'text-anchor': 'end' });
    text.textContent = fmt.short(tick);
    svg.appendChild(text);
  }

  const labelStep = Math.max(1, Math.ceil(length / 6));
  visible[0].points.forEach((point, i) => {
    if (i % labelStep !== 0 && i !== length - 1) return;
    const text = svgEl('text', { x: x(i), y: height - 6, 'text-anchor': 'middle' });
    text.textContent = fmt.asDate(point.ts);
    svg.appendChild(text);
  });

  for (const line of visible) {
    const path = svgEl('path', {
      class: 'series-line mark',
      d: line.points.map((point, i) => `${i ? 'L' : 'M'}${x(i)} ${y(point.value)}`).join(' '),
      stroke: line.color,
    });

    const total = line.points.reduce((sum, point) => sum + point.value, 0);
    interactive(path, {
      label: line.label,
      value: `${fmt.num(total)} total`,
      onPick: onPick ? () => onPick(line) : null,
    });

    svg.appendChild(path);
  }

  return svg;
}

/* ── Bar chart ────────────────────────────────────────────────────────────── */

/**
 * Vertical bars for categorical or bucketed data.
 * @param {Array<{label:string,value:number,color?:string,id?:string}>} data
 */
export function barChart({ data, width = 640, height = 220, onPick, valueLabel = '', rotateLabels = false }) {
  const pad = { top: 12, right: 8, bottom: rotateLabels ? 52 : 26, left: 34 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const svg = frame(width, height);

  if (!data.length) return svg;

  const max = niceMax(Math.max(...data.map((d) => d.value), 1));
  const slot = plotW / data.length;
  const barW = Math.min(46, slot * 0.62);
  const y = (value) => pad.top + plotH - (value / max) * plotH;

  for (const tick of ticks(max)) {
    const ty = y(tick);
    svg.appendChild(svgEl('line', { class: 'grid-line', x1: pad.left, x2: width - pad.right, y1: ty, y2: ty }));
    const text = svgEl('text', { x: pad.left - 8, y: ty + 3, 'text-anchor': 'end' });
    text.textContent = fmt.short(tick);
    svg.appendChild(text);
  }

  data.forEach((datum, i) => {
    const cx = pad.left + slot * i + slot / 2;
    const barH = Math.max(1, plotH - (y(datum.value) - pad.top));

    const rect = svgEl('rect', {
      x: cx - barW / 2,
      y: y(datum.value),
      width: barW,
      height: barH,
      rx: 3,
      fill: datum.color || 'var(--series-1)',
    });

    interactive(rect, {
      label: datum.label,
      value: `${fmt.num(datum.value)} ${valueLabel}`.trim(),
      onPick: onPick ? () => onPick(datum) : null,
    });
    svg.appendChild(rect);

    const text = svgEl('text', {
      x: cx,
      y: height - (rotateLabels ? 34 : 8),
      'text-anchor': rotateLabels ? 'end' : 'middle',
      transform: rotateLabels ? `rotate(-40 ${cx} ${height - 34})` : null,
    });
    text.textContent = datum.label;
    svg.appendChild(text);
  });

  return svg;
}

/* ── Donut ────────────────────────────────────────────────────────────────── */

/** Composition chart. Centre shows the total, which is itself a click target. */
export function donutChart({ data, width = 260, height = 260, onPick, centerLabel = 'Total', onCenterPick }) {
  const size = Math.min(width, height);
  const svg = frame(width, height);
  const cx = width / 2;
  const cy = height / 2;
  const outer = size / 2 - 6;
  const inner = outer * 0.64;

  const total = data.reduce((sum, datum) => sum + datum.value, 0);
  if (!total) return svg;

  let angle = -Math.PI / 2; // start at 12 o'clock

  for (const datum of data) {
    const sweep = (datum.value / total) * Math.PI * 2;
    const end = angle + sweep;
    const largeArc = sweep > Math.PI ? 1 : 0;

    const path = svgEl('path', {
      d: [
        `M${cx + outer * Math.cos(angle)} ${cy + outer * Math.sin(angle)}`,
        `A${outer} ${outer} 0 ${largeArc} 1 ${cx + outer * Math.cos(end)} ${cy + outer * Math.sin(end)}`,
        `L${cx + inner * Math.cos(end)} ${cy + inner * Math.sin(end)}`,
        `A${inner} ${inner} 0 ${largeArc} 0 ${cx + inner * Math.cos(angle)} ${cy + inner * Math.sin(angle)}`,
        'Z',
      ].join(' '),
      fill: datum.color || 'var(--series-1)',
    });

    interactive(path, {
      label: datum.label,
      value: fmt.num(datum.value),
      sub: fmt.pct(datum.value / total),
      onPick: onPick ? () => onPick(datum) : null,
    });

    svg.appendChild(path);
    angle = end;
  }

  const value = svgEl('text', {
    x: cx,
    y: cy + 2,
    'text-anchor': 'middle',
    style: 'font-size:22px;font-weight:520;letter-spacing:-0.02em;fill:var(--text)',
  });
  value.textContent = fmt.short(total);

  const caption = svgEl('text', {
    x: cx,
    y: cy + 20,
    'text-anchor': 'middle',
    style: 'font-size:10px;letter-spacing:0.08em;text-transform:uppercase',
  });
  caption.textContent = centerLabel;

  if (onCenterPick) {
    const hit = svgEl('circle', { cx, cy, r: inner, fill: 'transparent' });
    interactive(hit, { label: centerLabel, value: fmt.num(total), onPick: onCenterPick });
    svg.appendChild(hit);
  }

  svg.appendChild(value);
  svg.appendChild(caption);
  return svg;
}

/* ── Heat matrix ──────────────────────────────────────────────────────────── */

/**
 * Ward × category grid. Intensity encodes volume; every cell drills through to
 * the matching filtered list.
 */
export function heatMatrix({ rows, cols, max, width = 720, onPick, rowLabel = 'Ward' }) {
  const labelW = 104;
  const headerH = 64;
  const cell = Math.max(28, Math.min(48, (width - labelW - 8) / cols.length));
  const height = headerH + rows.length * cell + 8;
  const svg = frame(Math.max(width, labelW + cols.length * cell + 8), height);

  cols.forEach((col, c) => {
    const cx = labelW + c * cell + cell / 2;
    const text = svgEl('text', {
      x: cx,
      y: headerH - 10,
      'text-anchor': 'end',
      transform: `rotate(-42 ${cx} ${headerH - 10})`,
    });
    text.textContent = col.label;
    svg.appendChild(text);
  });

  rows.forEach((row, r) => {
    const cy = headerH + r * cell;

    const label = svgEl('text', { x: labelW - 10, y: cy + cell / 2 + 3, 'text-anchor': 'end' });
    label.textContent = row.label;
    svg.appendChild(label);

    row.cells.forEach((datum, c) => {
      // Square-root scaling keeps mid-range cells from washing out.
      const intensity = max ? Math.sqrt(datum.value / max) : 0;

      const rect = svgEl('rect', {
        class: 'heat-cell',
        x: labelW + c * cell + 1,
        y: cy + 1,
        width: cell - 2,
        height: cell - 2,
        rx: 3,
        fill: 'var(--accent)',
        'fill-opacity': datum.value ? 0.08 + intensity * 0.72 : 0.035,
      });

      interactive(rect, {
        label: `${row.label} · ${datum.colLabel}`,
        value: `${fmt.num(datum.value)} reports`,
        onPick: onPick ? () => onPick(datum) : null,
        ariaLabel: `${row.label}, ${datum.colLabel}: ${datum.value} reports`,
      });

      svg.appendChild(rect);
    });
  });

  return svg;
}

/* ── Legend ───────────────────────────────────────────────────────────────── */

/** Clickable legend. `onPick` receives the item, matching the chart's marks. */
export function legend(items, onPick) {
  return h(
    'div.chart-legend',
    {},
    items.map((item) =>
      h(
        'button',
        {
          type: 'button',
          'aria-pressed': 'true',
          on: onPick ? { click: () => onPick(item) } : {},
        },
        h('span.legend-swatch', { style: { background: item.color } }),
        item.label,
        item.value !== undefined ? h('span', { style: { color: 'var(--text-faint)' } }, fmt.num(item.value)) : null,
      ),
    ),
  );
}

export { hideTip };
