/**
 * Hospital board — pre-arrival intelligence.
 *
 * The product's central claim made visible: a facility sees the case, the ETA
 * and the preparation checklist while the patient is still on the road. The
 * readiness pill moving Notified → Preparing → Team ready is the whole argument
 * in one control.
 */

import { h } from '../../core/dom.js';
import { icon } from '../../ui/icons.js';
import { prepPill, priorityBadge, incidentRow } from '../../ui/incident.js';
import { openIncident, openFacilityDrill } from '../../ui/drilldown.js';
import * as selectors from '../../domain/selectors.js';
import * as analytics from '../../domain/analytics.js';
import { FACILITIES, getFacility, PREP_STATES, CAPABILITY_TAGS, travelMinutes } from '../../domain/network.js';
import { hospitalPrepFor } from '../../domain/protocols.js';
import { getType } from '../../domain/taxonomy.js';
import { isActiveIncident, setPrepState } from '../../domain/incidents.js';
import { getState, subscribe, commitIncident } from '../../core/store.js';
import * as fmt from '../../core/format.js';
import { toastOk } from '../../ui/toast.js';

export const meta = {
  path: '/hospitals',
  title: 'Hospital Board',
  subtitle: 'Inbound cases and preparation status',
  icon: 'hospital',
};

export function render({ mount }) {
  const root = h('div.stack.stack--loose');
  mount.appendChild(root);

  const draw = () => root.replaceChildren(...sections());
  draw();

  const unsubscribe = subscribe((_, keys) => {
    if (keys.includes('incidents') || keys.includes('filters') || keys.includes('range')) draw();
  });

  return unsubscribe;
}

function sections() {
  const slice = selectors.filteredIncidents(getState());
  const inbound = slice.filter((incident) => isActiveIncident(incident) && incident.route);

  // Group active cases by the facility that will receive them.
  const byFacility = new Map();
  for (const incident of inbound) {
    const id = incident.route.destinationId;
    if (!byFacility.has(id)) byFacility.set(id, []);
    byFacility.get(id).push(incident);
  }

  const cards = [...byFacility.entries()]
    .map(([id, cases]) => ({ facility: getFacility(id), cases }))
    .filter((entry) => entry.facility)
    .sort((a, b) => b.cases.length - a.cases.length);

  return [
    summaryRow(slice, inbound),
    cards.length
      ? h('div.grid.grid--2', {}, cards.map(({ facility, cases }) => facilityCard(facility, cases)))
      : h('div.card', {},
          h('div.empty', {},
            icon('hospital', { size: 26 }),
            h('h3', {}, 'No inbound cases'),
            h('p', {}, 'Nothing is currently in transit. Run a scenario from the Command Center to see a hospital prepare in real time.'))),
    networkCard(slice),
  ];
}

function summaryRow(slice, inbound) {
  const stats = analytics.metrics(slice);
  const ready = inbound.filter((incident) =>
    incident.prep?.[incident.route.destinationId] === 'ready').length;

  return h(
    'div.stats',
    {},
    h('div.stat', {},
      h('span.stat__label', {}, 'Inbound now'),
      h('span.stat__value', {}, fmt.num(inbound.length))),
    h('div.stat', {},
      h('span.stat__label', {}, 'Teams ready'),
      h('span.stat__value', { style: { color: 'var(--pos)' } }, fmt.num(ready))),
    h('div.stat', {},
      h('span.stat__label', {}, 'Facilities engaged'),
      h('span.stat__value', {}, fmt.num(stats.facilitiesPreparing))),
    h('div.stat', {},
      h('span.stat__label', {}, 'Mean lead time'),
      h('span.stat__value', {}, fmt.minutes(stats.preArrivalLead)),
      h('span.stat__sub', {}, 'before arrival')),
  );
}

/**
 * One facility's inbound board.
 *
 * The prep controls are real: advancing a case here writes to the incident's
 * timeline, which is what a receiving charge nurse would actually do.
 */
function facilityCard(facility, cases) {
  return h(
    'section.card',
    {},
    h('div.card__head', {},
      h('div', {},
        h('button.card__title', {
          type: 'button',
          style: { textAlign: 'left' },
          on: { click: () => openFacilityDrill(facility) },
        }, facility.name),
        h('div.card__note', {}, `${facility.city} · tier ${facility.tier} · ${fmt.num(facility.beds)} beds`)),
      h('span.badge', {}, `${cases.length} inbound`)),

    h('div.stack.stack--tight', {}, cases.slice(0, 4).map((incident) => inboundCase(incident, facility))),
  );
}

function inboundCase(incident, facility) {
  const definition = getType(incident.type);
  const state = incident.prep?.[facility.id] || 'notified';
  const eta = incident.departedAt
    ? Math.max(0, travelMinutes(incident.origin, facility) - (Date.now() - incident.departedAt) / 60_000)
    : travelMinutes(incident.origin, facility);

  const checklist = hospitalPrepFor(incident.type).filter((item) => item.critical);

  return h(
    'div',
    {
      style: {
        border: '1px solid var(--line)',
        borderRadius: 'var(--r-md)',
        padding: 'var(--s-3)',
        background: 'var(--surface-2)',
      },
    },

    h('div.row.row--between', { style: { marginBottom: 'var(--s-2)' } },
      h('div.row', {},
        priorityBadge(incident.priority),
        h('button.btn.btn--bare.btn--sm', {
          type: 'button',
          on: { click: () => openIncident(incident) },
        }, definition.label)),
      prepPill(state)),

    h('div.case-row__meta', { style: { marginBottom: 'var(--s-3)' } },
      h('span.mono', {}, incident.id),
      h('span.sep', {}, '·'),
      h('span', {}, `${incident.patients} patient${incident.patients > 1 ? 's' : ''}`),
      h('span.sep', {}, '·'),
      h('span', {}, `ETA ${fmt.minutes(eta)}`),
      h('span.sep', {}, '·'),
      h('span', {}, definition.dept)),

    h('div.stack.stack--tight', { style: { marginBottom: 'var(--s-3)' } },
      h('div.eyebrow', {}, 'Prepare'),
      h('ul.manifest', {}, checklist.slice(0, 4).map((item) =>
        h('li.manifest__item', {},
          h('span.manifest__dot', { style: { background: 'var(--neg)' } }),
          h('span.manifest__label', {}, item.label))))),

    /* Advancing readiness is a real state change, logged to the case timeline. */
    h('div.segmented', { role: 'group', 'aria-label': 'Preparation status' },
      PREP_STATES.filter((entry) => entry.id !== 'idle').map((entry) =>
        h('button', {
          type: 'button',
          'aria-pressed': String(state === entry.id),
          on: {
            click: () => {
              setPrepState(incident, facility.id, entry.id);
              commitIncident(incident);
              toastOk(`${facility.city} — ${entry.label.toLowerCase()} for ${incident.id}`);
            },
          },
        }, entry.label))),
  );
}

/** Capability map across the network, so gaps are visible rather than implied. */
function networkCard(slice) {
  const load = new Map(analytics.facilityLoad(slice).map((row) => [row.id, row]));

  return h(
    'section.card',
    {},
    h('div.card__head', {},
      h('div', {},
        h('div.card__title', {}, 'Network capability'),
        h('div.card__note', {}, 'What each facility can actually do — the basis for every routing decision'))),

    h('div.table-wrap', {},
      h('table.table', {},
        h('thead', {}, h('tr', {},
          h('th', {}, 'Facility'),
          h('th', {}, 'Tier'),
          h('th', {}, 'Capabilities'),
          h('th.num', {}, 'Inbound'),
          h('th.num', {}, 'Active'))),
        h('tbody', {}, FACILITIES.map((facility) =>
          h('tr', { on: { click: () => openFacilityDrill(facility) } },
            h('td', {},
              h('div', { style: { fontWeight: '500' } }, facility.name),
              h('div.text-dim', { style: { fontSize: 'var(--t-micro)' } }, facility.city)),
            h('td', {}, h('span.badge', {}, `T${facility.tier}`)),
            h('td', {},
              h('div.row.row--wrap', { style: { gap: '4px' } },
                facility.capabilities.slice(0, 5).map((tag) =>
                  h('span.badge', { title: CAPABILITY_TAGS[tag] }, tag)),
                facility.capabilities.length > 5
                  ? h('span.badge', {}, `+${facility.capabilities.length - 5}`)
                  : null)),
            h('td.num', {}, fmt.num(load.get(facility.id)?.value || 0)),
            h('td.num', {}, fmt.num(load.get(facility.id)?.active || 0))))))),
  );
}
