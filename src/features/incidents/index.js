/**
 * Case list — every emergency in the period, filterable and sortable.
 *
 * This is where drill-downs land when a panel says "view in case list", so the
 * filter state it reads is the same store slice the KPI tiles were computed
 * from. Arriving here from a tile should feel like the same question, narrowed.
 */

import { h } from '../../core/dom.js';
import { icon } from '../../ui/icons.js';
import { incidentRow } from '../../ui/incident.js';
import { openIncident, openFacetDrill } from '../../ui/drilldown.js';
import * as selectors from '../../domain/selectors.js';
import { FACETS, getType, getPriority, getStage, getChannel } from '../../domain/taxonomy.js';
import {
  getState, subscribe, setFilters, toggleFilter, clearFilters,
  activeFilterCount, setSort, setPage,
} from '../../core/store.js';
import { decisionMinutes, totalMinutes } from '../../domain/incidents.js';
import * as fmt from '../../core/format.js';
import { toastOk } from '../../ui/toast.js';

export const meta = {
  path: '/incidents',
  title: 'Case List',
  subtitle: 'Every emergency in the selected period',
  icon: 'list',
};

const SORTS = [
  { key: 'createdAt', label: 'Raised' },
  { key: 'priority', label: 'Priority' },
  { key: 'decision', label: 'Call → dispatch' },
  { key: 'total', label: 'End to end' },
];

export function render({ mount, params }) {
  // A route param lets a link deep-link straight into a filtered view.
  if (params.type) setFilters({ types: [params.type] });
  if (params.priority) setFilters({ priorities: [params.priority] });

  const root = h('div.stack');
  mount.appendChild(root);

  const draw = () => root.replaceChildren(...sections());
  draw();

  const unsubscribe = subscribe((_, keys) => {
    if (['incidents', 'filters', 'range', 'sort', 'page'].some((key) => keys.includes(key))) draw();
  });

  return unsubscribe;
}

function sections() {
  const state = getState();
  const rows = selectors.sortedIncidents(state);
  const start = (state.page - 1) * state.pageSize;
  const page = rows.slice(start, start + state.pageSize);
  const pages = Math.max(1, Math.ceil(rows.length / state.pageSize));

  return [
    filterBar(state, rows),
    facetChips(state),
    h('section.card.card--flush', {},
      page.length
        ? h('div.stack.stack--tight', { style: { padding: 'var(--s-4)' } },
            page.map((incident) => incidentRow(incident, { onOpen: openIncident })))
        : h('div.empty', {},
            icon('search', { size: 26 }),
            h('h3', {}, 'No cases match'),
            h('p', {}, 'Try clearing a filter or widening the time range.')),

      rows.length > state.pageSize
        ? h('div.pager', {},
            h('span', {}, `${fmt.num(start + 1)}–${fmt.num(Math.min(start + state.pageSize, rows.length))} of ${fmt.num(rows.length)}`),
            h('div.row', {},
              h('button.btn.btn--ghost.btn--sm', {
                type: 'button',
                disabled: state.page <= 1,
                on: { click: () => setPage(state.page - 1) },
              }, 'Previous'),
              h('span', { style: { fontSize: 'var(--t-xs)' } }, `Page ${state.page} of ${pages}`),
              h('button.btn.btn--ghost.btn--sm', {
                type: 'button',
                disabled: state.page >= pages,
                on: { click: () => setPage(state.page + 1) },
              }, 'Next')))
        : null),
  ];
}

function filterBar(state, rows) {
  return h(
    'div.filterbar',
    {},
    h('label.filterbar__search', {},
      icon('search', { size: 15 }),
      h('input', {
        type: 'search',
        placeholder: 'Search case id, description, location, crew…',
        value: state.filters.q,
        'aria-label': 'Search cases',
        on: { input: (event) => setFilters({ q: event.target.value }) },
      })),

    h('div.segmented', { role: 'group', 'aria-label': 'Sort by' },
      SORTS.map((sort) =>
        h('button', {
          type: 'button',
          'aria-pressed': String(state.sort.key === sort.key),
          on: { click: () => setSort(sort.key) },
        }, sort.label, state.sort.key === sort.key ? (state.sort.dir === 'desc' ? ' ↓' : ' ↑') : ''))),

    h('button.btn.btn--ghost.btn--sm', {
      type: 'button',
      on: { click: () => exportCsv(rows) },
    }, icon('download', { size: 13 }), 'CSV'),

    activeFilterCount()
      ? h('button.btn.btn--bare.btn--sm', { type: 'button', on: { click: () => clearFilters() } },
          `Clear ${activeFilterCount()} filter${activeFilterCount() > 1 ? 's' : ''}`)
      : null,
  );
}

/** Facet chips. Each is a toggle; each label also opens that facet's own panel. */
function facetChips(state) {
  return h(
    'div.stack.stack--tight',
    {},
    FACETS.map((facet) =>
      h('div.row.row--wrap', { style: { gap: 'var(--s-2)' } },
        h('span.eyebrow', { style: { minWidth: '92px' } }, facet.label),
        facet.options.map((option) =>
          h('button.chip', {
            type: 'button',
            'aria-pressed': String((state.filters[facet.key] || []).includes(option.id)),
            title: `Filter by ${option.label}`,
            on: {
              click: (event) => {
                // Alt-click opens the analytical panel instead of filtering.
                if (event.altKey) openFacetDrill(facet.field, option.id);
                else toggleFilter(facet.key, option.id);
              },
            },
          }, option.label || option.short)))),
    h('p.text-dim', { style: { fontSize: 'var(--t-micro)' } }, 'Alt-click a chip to open its breakdown instead of filtering.'),
  );
}

/** Plain CSV so a coordinator can take the period into a spreadsheet. */
function exportCsv(rows) {
  const header = [
    'id', 'raised', 'type', 'priority', 'stage', 'district', 'location', 'patients',
    'channel', 'mode', 'call_to_dispatch_min', 'end_to_end_min', 'unit', 'clinician', 'verified',
  ];

  const body = rows.map((incident) => [
    incident.id,
    new Date(incident.createdAt).toISOString(),
    getType(incident.type).label,
    incident.priority,
    getStage(incident.stage).label,
    incident.origin.district,
    incident.origin.label,
    incident.patients,
    getChannel(incident.channel).label,
    incident.mode,
    decisionMinutes(incident)?.toFixed(1) ?? '',
    totalMinutes(incident)?.toFixed(1) ?? '',
    incident.assignments.unit ?? '',
    incident.assignments.clinician ?? '',
    incident.verifiedBy ? 'yes' : 'no',
  ].map(fmt.csvCell).join(','));

  const blob = new Blob([[header.join(','), ...body].join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = h('a', { href: url, download: `jibon-cases-${new Date().toISOString().slice(0, 10)}.csv` });

  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);

  toastOk(`Exported ${rows.length} cases.`);
}
