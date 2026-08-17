/**
 * Analytics — where the operational argument is made.
 *
 * Everything here is derived from the incident set by `domain/analytics.js`, and
 * every mark drills through. The point of the screen is not to look analytical;
 * it is to let someone challenge a number and immediately see the cases behind it.
 */

import { h } from '../../core/dom.js';
import { icon } from '../../ui/icons.js';
import { rankList } from '../../ui/kpi.js';
import { mountChart, areaChart, barChart, donutChart, legend } from '../../ui/charts.js';
import { openFacetDrill, openDayDrill, openFacilityDrill } from '../../ui/drilldown.js';
import * as selectors from '../../domain/selectors.js';
import * as analytics from '../../domain/analytics.js';
import { typeColor, priorityColor, getType } from '../../domain/taxonomy.js';
import { getFacility } from '../../domain/network.js';
import { decisionMinutes, responseMinutes, totalMinutes } from '../../domain/incidents.js';
import { getState, subscribe } from '../../core/store.js';
import * as fmt from '../../core/format.js';
import { callGemini, isConfigured } from '../../services/gemini.js';
import { ASSISTANT_SYSTEM, buildAssistantParts } from '../../services/prompts.js';
import { toastError } from '../../ui/toast.js';

export const meta = {
  path: '/analytics',
  title: 'Analytics',
  subtitle: 'Where time is lost, and what it costs',
  icon: 'chart',
};

export function render({ mount }) {
  const teardowns = [];
  const root = h('div.stack.stack--loose');
  mount.appendChild(root);

  const draw = () => {
    while (teardowns.length) teardowns.pop()();
    root.replaceChildren(...sections(teardowns));
  };

  draw();

  const unsubscribe = subscribe((_, keys) => {
    if (keys.includes('incidents') || keys.includes('filters') || keys.includes('range')) draw();
  });

  return () => {
    while (teardowns.length) teardowns.pop()();
    unsubscribe();
  };
}

function sections(teardowns) {
  const state = getState();
  const slice = selectors.filteredIncidents(state);

  return [
    insightsCard(slice, state.range),
    h('div.grid.grid--split', {},
      timingTrendCard(slice, state.range, teardowns),
      typeMixCard(slice, teardowns)),
    pathwayTable(slice),
    h('div.grid.grid--split', {},
      hourCard(slice, teardowns),
      districtCard(slice)),
    facilityCard(slice),
  ];
}

/** Findings, generated locally and optionally rewritten by Gemini as a briefing. */
function insightsCard(slice, range) {
  const findings = analytics.deriveInsights(slice, range);
  const body = h('div.stack', {}, findings.map((text) => h('div.insight', {}, h('div', {}, text))));

  const button = h('button.btn.btn--ghost.btn--sm', { type: 'button' },
    icon('spark', { size: 13 }),
    isConfigured() ? 'Write briefing' : 'Needs API key');

  button.addEventListener('click', async () => {
    if (!isConfigured()) {
      toastError('Add a Gemini API key in Settings to generate a written briefing.');
      return;
    }

    button.disabled = true;
    button.replaceChildren(h('span.spinner'), 'Writing');

    try {
      const text = await callGemini({
        parts: buildAssistantParts(selectors.currentEvidence(), 'Produce the standing situation briefing for the duty coordinator.'),
        system: ASSISTANT_SYSTEM,
        temperature: 0.5,
        maxOutputTokens: 900,
      });
      body.prepend(h('div.insight', { style: { borderLeftColor: 'var(--accent)' } },
        h('div', {},
          h('div.eyebrow', { style: { marginBottom: 'var(--s-2)' } }, 'Gemini briefing'),
          ...text.split('\n\n').map((para) => h('p', { style: { marginBottom: 'var(--s-2)' } }, para)))));
    } catch (error) {
      toastError(error.message || 'Could not generate the briefing.');
    } finally {
      button.disabled = false;
      button.replaceChildren(icon('spark', { size: 13 }), 'Write briefing');
    }
  });

  return h('section.card', {},
    h('div.card__head', {},
      h('div', {},
        h('div.card__title', {}, 'Findings'),
        h('div.card__note', {}, 'Computed from the case data — figures, not impressions')),
      button),
    body);
}

/** The three intervals over time. Which line moves tells you where to intervene. */
function timingTrendCard(slice, range, teardowns) {
  const series = [
    { key: 'decision', label: 'Call → dispatch', color: 'var(--series-1)', measure: decisionMinutes },
    { key: 'response', label: 'Dispatch → patient', color: 'var(--series-2)', measure: responseMinutes },
    { key: 'total', label: 'End to end', color: 'var(--series-3)', measure: totalMinutes },
  ].map((entry) => ({ ...entry, points: analytics.dailyMedian(slice, entry.measure, range) }));

  const holder = h('div');
  let visible = 'decision';

  const paint = () => {
    while (teardowns.length && teardowns[teardowns.length - 1].owner === 'timing') teardowns.pop()();
    const active = series.find((entry) => entry.key === visible);
    const dispose = mountChart(holder, (width) =>
      areaChart({
        points: active.points,
        width,
        height: 220,
        color: active.color,
        label: 'minutes',
        onPick: (point) => openDayDrill(point.ts),
      }));
    dispose.owner = 'timing';
    teardowns.push(dispose);
  };

  paint();

  return h('section.card', {},
    h('div.card__head', {},
      h('div', {},
        h('div.card__title', {}, 'Where the time goes'),
        h('div.card__note', {}, 'Daily median, in minutes — click a day to open it')),
      h('div.segmented', { role: 'group', 'aria-label': 'Interval' },
        series.map((entry) =>
          h('button', {
            type: 'button',
            'aria-pressed': String(visible === entry.key),
            on: {
              click: (event) => {
                visible = entry.key;
                event.currentTarget.parentElement.querySelectorAll('button')
                  .forEach((node) => node.setAttribute('aria-pressed', String(node === event.currentTarget)));
                paint();
              },
            },
          }, entry.label)))),
    holder);
}

function typeMixCard(slice, teardowns) {
  const data = analytics.breakdown(slice, 'type').map((row) => ({ ...row, color: typeColor(row.id) }));
  const holder = h('div');

  teardowns.push(mountChart(holder, (width) =>
    donutChart({
      data, width, height: 220, centerLabel: 'Cases',
      onPick: (row) => openFacetDrill('type', row.id),
    })));

  return h('section.card', {},
    h('div.card__head', {}, h('div', {},
      h('div.card__title', {}, 'Emergency mix'),
      h('div.card__note', {}, 'Click a segment to open that type'))),
    holder,
    legend(data.slice(0, 6), (row) => openFacetDrill('type', row.id)));
}

/** Per-pathway performance — the table a service director would actually read. */
function pathwayTable(slice) {
  const rows = analytics.typePerformance(slice);

  return h('section.card', {},
    h('div.card__head', {}, h('div', {},
      h('div.card__title', {}, 'Pathway performance'),
      h('div.card__note', {}, 'Each emergency type against its own clinical window'))),

    h('div.table-wrap', {},
      h('table.table', {},
        h('thead', {}, h('tr', {},
          h('th', {}, 'Pathway'),
          h('th', {}, 'Receiving'),
          h('th.num', {}, 'Cases'),
          h('th.num', {}, 'Window'),
          h('th.num', {}, 'Call → dispatch'),
          h('th.num', {}, 'End to end'),
          h('th.num', {}, 'In window'),
          h('th.num', {}, 'Kit matched'))),
        h('tbody', {}, rows.map((row) =>
          h('tr', { on: { click: () => openFacetDrill('type', row.id) } },
            h('td', {},
              h('div.row', { style: { gap: 'var(--s-2)' } },
                h('span.dot', { style: { background: typeColor(row.id) } }),
                h('span', { style: { fontWeight: '500' } }, row.label))),
            h('td.text-dim', {}, row.dept),
            h('td.num', {}, fmt.num(row.total)),
            h('td.num', {}, `${row.window}m`),
            h('td.num', {}, fmt.minutes(row.medianDecision)),
            h('td.num', {}, fmt.minutes(row.medianTotal)),
            h('td.num', {
              style: { color: row.withinWindow > 0.7 ? 'var(--pos)' : row.withinWindow > 0.4 ? 'var(--warn)' : 'var(--neg)' },
            }, fmt.pct(row.withinWindow)),
            h('td.num', {}, fmt.pct(row.equipmentMatch)))))));
}

function hourCard(slice, teardowns) {
  const holder = h('div');

  teardowns.push(mountChart(holder, (width) =>
    barChart({
      data: analytics.hourHistogram(slice).map((bucket) => ({
        label: String(bucket.hour).padStart(2, '0'),
        value: bucket.value,
        color: 'var(--series-1)',
      })),
      width, height: 200, valueLabel: 'cases',
    })));

  return h('section.card', {},
    h('div.card__head', {}, h('div', {},
      h('div.card__title', {}, 'When emergencies happen'),
      h('div.card__note', {}, 'By hour of day — the basis for crew rostering'))),
    holder);
}

function districtCard(slice) {
  const rows = analytics.breakdown(slice, 'district')
    .map((row, i) => ({ ...row, color: `var(--series-${(i % 8) + 1})` }));

  return h('section.card', {},
    h('div.card__head', {}, h('div', {},
      h('div.card__title', {}, 'By district'),
      h('div.card__note', {}, 'Where the calls originate'))),
    rankList(rows, (row) => openFacetDrill('district', row.id)));
}

function facilityCard(slice) {
  const rows = analytics.facilityLoad(slice).map((row, i) => ({
    id: row.id,
    label: `${row.label} (${row.city})`,
    value: row.value,
    share: row.relays / Math.max(1, row.value),
    color: `var(--series-${(i % 8) + 1})`,
  }));

  return h('section.card', {},
    h('div.card__head', {}, h('div', {},
      h('div.card__title', {}, 'Facility load'),
      h('div.card__note', {}, 'Cases routed to each facility across the period'))),
    rankList(rows, (row) => openFacilityDrill(getFacility(row.id))));
}
