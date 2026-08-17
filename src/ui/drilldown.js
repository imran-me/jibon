/**
 * Drill-down engine.
 *
 * The rule this file enforces: no number in the console is a dead end. A KPI
 * tile, a chart segment, a legend entry, a facility row and a timeline event all
 * funnel through here, and each opens a panel answering the same three
 * questions — what does this mean, what is it made of, and which cases produced it.
 *
 * Every panel recomputes from the analytics module against a narrowed slice, so
 * a drill-down can never disagree with the tile that opened it.
 */

import { h } from '../core/dom.js';
import { icon } from './icons.js';
import { openDrawer, drawerSection } from './drawer.js';
import { statGrid, rankList, deltaChip } from './kpi.js';
import { mountChart, areaChart, barChart } from './charts.js';
import {
  emergencyBrief, timeline, equipmentManifest, routePlan, timingStats,
  incidentRow, priorityBadge, provenanceBadge, prepPill, windowMeter,
} from './incident.js';
import * as analytics from '../domain/analytics.js';
import * as selectors from '../domain/selectors.js';
import {
  getType, getPriority, getStage, getChannel, priorityColor, typeColor, isCritical,
} from '../domain/taxonomy.js';
import { getFacility, FACILITIES, requiredCapabilities, CAPABILITY_TAGS } from '../domain/network.js';
import { isActiveIncident, decisionMinutes, responseMinutes, totalMinutes } from '../domain/incidents.js';
import { firstAidFor, hospitalPrepFor } from '../domain/protocols.js';
import { getState, setFilters, clearFilters, commitIncident } from '../core/store.js';
import * as fmt from '../core/format.js';
import { go } from '../core/router.js';
import { callGemini, isConfigured } from '../services/gemini.js';
import { EXPLAIN_SYSTEM, buildExplainParts } from '../services/prompts.js';
import { toastError, toastOk } from './toast.js';

/* ── Case panel ───────────────────────────────────────────────────────────── */

/**
 * The full case. This is what opens from every case row, and it is the screen a
 * responder joining an emergency would actually work from.
 */
export function openIncident(incident) {
  if (!incident) return;

  const definition = getType(incident.type);
  const guidance = firstAidFor(incident.type);

  openDrawer({
    eyebrow: `${incident.id} · ${getChannel(incident.channel).label}`,
    title: definition.label,
    subtitle: `${incident.origin.label}, ${incident.origin.district} · raised ${fmt.relative(incident.createdAt)}`,
    body: [
      windowMeter(incident),
      emergencyBrief(incident, { onFacetClick: openFacetDrill }),
      drawerSection('Timings', timingStats(incident, { onPick: (row) => openTimingDrill(row, incident) })),
      drawerSection('Route plan', routePlan(incident, {
        onFacility: openFacilityDrill,
        onExplain: () => explainRoute(incident),
      })),
      drawerSection(
        'Equipment manifest',
        h('p.text-dim', { style: { fontSize: 'var(--t-xs)' } },
          'Proposed for this classification. The crew confirms — the platform does not decide.'),
        equipmentManifest(incident, {
          interactive: true,
          onToggle: (item) => {
            incident.equipment = incident.equipment.map((entry) =>
              entry.id === item.id ? { ...entry, confirmed: !entry.confirmed } : entry);
            commitIncident(incident);
            openIncident(incident);
          },
        }),
      ),
      drawerSection(
        'Bystander guidance',
        h('p', { style: { fontSize: 'var(--t-sm)', color: 'var(--text)', fontWeight: '500' } }, guidance.headline),
        h('ol.stack.stack--tight', { style: { fontSize: 'var(--t-sm)', color: 'var(--text-mid)' } },
          guidance.steps.map((step, index) =>
            h('li', { style: { display: 'flex', gap: 'var(--s-3)' } },
              h('span.mono.text-faint', { style: { fontSize: 'var(--t-xs)' } }, String(index + 1).padStart(2, '0')),
              h('span', {}, step)))),
        h('div.brief__missing', { style: { borderColor: 'var(--neg)', background: 'var(--neg-soft)' } },
          h('div.eyebrow', { style: { marginBottom: 'var(--s-2)' } }, 'Do not'),
          h('ul', {}, guidance.avoid.map((item) => h('li', {}, item)))),
      ),
      drawerSection('Hospital preparation', hospitalPrepList(incident)),
      drawerSection('Timeline', timeline(incident, { onSelect: openTimelineEntry })),
    ],
    footer: [
      explainButton({ kind: 'incident', incident }),
      h('button.btn.btn--primary', {
        type: 'button',
        on: {
          click: () => {
            clearFilters();
            setFilters({ types: [incident.type] });
            go('/incidents');
          },
        },
      }, 'All cases like this'),
    ],
  });
}

function hospitalPrepList(incident) {
  const items = hospitalPrepFor(incident.type);
  const destination = incident.route ? getFacility(incident.route.destinationId) : null;

  return h(
    'div.stack.stack--tight',
    {},
    destination
      ? h('div.row.row--between', {},
          h('span', { style: { fontSize: 'var(--t-sm)' } }, destination.name),
          prepPill(incident.prep?.[destination.id]))
      : null,
    h('ul.manifest', {}, items.map((item) =>
      h('li.manifest__item', {},
        h('span.manifest__dot', { style: { background: item.critical ? 'var(--neg)' : 'var(--text-faint)' } }),
        h('span.manifest__label', {}, item.label),
        item.critical ? h('span.badge.badge--neg', {}, 'Critical') : null))),
    h('p.text-dim', { style: { fontSize: 'var(--t-micro)' } },
      'A checklist for the receiving team to confirm. Not a treatment instruction.'),
  );
}

/** One timeline event, with its provenance and what it changed. */
export function openTimelineEntry(entry, incident) {
  openDrawer({
    eyebrow: `${incident.id} · ${fmt.asClock(entry.at)}`,
    title: entry.label,
    subtitle: `Logged by ${entry.actor} · ${fmt.asFullDate(entry.at)}`,
    body: [
      statGrid([
        { label: 'Time', value: fmt.asClock(entry.at) },
        { label: 'Since call', value: fmt.minutes(Math.max(0, (entry.at - incident.createdAt) / 60_000)) },
        { label: 'Actor', value: entry.actor },
      ]),
      entry.detail
        ? h('div.insight', {}, h('div', {}, entry.detail))
        : h('p.text-dim', { style: { fontSize: 'var(--t-xs)' } }, 'No additional detail recorded.'),
      drawerSection('Full timeline', timeline(incident, { onSelect: openTimelineEntry })),
    ],
    footer: [
      h('button.btn.btn--ghost', { type: 'button', on: { click: () => openIncident(incident) } }, 'Back to case'),
    ],
  });
}

/** A timing interval, explained and compared against the rest of the period. */
function openTimingDrill(row, incident) {
  const slice = selectors.filteredIncidents();
  const measure = { decision: decisionMinutes, response: responseMinutes, total: totalMinutes }[row.id];

  if (!measure) {
    openIncident(incident);
    return;
  }

  const values = slice.map(measure).filter(Number.isFinite);
  const thisValue = measure(incident);
  const better = values.filter((value) => value < thisValue).length;

  openDrawer({
    eyebrow: incident.id,
    title: row.label,
    subtitle: 'This case measured against every case in the current period',
    body: [
      statGrid([
        { label: 'This case', value: thisValue === null ? '—' : fmt.minutes(thisValue) },
        { label: 'Period median', value: fmt.minutes(analytics.median(values)) },
        { label: 'Period P90', value: fmt.minutes(analytics.percentile(values, 0.9)) },
        {
          label: 'Percentile',
          value: values.length ? fmt.pct(better / values.length) : '—',
          sub: 'faster than',
        },
      ]),
      drawerSection('Distribution', chartHolder((width) =>
        barChart({
          data: histogram(values).map((bucket) => ({
            label: bucket.label,
            value: bucket.value,
            color: 'var(--series-2)',
          })),
          width,
          height: 160,
          valueLabel: 'cases',
        }))),
      drawerSection('Trend', chartHolder((width) =>
        areaChart({
          points: analytics.dailyMedian(slice, measure, getState().range),
          width,
          height: 150,
          label: 'minutes',
          onPick: (point) => openDayDrill(point.ts),
        }))),
    ],
    footer: [h('button.btn.btn--ghost', { type: 'button', on: { click: () => openIncident(incident) } }, 'Back to case')],
  });
}

function histogram(values) {
  const edges = [0, 1, 2, 5, 10, 20, 45, 90, Infinity];
  const labels = ['<1m', '1–2m', '2–5m', '5–10m', '10–20m', '20–45m', '45–90m', '90m+'];
  const buckets = labels.map((label) => ({ label, value: 0 }));

  for (const value of values) {
    const index = edges.findIndex((edge, i) => value >= edge && value < edges[i + 1]);
    if (index > -1) buckets[index].value += 1;
  }
  return buckets;
}

/* ── KPI panel ────────────────────────────────────────────────────────────── */

export function openKpiDrill(kpi) {
  const state = getState();
  const slice = selectors.filteredIncidents(state);
  const subset = subsetForKpi(kpi.id, slice);
  const stats = analytics.metrics(subset);

  openDrawer({
    eyebrow: `Last ${state.range} days`,
    title: kpi.label,
    subtitle: kpi.hint,
    body: [
      headline(kpi),
      drawerSection('Composition', ...compositionFor(kpi.id, subset, stats)),
      drawerSection('Trend', chartHolder((width) =>
        areaChart({
          points: analytics.dailyCounts(subset, state.range),
          width,
          height: 150,
          label: 'cases',
          onPick: (point) => openDayDrill(point.ts),
        }))),
      ...breakdownSections(subset),
      casesSection(subset),
    ],
    footer: [
      explainButton({ kind: 'kpi', kpi, stats, subset }),
      viewButton(filtersForKpi(kpi.id)),
    ],
  });
}

function headline(kpi) {
  return h(
    'div',
    {},
    h('div.row', { style: { alignItems: 'baseline', gap: 'var(--s-3)' } },
      h('span.num', { style: { fontSize: '2.5rem', fontWeight: '500', letterSpacing: '-0.035em' } }, kpi.display),
      deltaChip(kpi.delta, { inverse: kpi.inverse })),
    h('p.text-dim', { style: { fontSize: 'var(--t-xs)', marginTop: 'var(--s-2)' } }, kpi.hint),
  );
}

function compositionFor(kpiId, subset, stats) {
  switch (kpiId) {
    case 'decision':
    case 'response': {
      const measure = kpiId === 'decision' ? decisionMinutes : responseMinutes;
      const values = subset.map(measure).filter(Number.isFinite);
      const comparison = analytics.modeComparison(subset);

      return [
        statGrid([
          { label: 'Median', value: fmt.minutes(analytics.median(values)) },
          { label: 'Mean', value: fmt.minutes(analytics.mean(values)) },
          { label: 'P90', value: fmt.minutes(analytics.percentile(values, 0.9)) },
          { label: 'Sample', value: fmt.num(values.length), sub: 'cases' },
        ]),
        modeCompareBlock(comparison, kpiId === 'decision' ? 'decision' : 'response'),
        chartHolder((width) => barChart({
          data: histogram(values).map((bucket) => ({ ...bucket, color: 'var(--series-2)' })),
          width, height: 160, valueLabel: 'cases',
        })),
      ];
    }

    case 'preparing': {
      const rows = analytics.facilityLoad(subset).map((row, i) => ({
        id: row.id,
        label: row.label,
        value: row.active,
        share: row.value ? row.active / row.value : 0,
        color: `var(--series-${(i % 8) + 1})`,
      })).filter((row) => row.value > 0);

      return [
        statGrid([
          { label: 'Facilities engaged', value: fmt.num(stats.facilitiesPreparing) },
          { label: 'Cases in transit', value: fmt.num(stats.transporting) },
          { label: 'Relay legs', value: fmt.num(subset.filter((i) => i.route?.relayIds?.length).length) },
        ]),
        h('p.text-dim', { style: { fontSize: 'var(--t-xs)' } }, 'Active inbound cases per facility.'),
        rankList(rows, (row) => openFacilityDrill(getFacility(row.id))),
      ];
    }

    case 'lead': {
      const comparison = analytics.modeComparison(subset);
      return [
        statGrid([
          { label: 'Mean lead', value: fmt.minutes(stats.preArrivalLead) },
          { label: 'Conventional', value: fmt.minutes(comparison.baseline.lead || 0), sub: 'zero by definition' },
          { label: 'Coordinated', value: fmt.minutes(comparison.jibon.lead) },
        ]),
        h('div.insight', {}, h('div', {},
          'In the conventional chain this number is zero: the hospital learns about the patient when the ' +
          'ambulance doors open. Every minute here is preparation that used to happen after arrival.')),
        modeCompareBlock(comparison, 'lead'),
      ];
    }

    case 'window': {
      const rows = analytics.typePerformance(subset).map((row) => ({
        id: row.id,
        label: row.label,
        value: Math.round(row.withinWindow * 100),
        share: row.withinWindow,
        color: typeColor(row.id),
      })).sort((a, b) => a.value - b.value);

      return [
        statGrid([
          { label: 'Within window', value: fmt.pct(stats.withinWindow) },
          { label: 'Mean consumed', value: fmt.pct(stats.windowConsumed) },
          { label: 'Survival index', value: fmt.dec((stats.survivalIndex || 0) * 100) },
        ]),
        h('p.text-dim', { style: { fontSize: 'var(--t-xs)' } },
          'Share of cases handed over inside the clinical time budget, worst pathway first.'),
        rankList(rows, (row) => openFacetDrill('type', row.id), {
          max: 100, valueFormat: (value) => `${value}%`,
        }),
      ];
    }

    case 'critical':
    case 'active':
    case 'transit':
    default: {
      const byPriority = analytics.breakdown(subset, 'priority').map((row) => ({
        ...row, color: priorityColor(row.id),
      }));

      return [
        statGrid([
          { label: 'Cases', value: fmt.num(stats.total) },
          { label: 'Active', value: fmt.num(stats.active) },
          { label: 'Critical', value: fmt.num(stats.criticalActive) },
          { label: 'Patients', value: fmt.num(stats.patients) },
        ]),
        rankList(byPriority, (row) => openFacetDrill('priority', row.id)),
      ];
    }
  }
}

/** Conventional versus coordinated, as a small comparison table. */
function modeCompareBlock(comparison, metric) {
  const format = metric === 'equipment' || metric === 'withinWindow' ? fmt.pct : fmt.minutes;
  const label = {
    decision: 'Call → dispatch',
    response: 'Dispatch → patient',
    total: 'End to end',
    lead: 'Pre-arrival lead',
    equipment: 'Equipment matched',
    withinWindow: 'Within window',
  }[metric] || metric;

  const baseline = comparison.baseline[metric];
  const jibon = comparison.jibon[metric];

  return h(
    'div.compare',
    {},
    h('div.compare__cell.compare__cell--head', {}, 'Metric'),
    h('div.compare__cell.compare__cell--head', {}, 'Conventional'),
    h('div.compare__cell.compare__cell--head', {}, 'Coordinated'),
    h('div.compare__cell.compare__cell--head', {}, 'Δ'),
    h('div.compare__cell.compare__cell--metric', {}, label),
    h('div.compare__cell.compare__cell--value', {}, format(baseline)),
    h('div.compare__cell.compare__cell--value.compare__cell--jibon', {}, format(jibon)),
    h('div.compare__cell.compare__cell--value', {},
      deltaChip(comparison.deltas[metric], { inverse: metric === 'decision' || metric === 'response' || metric === 'total' })),
  );
}

/* ── Facet panel ──────────────────────────────────────────────────────────── */

export function openFacetDrill(field, id) {
  const state = getState();
  const slice = selectors.filteredIncidents(state);
  const read = (incident) => (field === 'district' ? incident.origin.district : incident[field]);
  const subset = slice.filter((incident) => read(incident) === id);
  const stats = analytics.metrics(subset);
  const meta = describeFacet(field, id);
  const share = slice.length ? subset.length / slice.length : 0;

  openDrawer({
    eyebrow: meta.eyebrow,
    title: meta.label,
    subtitle: meta.subtitle,
    body: [
      statGrid([
        { label: 'Cases', value: fmt.num(subset.length), sub: `${fmt.pct(share)} of period` },
        { label: 'Active', value: fmt.num(stats.active), sub: `${fmt.num(stats.criticalActive)} critical` },
        { label: 'Call → dispatch', value: fmt.minutes(stats.medianDecision) },
        { label: 'End to end', value: fmt.minutes(stats.medianTotal) },
        { label: 'Within window', value: fmt.pct(stats.withinWindow) },
        { label: 'Equipment match', value: fmt.pct(stats.equipmentMatchRate) },
      ]),
      meta.extra ? meta.extra() : null,
      drawerSection('Trend', chartHolder((width) =>
        areaChart({
          points: analytics.dailyCounts(subset, state.range),
          width, height: 150, label: 'cases',
          onPick: (point) => openDayDrill(point.ts),
        }))),
      ...breakdownSections(subset, field),
      casesSection(subset),
    ],
    footer: [
      explainButton({ kind: 'facet', field, id, meta, stats, subset, share }),
      viewButton({ [facetKey(field)]: [id] }),
    ],
  });
}

/* ── Facility panel ───────────────────────────────────────────────────────── */

/** A hospital: what it can do, what is inbound, and how ready it is. */
export function openFacilityDrill(facility) {
  if (!facility) return;

  const slice = selectors.filteredIncidents();
  const inbound = slice.filter((incident) => incident.route?.destinationId === facility.id);
  const relaying = slice.filter((incident) => incident.route?.relayIds?.includes(facility.id));
  const active = inbound.filter(isActiveIncident);
  const stats = analytics.metrics(inbound);

  openDrawer({
    eyebrow: `Tier ${facility.tier} · ${facility.district}`,
    title: facility.name,
    subtitle: facility.note,
    body: [
      statGrid([
        { label: 'Inbound', value: fmt.num(inbound.length) },
        { label: 'Active now', value: fmt.num(active.length) },
        { label: 'Relay legs', value: fmt.num(relaying.length) },
        { label: 'Beds', value: fmt.num(facility.beds) },
      ]),

      drawerSection(
        'Capabilities',
        h('div.row.row--wrap', {}, facility.capabilities.map((tag) =>
          h('span.chip', { title: CAPABILITY_TAGS[tag] || tag }, CAPABILITY_TAGS[tag] || tag))),
      ),

      active.length
        ? drawerSection(
            `Preparing for (${active.length})`,
            h('div.stack.stack--tight', {}, active.slice(0, 6).map((incident) =>
              h('div.row.row--between', { style: { gap: 'var(--s-3)' } },
                h('span', { style: { flex: '1', minWidth: '0' } },
                  incidentRow(incident, { onOpen: openIncident, compact: true })),
                prepPill(incident.prep?.[facility.id])))),
          )
        : null,

      relaying.length
        ? drawerSection(
            `Relay role (${relaying.length})`,
            h('p.text-dim', { style: { fontSize: 'var(--t-xs)' } },
              'Cases passing through where this facility hands supplies or a clinician to the ambulance ' +
              'without admitting the patient.'),
            h('div.stack.stack--tight', {}, relaying.slice(0, 5).map((incident) =>
              incidentRow(incident, { onOpen: openIncident, compact: true }))),
          )
        : null,

      inbound.length
        ? drawerSection('Case mix', rankList(
            analytics.breakdown(inbound, 'type').map((row) => ({ ...row, color: typeColor(row.id) })),
            (row) => openFacetDrill('type', row.id),
          ))
        : null,
    ],
    footer: [
      explainButton({ kind: 'facility', facility, stats, subset: inbound }),
      h('button.btn.btn--ghost', { type: 'button', on: { click: () => go('/hospitals') } }, 'Hospital board'),
    ],
  });
}

/* ── Day panel ────────────────────────────────────────────────────────────── */

export function openDayDrill(ts) {
  const dayStart = new Date(ts);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = dayStart.getTime() + 86_400_000;

  const subset = selectors
    .filteredIncidents()
    .filter((incident) => incident.createdAt >= dayStart.getTime() && incident.createdAt < dayEnd);

  const stats = analytics.metrics(subset);

  openDrawer({
    eyebrow: fmt.asWeekday(ts),
    title: fmt.asFullDate(ts),
    subtitle: `${fmt.num(subset.length)} emergencies raised on this date`,
    body: [
      statGrid([
        { label: 'Cases', value: fmt.num(subset.length) },
        { label: 'Critical', value: fmt.num(subset.filter(isCritical).length) },
        { label: 'Call → dispatch', value: fmt.minutes(stats.medianDecision) },
        { label: 'Within window', value: fmt.pct(stats.withinWindow) },
      ]),
      drawerSection('By hour', chartHolder((width) =>
        barChart({
          data: analytics.hourHistogram(subset).map((bucket) => ({
            label: String(bucket.hour).padStart(2, '0'),
            value: bucket.value,
            color: 'var(--series-1)',
          })),
          width, height: 150, valueLabel: 'cases',
        }))),
      ...breakdownSections(subset),
      casesSection(subset),
    ],
    footer: [viewButton({}, 'Open case list')],
  });
}

/* ── Shared sections ──────────────────────────────────────────────────────── */

function breakdownSections(subset, exclude) {
  const panels = [];

  const add = (field, title, colorFor) => {
    if (exclude === field) return;
    const rows = analytics.breakdown(subset, field).slice(0, 6)
      .map((row, i) => ({ ...row, color: colorFor ? colorFor(row.id) : `var(--series-${(i % 8) + 1})` }));
    if (rows.length) panels.push(drawerSection(title, rankList(rows, (row) => openFacetDrill(field, row.id))));
  };

  add('type', 'By emergency type', typeColor);
  add('priority', 'By priority', priorityColor);
  add('district', 'By district');
  add('channel', 'By intake channel');

  return panels;
}

function casesSection(subset) {
  const priorityOrder = { P1: 0, P2: 1, P3: 2, P4: 3 };
  const rows = [...subset]
    .sort((a, b) => (priorityOrder[a.priority] ?? 9) - (priorityOrder[b.priority] ?? 9) || b.createdAt - a.createdAt)
    .slice(0, 8);

  return drawerSection(
    `Cases (${fmt.num(subset.length)})`,
    rows.length
      ? h('div.stack.stack--tight', {}, rows.map((incident) => incidentRow(incident, { onOpen: openIncident })))
      : h('p.text-dim', { style: { fontSize: 'var(--t-xs)' } }, 'No cases in this slice.'),
    subset.length > rows.length
      ? h('p.text-dim', { style: { fontSize: 'var(--t-micro)' } },
          `Showing the ${rows.length} most urgent of ${fmt.num(subset.length)}.`)
      : null,
  );
}

function chartHolder(draw) {
  const holder = h('div', { style: { width: '100%' } });
  // The drawer animates in; mounting next frame measures a settled width.
  requestAnimationFrame(() => mountChart(holder, draw));
  return holder;
}

function viewButton(filters, label = 'View in case list') {
  return h('button.btn.btn--ghost', {
    type: 'button',
    on: {
      click: () => {
        if (filters && Object.keys(filters).length) setFilters(filters);
        go('/incidents');
      },
    },
  }, label);
}

/* ── Explanations ─────────────────────────────────────────────────────────── */

/**
 * "Explain" runs the panel's own numbers through Gemini. With no key it falls
 * back to a deterministic local explanation built from the same figures, so the
 * button is never dead and the demo never depends on the venue wifi.
 */
function explainButton(context) {
  const button = h('button.btn.btn--ghost', { type: 'button' },
    icon('spark', { size: 13 }),
    isConfigured() ? 'Explain' : 'Explain (offline)');

  button.addEventListener('click', async () => {
    button.disabled = true;
    button.replaceChildren(h('span.spinner'), 'Analysing');

    try {
      const text = isConfigured()
        ? await callGemini({
            parts: buildExplainParts(payloadFor(context)),
            system: EXPLAIN_SYSTEM,
            temperature: 0.3,
            maxOutputTokens: 400,
          })
        : localExplanation(context);
      showExplanation(text, isConfigured());
    } catch (error) {
      toastError(error.message || 'Could not generate an explanation.');
      showExplanation(localExplanation(context), false);
    } finally {
      button.disabled = false;
      button.replaceChildren(icon('spark', { size: 13 }), isConfigured() ? 'Explain' : 'Explain (offline)');
    }
  });

  return button;
}

/** "Why this hospital?" — the routing decision, with the rejected options named. */
async function explainRoute(incident) {
  if (!incident.route) return;

  const destination = getFacility(incident.route.destinationId);
  const payload = {
    question: 'Why was this hospital selected?',
    emergency_type: getType(incident.type).label,
    clinical_window_minutes: getType(incident.type).window,
    chosen: {
      name: destination?.name,
      travel_minutes: incident.route.directMinutes,
      capability_coverage: incident.route.coverage,
      capabilities_required: incident.route.rationale.required,
      capabilities_satisfied: incident.route.rationale.satisfied,
      capabilities_missing: incident.route.rationale.unsatisfied,
    },
    nearer_options_rejected: incident.route.rationale.nearestRejected,
    relays: incident.route.rationale.relayJustification,
    alternatives: incident.route.alternatives,
  };

  const local = () => {
    const rejected = incident.route.rationale.nearestRejected;
    const relays = incident.route.rationale.relayJustification;
    return `${destination?.name} was chosen because it holds every capability this case needs — ` +
      `${incident.route.rationale.satisfied.map((tag) => CAPABILITY_TAGS[tag] || tag).join(', ')} — ` +
      `at ${incident.route.directMinutes} minutes' travel. ` +
      (rejected.length
        ? `${rejected[0].name} is closer at ${rejected[0].minutes} minutes but lacks ` +
          `${rejected[0].missing.map((tag) => CAPABILITY_TAGS[tag] || tag).join(' and ')}, so arriving there sooner ` +
          `would only delay definitive treatment. `
        : '') +
      (relays.length
        ? `${relays[0].name} sits ${relays[0].detourPercent}% off the direct route and is reached in ` +
          `${relays[0].reachedInMinutes} minutes, so it is prepared as a relay to raise the level of care in transit.`
        : 'No suitable relay point sits on this route.');
  };

  try {
    const text = isConfigured()
      ? await callGemini({
          parts: buildExplainParts(payload),
          system: EXPLAIN_SYSTEM,
          temperature: 0.3,
          maxOutputTokens: 400,
        })
      : local();
    showExplanation(text, isConfigured());
  } catch {
    showExplanation(local(), false);
  }
}

function showExplanation(text, live) {
  const body = document.querySelector('.drawer__body');
  if (!body) return;

  const node = h('div.insight', { dataset: { explanation: 'true' } },
    h('div', {},
      h('div.eyebrow', { style: { marginBottom: 'var(--s-2)' } }, live ? 'Gemini analysis' : 'Offline analysis'),
      text));

  const existing = body.querySelector('[data-explanation]');
  if (existing) existing.replaceWith(node);
  else body.insertBefore(node, body.firstChild);

  node.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function payloadFor(context) {
  if (context.kind === 'incident') {
    const { incident } = context;
    return {
      metric: 'single_case',
      case: {
        id: incident.id,
        type: getType(incident.type).label,
        priority: incident.priority,
        stage: incident.stage,
        location: `${incident.origin.label}, ${incident.origin.district}`,
        patients: incident.patients,
        confidence: incident.confidence,
        verified: Boolean(incident.verifiedBy),
        call_to_dispatch_minutes: decisionMinutes(incident),
        dispatch_to_patient_minutes: responseMinutes(incident),
        end_to_end_minutes: totalMinutes(incident),
        clinical_window_minutes: getType(incident.type).window,
        facts: incident.facts.map((entry) => ({ label: entry.label, value: entry.value, source: entry.source })),
      },
    };
  }

  if (context.kind === 'facility') {
    return {
      metric: 'facility',
      facility: {
        name: context.facility.name,
        tier: context.facility.tier,
        capabilities: context.facility.capabilities,
        inbound_cases: context.subset.length,
      },
      totals: context.stats,
    };
  }

  const base = {
    window_days: getState().range,
    totals: context.stats,
    by_type: analytics.breakdown(context.subset, 'type').map((row) => ({ name: row.label, count: row.value })),
    by_priority: analytics.breakdown(context.subset, 'priority').map((row) => ({ name: row.label, count: row.value })),
    mode_comparison: analytics.modeComparison(context.subset),
  };

  return context.kind === 'kpi'
    ? { metric: context.kpi.label, value: context.kpi.display, change: context.kpi.delta, definition: context.kpi.hint, ...base }
    : { metric: `${context.field}: ${context.meta.label}`, share_of_period: context.share, ...base };
}

/** Deterministic explanation built from the same figures the model would get. */
function localExplanation(context) {
  if (context.kind === 'incident') {
    const { incident } = context;
    const definition = getType(incident.type);
    const decision = decisionMinutes(incident);

    return `${definition.label} graded ${getPriority(incident.priority).id} with ` +
      `${fmt.pct(incident.confidence || 0)} classifier confidence. ` +
      (decision !== null ? `An ambulance was assigned ${fmt.minutes(decision)} after the call was raised. ` : '') +
      `The clinical window for this type is ${definition.window} minutes and the receiving department is ` +
      `${definition.dept}. ` +
      (incident.verifiedBy
        ? `A clinician has confirmed the assessment.`
        : `No clinician has confirmed the assessment yet, so every inferred field should be treated as provisional.`);
  }

  if (context.kind === 'facility') {
    const { facility, subset } = context;
    return `${facility.name} is a tier ${facility.tier} facility holding ` +
      `${facility.capabilities.length} of the capability tags tracked by the router, and is currently the ` +
      `chosen destination for ${fmt.num(subset.length)} cases in this period.`;
  }

  const { stats, subset } = context;
  const label = context.kind === 'kpi' ? context.kpi.label : context.meta.label;
  const top = analytics.breakdown(subset, 'type')[0];
  const comparison = analytics.modeComparison(subset);

  const movement = context.kind === 'kpi' && context.kpi.delta !== null
    ? ` It moved ${fmt.signedPct(context.kpi.delta)} against the previous period, which is ` +
      `${(context.kpi.delta > 0) === Boolean(context.kpi.inverse) ? 'the wrong direction' : 'an improvement'}.`
    : '';

  return `${label} covers ${fmt.num(stats.total)} cases, ${fmt.num(stats.active)} of them still open and ` +
    `${fmt.num(stats.criticalActive)} critical.${movement}` +
    (top ? ` ${top.label} is the largest contributor at ${fmt.pct(top.share)} of the slice.` : '') +
    (Number.isFinite(comparison.jibon.decision) && Number.isFinite(comparison.baseline.decision)
      ? ` Coordinated cases reach dispatch in ${fmt.minutes(comparison.jibon.decision)} against ` +
        `${fmt.minutes(comparison.baseline.decision)} conventionally.`
      : '');
}

/* ── Mapping ──────────────────────────────────────────────────────────────── */

function subsetForKpi(kpiId, slice) {
  switch (kpiId) {
    case 'active': return slice.filter(isActiveIncident);
    case 'critical': return slice.filter((incident) => isCritical(incident) && isActiveIncident(incident));
    case 'transit': return slice.filter((incident) => incident.stage === 'transporting');
    case 'decision': return slice.filter((incident) => incident.dispatchedAt);
    case 'response': return slice.filter((incident) => incident.onSceneAt);
    case 'preparing': return slice.filter((incident) => Object.keys(incident.prep || {}).length);
    case 'lead': return slice.filter((incident) => incident.handoverAt);
    case 'window': return slice.filter((incident) => incident.outcome);
    default: return slice;
  }
}

function filtersForKpi(kpiId) {
  switch (kpiId) {
    case 'active': return { stages: ['reported', 'classified', 'dispatched', 'onscene', 'transporting'] };
    case 'critical': return { priorities: ['P1'] };
    case 'transit': return { stages: ['transporting'] };
    default: return {};
  }
}

const facetKey = (field) => ({
  type: 'types',
  priority: 'priorities',
  stage: 'stages',
  channel: 'channels',
  district: 'districts',
  mode: 'modes',
}[field]);

function describeFacet(field, id) {
  switch (field) {
    case 'type': {
      const definition = getType(id);
      return {
        eyebrow: 'Emergency type',
        label: definition.label,
        subtitle: `${definition.dept} · ${definition.window}-minute clinical window`,
        extra: () => h('div.stack.stack--tight', {},
          h('p.text-dim', { style: { fontSize: 'var(--t-xs)' } }, 'Required capability at the receiving facility:'),
          h('div.row.row--wrap', {}, requiredCapabilities(id).map((tag) =>
            h('span.chip', {}, CAPABILITY_TAGS[tag] || tag)))),
      };
    }
    case 'priority': {
      const definition = getPriority(id);
      return { eyebrow: 'Priority grade', label: `${definition.id} — ${definition.label}`, subtitle: definition.description };
    }
    case 'stage':
      return { eyebrow: 'Lifecycle stage', label: getStage(id).label, subtitle: 'Cases currently at this stage' };
    case 'channel':
      return { eyebrow: 'Intake channel', label: getChannel(id).label, subtitle: 'How these emergencies were reported' };
    case 'district':
      return { eyebrow: 'District', label: id, subtitle: 'Emergencies originating in this district' };
    case 'mode':
      return {
        eyebrow: 'Coordination mode',
        label: id === 'jibon' ? 'JIBON coordinated' : 'Conventional dispatch',
        subtitle: id === 'jibon'
          ? 'AI classification, matched equipment, hospital prepared in advance'
          : 'Voice triage, nearest available unit, hospital informed on arrival',
      };
    default:
      return { eyebrow: field, label: String(id), subtitle: '' };
  }
}

export { openIncident as openCase };
