/**
 * KPI tile.
 *
 * Every tile is a button. The rule across this console is that a number on
 * screen is never a dead end — clicking one opens the drill-down that explains
 * where it came from, so the tile carries the affordance rather than a separate
 * "details" link.
 */

import { h, icon } from '../core/dom.js';
import { sparkline } from './charts.js';
import * as fmt from '../core/format.js';

const CHEVRON = 'm9 18 6-6-6-6';
const ARROW_UP = 'M12 19V5M5 12l7-7 7 7';
const ARROW_DOWN = 'M12 5v14M19 12l-7 7-7-7';

/**
 * Delta chip. `inverse` flips the colour semantics for metrics where a rise is
 * bad (open cases, breach rate) so green always means "good".
 */
export function deltaChip(delta, { inverse = false, suffix = 'vs prev.' } = {}) {
  if (delta === null || delta === undefined || !Number.isFinite(delta)) {
    return h('span.delta.delta--flat', { title: 'No comparable previous period' }, '—');
  }

  const flat = Math.abs(delta) < 0.005;
  const direction = flat ? 'flat' : delta > 0 ? 'up' : 'down';

  return h(
    `span.delta.delta--${direction}${inverse && !flat ? '.delta--inverse' : ''}`,
    { title: `${fmt.signedPct(delta)} ${suffix}` },
    flat ? null : icon(direction === 'up' ? ARROW_UP : ARROW_DOWN, { size: 11, stroke: 2 }),
    flat ? 'flat' : fmt.signedPct(delta),
  );
}

/**
 * @param {object} kpi     One entry from analytics.buildKpis().
 * @param {Function} onPick Called with the kpi when the tile is activated.
 */
export function kpiTile(kpi, onPick) {
  return h(
    'button.kpi',
    {
      type: 'button',
      dataset: { kpi: kpi.id },
      'aria-label': `${kpi.label}: ${kpi.display}. Open breakdown.`,
      title: kpi.hint,
      on: { click: () => onPick?.(kpi) },
    },
    h(
      'div.kpi__head',
      {},
      h('span.kpi__label', {}, kpi.label),
      h('span.kpi__chev', {}, icon(CHEVRON, { size: 14 })),
    ),
    h('div.kpi__value', {}, kpi.display, kpi.unit ? h('span.kpi__unit', {}, kpi.unit) : null),
    h(
      'div.kpi__foot',
      {},
      deltaChip(kpi.delta, { inverse: kpi.inverse }),
      kpi.spark?.length
        ? h('div.kpi__spark', {}, sparkline(kpi.spark, {
            width: 96,
            height: 22,
            color: kpi.inverse ? 'var(--text-dim)' : 'var(--accent)',
          }))
        : null,
    ),
  );
}

/** The full KPI grid. */
export function kpiGrid(kpis, onPick) {
  return h('div.grid.grid--kpi', {}, kpis.map((kpi) => kpiTile(kpi, onPick)));
}

/**
 * Compact stat used inside drawers. Clickable when `onPick` is supplied, in
 * which case it renders as a button so keyboard users get it too.
 */
export function stat({ label, value, sub, onPick, title }) {
  const props = {
    title,
    ...(onPick ? { type: 'button', on: { click: onPick } } : {}),
  };

  return h(
    onPick ? 'button.stat' : 'div.stat',
    props,
    h('span.stat__label', {}, label),
    h('span.stat__value', {}, value),
    sub ? h('span.stat__sub', {}, sub) : null,
  );
}

export const statGrid = (items) => h('div.stats', {}, items.map(stat));

/**
 * Ranked bar list — the workhorse of every breakdown panel.
 *
 * @param {Array<{id,label,value,share,color?}>} rows
 * @param {Function} [onPick]
 */
export function rankList(rows, onPick, { max, valueFormat = fmt.num, emptyLabel = 'No data in this slice.' } = {}) {
  if (!rows.length) return h('p.text-dim', { style: { fontSize: 'var(--t-xs)' } }, emptyLabel);

  const ceiling = max ?? Math.max(...rows.map((row) => row.value), 1);

  return h(
    'div.rank',
    {},
    rows.map((row) =>
      h(
        onPick ? 'button.rank__row' : 'div.rank__row',
        {
          ...(onPick ? { type: 'button', on: { click: () => onPick(row) } } : {}),
          title: onPick ? `Filter reports by ${row.label}` : undefined,
        },
        h(
          'span.rank__label',
          {},
          h('span.dot', { style: { background: row.color || 'var(--series-1)' } }),
          h('span', {}, row.label),
        ),
        h(
          'span.rank__value',
          {},
          valueFormat(row.value),
          row.share !== undefined ? h('span.rank__pct', {}, fmt.pct(row.share)) : null,
        ),
        h(
          'span.meter.rank__track',
          {},
          h('span.meter__fill', {
            style: { width: `${(row.value / ceiling) * 100}%`, background: row.color || 'var(--accent)' },
          }),
        ),
      ),
    ),
  );
}
