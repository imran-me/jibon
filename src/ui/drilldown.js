/**
 * Drill-down engine.
 *
 * The console's core rule: no number is a dead end. A KPI tile, a chart segment,
 * a legend swatch, a table cell and a heat-map square all funnel into the same
 * three entry points here, and each one answers the same questions — what does
 * this number mean, what is it made of, and which records produced it.
 *
 * Everything is recomputed from the analytics module against a narrowed slice,
 * so a drill-down can never drift out of sync with the tile that opened it.
 */

import { h, icon } from '../core/dom.js';
import { openDrawer, drawerSection, updateDrawerBody } from './drawer.js';
import { statGrid, rankList, deltaChip } from './kpi.js';
import { mountChart, areaChart, barChart, donutChart } from './charts.js';
import * as analytics from '../domain/analytics.js';
import * as selectors from '../domain/selectors.js';
import {
  getCategory, getWard, getChannel, getStatus, getSeverity,
  categoryColor, isCritical, isOpen, isBreached, CATEGORIES,
} from '../domain/taxonomy.js';
import { getState, setFilters, clearFilters } from '../core/store.js';
import * as fmt from '../core/format.js';
import { go } from '../core/router.js';
import { callGemini, isConfigured } from '../services/gemini.js';
import { EXPLAIN_SYSTEM, buildExplainParts } from '../services/prompts.js';
import { toastError } from './toast.js';

const SPARK_PATH = 'M12 2 15 9l7 1-5 5 1.5 7L12 18.5 5.5 22 7 15 2 10l7-1z';

/* ── Entry points ─────────────────────────────────────────────────────────── */

/**
 * Open the panel behind a headline KPI.
 * @param {object} kpi One entry from analytics.buildKpis().
 */
export function openKpiDrill(kpi) {
  const state = getState();
  const slice = selectors.filteredSignals(state);
  const subset = subsetForKpi(kpi.id, slice);
  const stats = analytics.metrics(subset);

  openDrawer({
    eyebrow: `Last ${state.range} days`,
    title: kpi.label,
    subtitle: kpi.hint,
    body: [
      headline(kpi),
      drawerSection('Composition', ...compositionFor(kpi.id, subset, stats)),
      trendSection(subset, state.range, kpi.label),
      breakdownSection(subset),
      recordsSection(subset, kpi.id),
    ],
    footer: [
      explainButton({ kind: 'kpi', kpi, stats, subset }),
      viewButton(filtersForKpi(kpi.id)),
    ],
  });
}

/**
 * Open the panel behind one facet value — a category, ward, channel, status or
 * severity. This is what chart segments and legend entries call.
 *
 * @param {string} field One of category|ward|channel|status|severity.
 * @param {string|number} id
 */
export function openFacetDrill(field, id) {
  const state = getState();
  const slice = selectors.filteredSignals(state);
  const subset = slice.filter((signal) => signal[field] === id);
  const stats = analytics.metrics(subset);
  const meta = describeFacet(field, id);
  const share = slice.length ? subset.length / slice.length : 0;

  const priorSlice = analytics.applyFilters(
    analytics.previousRange(state.signals, state.range),
    state.filters,
  ).filter((signal) => signal[field] === id);
  const prior = analytics.metrics(priorSlice);

  openDrawer({
    eyebrow: meta.eyebrow,
    title: meta.label,
    subtitle: meta.subtitle,
    body: [
      statGrid([
        { label: 'Reports', value: fmt.num(subset.length), sub: `${fmt.pct(share)} of current slice` },
        { label: 'Open', value: fmt.num(stats.open), sub: `${fmt.num(stats.criticalOpen)} critical` },
        {
          label: 'Median response',
          value: stats.medianResponse === null ? '—' : fmt.hours(stats.medianResponse),
          sub: meta.sla ? `${meta.sla}h target` : 'across all categories',
        },
        { label: 'Resolved', value: fmt.pct(stats.resolutionRate), sub: `${fmt.num(stats.resolved)} closed` },
        { label: 'SLA breach', value: fmt.pct(stats.breachRate), sub: `${fmt.num(stats.breached)} late` },
        { label: 'Duplicates', value: fmt.num(stats.duplicates), sub: fmt.pct(stats.duplicateRate) },
      ]),
      h(
        'div.row',
        {},
        h('span.text-dim', { style: { fontSize: 'var(--t-xs)' } }, 'Versus previous period'),
        deltaChip(prior.total ? (subset.length - prior.total) / prior.total : null),
      ),
      trendSection(subset, state.range, meta.label),
      breakdownSection(subset, field),
      recordsSection(subset),
    ],
    footer: [
      explainButton({ kind: 'facet', field, id, meta, stats, subset, share }),
      viewButton({ [facetKey(field)]: [id] }),
    ],
  });
}

/** Open the panel for a single day bucket. */
export function openDayDrill(ts, label = 'reports') {
  const state = getState();
  const dayStart = new Date(ts);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = dayStart.getTime() + 86_400_000;

  const subset = selectors
    .filteredSignals(state)
    .filter((signal) => signal.createdAt >= dayStart.getTime() && signal.createdAt < dayEnd);

  const stats = analytics.metrics(subset);

  openDrawer({
    eyebrow: fmt.asWeekday(ts),
    title: fmt.asFullDate(ts),
    subtitle: `${fmt.num(subset.length)} ${label} filed on this date`,
    body: [
      statGrid([
        { label: 'Reports', value: fmt.num(subset.length) },
        { label: 'Critical', value: fmt.num(subset.filter(isCritical).length) },
        { label: 'Still open', value: fmt.num(stats.open) },
        { label: 'Resolved', value: fmt.pct(stats.resolutionRate) },
      ]),
      drawerSection('By hour', chartHolder((width) =>
        barChart({
          data: analytics.hourHistogram(subset).map((bucket) => ({
            label: `${String(bucket.hour).padStart(2, '0')}`,
            value: bucket.value,
            color: 'var(--series-1)',
          })),
          width,
          height: 150,
          valueLabel: 'reports',
        }),
      )),
      breakdownSection(subset),
      recordsSection(subset),
    ],
    footer: [viewButton({}, 'Open in Reports')],
  });
}

/** Open a single report. */
export function openSignalDrill(signal) {
  if (!signal) return;

  const category = getCategory(signal.category);
  const ward = getWard(signal.ward);
  const response = analytics.responseHours(signal);
  const breached = isBreached(signal);
  const state = getState();

  // Sibling reports of the same kind in the same ward give the case context.
  const related = state.signals
    .filter((other) =>
      other.id !== signal.id &&
      other.category === signal.category &&
      other.ward === signal.ward &&
      Math.abs(other.createdAt - signal.createdAt) < 7 * 86_400_000)
    .slice(0, 6);

  openDrawer({
    eyebrow: `${signal.id} · ${getChannel(signal.channel).label}`,
    title: category.label,
    subtitle: `${ward.label}, Dhaka ${ward.zone} · ${fmt.asDateTime(signal.createdAt)}`,
    body: [
      h('blockquote', {
        style: {
          margin: '0',
          padding: 'var(--s-4)',
          background: 'var(--surface)',
          border: '1px solid var(--line)',
          borderLeft: `2px solid ${categoryColor(signal.category)}`,
          borderRadius: 'var(--r-md)',
          fontSize: 'var(--t-sm)',
          lineHeight: '1.7',
          color: 'var(--text)',
        },
      }, signal.text),

      statGrid([
        {
          label: 'Severity',
          value: `${getSeverity(signal.severity).short}`,
          sub: getSeverity(signal.severity).label,
          onPick: () => openFacetDrill('severity', signal.severity),
        },
        {
          label: 'Status',
          value: getStatus(signal.status).label,
          sub: signal.assignee ? `Officer ${signal.assignee}` : 'Unassigned',
          onPick: () => openFacetDrill('status', signal.status),
        },
        {
          label: 'Response',
          value: response === null ? 'Open' : fmt.hours(response),
          sub: `${category.sla}h target${breached ? ' · breached' : ''}`,
        },
        {
          label: 'Model confidence',
          value: fmt.pct(signal.confidence),
          sub: signal.autoTriaged ? 'Auto-triaged' : 'Human relabelled',
        },
      ]),

      drawerSection(
        'Routing',
        h(
          'div.stack.stack--tight',
          {},
          detailRow('Department', category.dept),
          detailRow('Ward', ward.label, () => openFacetDrill('ward', signal.ward)),
          detailRow('Category', category.label, () => openFacetDrill('category', signal.category)),
          detailRow('Channel', getChannel(signal.channel).label, () => openFacetDrill('channel', signal.channel)),
          detailRow('Landmark', signal.place),
          detailRow('Reporter', maskPhone(signal.reporter)),
          signal.duplicateOf
            ? detailRow('Merged into', signal.duplicateOf, () => {
                const parent = state.signals.find((other) => other.id === signal.duplicateOf);
                if (parent) openSignalDrill(parent);
              })
            : null,
        ),
      ),

      related.length
        ? drawerSection(
            `Nearby cases (${related.length})`,
            h('div.stack.stack--tight', {}, related.map((other) => signalRow(other))),
          )
        : null,
    ],
    footer: [
      explainButton({ kind: 'signal', signal }),
      h(
        'button.btn.btn--primary',
        {
          type: 'button',
          on: {
            click: () => {
              clearFilters();
              setFilters({ categories: [signal.category], wards: [signal.ward] });
              go('/signals');
            },
          },
        },
        'See all like this',
      ),
    ],
  });
}

/* ── Section builders ─────────────────────────────────────────────────────── */

function headline(kpi) {
  return h(
    'div',
    {},
    h(
      'div.row',
      { style: { alignItems: 'baseline', gap: 'var(--s-3)' } },
      h('span', {
        class: 'num',
        style: { fontSize: '2.5rem', fontWeight: '500', letterSpacing: '-0.035em' },
      }, kpi.display),
      deltaChip(kpi.delta, { inverse: kpi.inverse }),
    ),
    h('p.text-dim', { style: { fontSize: 'var(--t-xs)', marginTop: 'var(--s-2)' } }, kpi.hint),
  );
}

/** KPI-specific supporting numbers — each tile deserves its own second layer. */
function compositionFor(kpiId, subset, stats) {
  const byStatus = analytics.breakdown(subset, 'status');

  switch (kpiId) {
    case 'response': {
      const resolved = subset.filter((signal) => signal.status === 'resolved');
      return [
        statGrid([
          { label: 'Median', value: fmt.hours(stats.medianResponse) },
          { label: 'Mean', value: fmt.hours(stats.meanResponse) },
          { label: 'P90', value: fmt.hours(stats.p90Response) },
          { label: 'Sample', value: fmt.num(resolved.length), sub: 'resolved reports' },
        ]),
        chartHolder((width) =>
          barChart({
            data: analytics.responseHistogram(resolved).map((bucket) => ({
              label: bucket.label,
              value: bucket.value,
              color: 'var(--series-2)',
            })),
            width,
            height: 168,
            valueLabel: 'reports',
          }),
        ),
      ];
    }

    case 'breach': {
      const rows = analytics
        .categoryPerformance(subset)
        .map((row) => ({
          id: row.id,
          label: row.label,
          value: Math.round(row.breachRate * 100),
          share: row.breachRate,
          color: categoryColor(row.id),
        }))
        .sort((a, b) => b.value - a.value);

      return [
        statGrid([
          { label: 'Breached', value: fmt.num(stats.breached) },
          { label: 'Of total', value: fmt.pct(stats.breachRate) },
          { label: 'Still open', value: fmt.num(stats.open) },
        ]),
        h('p.text-dim', { style: { fontSize: 'var(--t-xs)' } }, 'Breach rate by category — worst first.'),
        rankList(rows, (row) => openFacetDrill('category', row.id), {
          max: 100,
          valueFormat: (value) => `${value}%`,
        }),
      ];
    }

    case 'triage': {
      const bands = [
        { id: 'high', label: 'High (≥90%)', test: (s) => s.confidence >= 0.9 },
        { id: 'mid', label: 'Moderate (70–90%)', test: (s) => s.confidence >= 0.7 && s.confidence < 0.9 },
        { id: 'low', label: 'Low (<70%)', test: (s) => s.confidence < 0.7 },
      ].map((band, i) => {
        const value = subset.filter(band.test).length;
        return {
          id: band.id,
          label: band.label,
          value,
          share: subset.length ? value / subset.length : 0,
          color: `var(--series-${i + 1})`,
        };
      });

      return [
        statGrid([
          { label: 'Auto-triaged', value: fmt.pct(stats.autoTriageRate) },
          { label: 'Mean confidence', value: fmt.pct(stats.meanConfidence) },
          { label: 'Needs review', value: fmt.num(subset.filter((s) => s.confidence < 0.7).length) },
        ]),
        h('p.text-dim', { style: { fontSize: 'var(--t-xs)' } }, 'Classification confidence distribution.'),
        rankList(bands),
      ];
    }

    case 'duplicates': {
      const clusters = new Map();
      for (const signal of subset.filter((s) => s.duplicateOf)) {
        clusters.set(signal.duplicateOf, (clusters.get(signal.duplicateOf) || 0) + 1);
      }
      const top = [...clusters.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([id, count]) => ({ id, label: id, value: count + 1, color: 'var(--series-3)' }));

      return [
        statGrid([
          { label: 'Merged', value: fmt.num(stats.duplicates) },
          { label: 'Clusters', value: fmt.num(clusters.size) },
          { label: 'Visits saved', value: fmt.num(Math.round(stats.duplicates * 0.75)), sub: 'estimated' },
        ]),
        h('p.text-dim', { style: { fontSize: 'var(--t-xs)' } }, 'Largest clusters — click to open the parent case.'),
        rankList(top, (row) => {
          const parent = getState().signals.find((signal) => signal.id === row.id);
          if (parent) openSignalDrill(parent);
        }, { valueFormat: (value) => `${value} reports` }),
      ];
    }

    default:
      return [
        statGrid([
          { label: 'Reports', value: fmt.num(stats.total) },
          { label: 'Open', value: fmt.num(stats.open) },
          { label: 'Critical', value: fmt.num(stats.critical) },
          { label: 'Reporters', value: fmt.num(stats.reporters) },
        ]),
        rankList(
          byStatus.map((row) => ({
            ...row,
            color: `var(--${getStatus(row.id).tone === 'accent' ? 'accent' : getStatus(row.id).tone})`,
          })),
          (row) => openFacetDrill('status', row.id),
        ),
      ];
  }
}

function trendSection(subset, range, label) {
  return drawerSection(
    'Trend',
    chartHolder((width) =>
      areaChart({
        points: analytics.dailyCounts(subset, range),
        width,
        height: 150,
        label,
        onPick: (point) => openDayDrill(point.ts),
      }),
    ),
  );
}

/** Category and ward splits, minus whichever field we already drilled into. */
function breakdownSection(subset, excludeField) {
  const panels = [];

  if (excludeField !== 'category') {
    const rows = analytics.breakdown(subset, 'category').slice(0, 6)
      .map((row) => ({ ...row, color: categoryColor(row.id) }));
    if (rows.length) {
      panels.push(drawerSection('By category', rankList(rows, (row) => openFacetDrill('category', row.id))));
    }
  }

  if (excludeField !== 'ward') {
    const rows = analytics.breakdown(subset, 'ward').slice(0, 6)
      .map((row, i) => ({ ...row, color: `var(--series-${(i % 8) + 1})` }));
    if (rows.length) {
      panels.push(drawerSection('By ward', rankList(rows, (row) => openFacetDrill('ward', row.id))));
    }
  }

  if (excludeField !== 'channel') {
    const rows = analytics.breakdown(subset, 'channel')
      .map((row, i) => ({ ...row, color: `var(--series-${(i % 8) + 1})` }));
    if (rows.length) {
      panels.push(drawerSection('By channel', rankList(rows, (row) => openFacetDrill('channel', row.id))));
    }
  }

  return panels;
}

/** The most urgent underlying records, so the panel bottoms out in real rows. */
function recordsSection(subset, kpiId) {
  const rows = [...subset]
    .sort((a, b) => b.severity - a.severity || b.createdAt - a.createdAt)
    .slice(0, 8);

  return drawerSection(
    `Contributing reports (${fmt.num(subset.length)})`,
    rows.length
      ? h('div.stack.stack--tight', {}, rows.map((signal) => signalRow(signal)))
      : h('p.text-dim', { style: { fontSize: 'var(--t-xs)' } }, 'No reports match this slice.'),
    subset.length > rows.length
      ? h('p.text-dim', { style: { fontSize: 'var(--t-micro)' } },
          `Showing the ${rows.length} most severe of ${fmt.num(subset.length)}.`)
      : null,
  );
}

/* ── Small parts ──────────────────────────────────────────────────────────── */

/** A compact, clickable report line, reused by feed, drawer and related lists. */
export function signalRow(signal) {
  const severity = getSeverity(signal.severity);

  return h(
    'button.feed__item',
    {
      type: 'button',
      style: { border: '1px solid var(--line)', borderRadius: 'var(--r-md)' },
      on: { click: () => openSignalDrill(signal) },
    },
    h('span.feed__rail', {}, h('span', { class: `dot sev-${signal.severity}` })),
    h(
      'span',
      {},
      h('span.feed__text', {}, signal.text),
      h(
        'span.feed__meta',
        {},
        h('span', {}, getCategory(signal.category).label),
        h('span.sep', {}, '·'),
        h('span', {}, getWard(signal.ward).label),
        h('span.sep', {}, '·'),
        h('span', { class: `status-${signal.status}` }, getStatus(signal.status).label),
        h('span.sep', {}, '·'),
        h('span', {}, severity.short),
        h('span.sep', {}, '·'),
        h('span', {}, fmt.relative(signal.createdAt)),
      ),
    ),
  );
}

function detailRow(label, value, onPick) {
  return h(
    'div.analysis__row',
    {},
    h('span.analysis__key', {}, label),
    onPick
      ? h('button.btn.btn--bare.btn--sm.analysis__val', { type: 'button', on: { click: onPick } }, value)
      : h('span.analysis__val', {}, value),
  );
}

/** Wrap a chart draw function in a container that mounts and resizes it. */
function chartHolder(draw) {
  const holder = h('div', { style: { width: '100%' } });
  // The drawer animates in; mounting on the next frame measures a settled width.
  requestAnimationFrame(() => mountChart(holder, draw));
  return holder;
}

function viewButton(filters, label = 'View in Reports') {
  return h(
    'button.btn.btn--ghost',
    {
      type: 'button',
      on: {
        click: () => {
          if (filters && Object.keys(filters).length) setFilters(filters);
          go('/signals');
        },
      },
    },
    label,
  );
}

/**
 * "Explain" runs the current panel's numbers through Gemini. Without a key it
 * falls back to a deterministic local explanation, so the button is never dead.
 */
function explainButton(context) {
  const button = h(
    'button.btn.btn--ghost',
    { type: 'button' },
    icon(SPARK_PATH, { size: 14 }),
    isConfigured() ? 'Explain' : 'Explain (local)',
  );

  button.addEventListener('click', async () => {
    button.disabled = true;
    const original = button.textContent;
    button.replaceChildren(h('span.spinner'), 'Analysing');

    try {
      const text = isConfigured()
        ? await callGemini({
            parts: buildExplainParts(payloadFor(context)),
            system: EXPLAIN_SYSTEM,
            temperature: 0.3,
            maxOutputTokens: 320,
          })
        : localExplanation(context);

      showExplanation(text, isConfigured());
    } catch (error) {
      toastError(error.message || 'Could not generate an explanation.');
      showExplanation(localExplanation(context), false);
    } finally {
      button.disabled = false;
      button.replaceChildren(icon(SPARK_PATH, { size: 14 }), original);
    }
  });

  return button;
}

function showExplanation(text, live) {
  const body = document.querySelector('.drawer__body');
  if (!body) return;

  const existing = body.querySelector('[data-explanation]');
  const node = h(
    'div.insight',
    { dataset: { explanation: 'true' } },
    h(
      'div',
      {},
      h('div.eyebrow', { style: { marginBottom: 'var(--s-2)' } }, live ? 'Gemini analysis' : 'Local analysis'),
      text,
    ),
  );

  if (existing) existing.replaceWith(node);
  else body.insertBefore(node, body.firstChild?.nextSibling || null);

  node.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

/** Compact JSON payload describing whatever the panel is showing. */
function payloadFor(context) {
  if (context.kind === 'signal') {
    const { signal } = context;
    return {
      metric: 'single_report',
      report: {
        id: signal.id,
        category: getCategory(signal.category).label,
        ward: getWard(signal.ward).label,
        severity: signal.severity,
        status: signal.status,
        text: signal.text,
        sla_hours: getCategory(signal.category).sla,
        response_hours: analytics.responseHours(signal),
        confidence: signal.confidence,
      },
    };
  }

  const base = {
    window_days: getState().range,
    totals: context.stats,
    by_category: analytics.breakdown(context.subset, 'category').map((row) => ({
      name: row.label, count: row.value, share: Number(row.share.toFixed(3)),
    })),
    by_ward: analytics.breakdown(context.subset, 'ward').slice(0, 5).map((row) => ({
      name: row.label, count: row.value,
    })),
  };

  return context.kind === 'kpi'
    ? { metric: context.kpi.label, value: context.kpi.display, change: context.kpi.delta, definition: context.kpi.hint, ...base }
    : { metric: `${context.field}: ${context.meta.label}`, share_of_slice: Number(context.share.toFixed(3)), ...base };
}

/**
 * Offline explanation.
 *
 * Assembled from the same computed statistics the model would receive, so the
 * demo tells a coherent story on a venue wifi with no connectivity at all.
 */
function localExplanation(context) {
  if (context.kind === 'signal') {
    const { signal } = context;
    const category = getCategory(signal.category);
    const response = analytics.responseHours(signal);

    return `${category.label} report from ${getWard(signal.ward).label}, graded severity ${signal.severity} ` +
      `with ${fmt.pct(signal.confidence)} classifier confidence. The ${category.dept} team owns it under a ` +
      `${category.sla}-hour target; ${response === null
        ? `it has been open for ${fmt.hours((Date.now() - signal.createdAt) / 3_600_000)}.`
        : `it closed in ${fmt.hours(response)}.`}`;
  }

  const { stats, subset } = context;
  const top = analytics.breakdown(subset, 'category')[0];
  const topWard = analytics.breakdown(subset, 'ward')[0];
  const label = context.kind === 'kpi' ? context.kpi.label : context.meta.label;

  const movement = context.kind === 'kpi' && context.kpi.delta !== null
    ? ` It moved ${fmt.signedPct(context.kpi.delta)} against the previous period, which is ` +
      `${(context.kpi.delta > 0) === Boolean(context.kpi.inverse) ? 'the wrong direction' : 'an improvement'}.`
    : '';

  return `${label} covers ${fmt.num(stats.total)} reports, of which ${fmt.num(stats.open)} are still open and ` +
    `${fmt.num(stats.criticalOpen)} are critical.${movement}` +
    (top ? ` ${top.label} is the largest contributor at ${fmt.pct(top.share)} of the slice` : '') +
    (topWard ? `, concentrated in ${topWard.label} (${fmt.num(topWard.value)} reports).` : '.') +
    (stats.medianResponse !== null
      ? ` Median response is ${fmt.hours(stats.medianResponse)} with ${fmt.pct(stats.breachRate)} of cases past their target.`
      : '');
}

/* ── Mapping helpers ──────────────────────────────────────────────────────── */

/** Narrow the slice to the rows a given KPI actually counts. */
function subsetForKpi(kpiId, slice) {
  switch (kpiId) {
    case 'open': return slice.filter(isOpen);
    case 'response': return slice.filter((signal) => signal.status === 'resolved');
    case 'critical': return slice.filter((signal) => isCritical(signal) && isOpen(signal));
    case 'breach': return slice.filter((signal) => isBreached(signal));
    case 'duplicates': return slice.filter((signal) => signal.duplicateOf);
    case 'resolution': return slice.filter((signal) => signal.status === 'resolved');
    default: return slice;
  }
}

/** The filter state that reproduces a KPI's slice in the Reports view. */
function filtersForKpi(kpiId) {
  switch (kpiId) {
    case 'open': return { statuses: ['new', 'triaged', 'assigned'] };
    case 'resolution': return { statuses: ['resolved'] };
    case 'response': return { statuses: ['resolved'] };
    case 'critical': return { severities: [4, 5], statuses: ['new', 'triaged', 'assigned'] };
    default: return {};
  }
}

const facetKey = (field) => ({
  category: 'categories',
  ward: 'wards',
  status: 'statuses',
  severity: 'severities',
  channel: 'channels',
}[field]);

function describeFacet(field, id) {
  switch (field) {
    case 'category': {
      const category = getCategory(id);
      return {
        eyebrow: 'Category',
        label: category.label,
        subtitle: `${category.dept} · ${category.sla}h resolution target`,
        sla: category.sla,
      };
    }
    case 'ward': {
      const ward = getWard(id);
      return {
        eyebrow: 'Ward',
        label: ward.label,
        subtitle: `Dhaka ${ward.zone} · ${fmt.num(ward.population)} residents`,
      };
    }
    case 'channel':
      return { eyebrow: 'Intake channel', label: getChannel(id).label, subtitle: 'How these reports reached the system' };
    case 'status':
      return { eyebrow: 'Workflow stage', label: getStatus(id).label, subtitle: 'Reports currently at this stage' };
    case 'severity': {
      const severity = getSeverity(id);
      return { eyebrow: `Severity ${severity.short}`, label: severity.label, subtitle: 'Urgency grade assigned at triage' };
    }
    default:
      return { eyebrow: field, label: String(id), subtitle: '' };
  }
}

/** Reporter numbers are shown partially masked; this is citizen PII. */
function maskPhone(value) {
  const text = String(value || '');
  return text.length > 6 ? `${text.slice(0, 6)}••••${text.slice(-2)}` : text;
}

/** Category composition donut, exported for the Overview view. */
export function categoryDonut(subset, width) {
  return donutChart({
    data: analytics.breakdown(subset, 'category').map((row) => ({
      ...row,
      color: categoryColor(row.id),
    })),
    width,
    height: 240,
    centerLabel: 'Reports',
    onPick: (row) => openFacetDrill('category', row.id),
    onCenterPick: () => {
      const kpis = selectors.currentKpis();
      openKpiDrill(kpis[0]);
    },
  });
}

export { CATEGORIES, updateDrawerBody };
