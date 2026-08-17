/**
 * Shared incident presentation.
 *
 * The command board, the ambulance view, the hospital view and the drill-down
 * drawer all show the same case from different angles. Rather than each building
 * its own version of a priority badge or a timeline, they compose these.
 *
 * The provenance badge is the one non-negotiable piece: no clinical fact is ever
 * rendered without the label saying how it is known.
 */

import { h } from '../core/dom.js';
import { icon } from './icons.js';
import * as fmt from '../core/format.js';
import {
  getType, getPriority, getStage, getChannel, PROVENANCE,
  priorityColor, typeColor, windowConsumed,
} from '../domain/taxonomy.js';
import { getFacility, getPrepState } from '../domain/network.js';
import { decisionMinutes, responseMinutes, totalMinutes, factSource } from '../domain/incidents.js';
import { equipmentFor, briefCompleteness, missingInformation } from '../domain/protocols.js';

/* ── Atoms ────────────────────────────────────────────────────────────────── */

/** Priority chip. The only place P1 red is allowed to appear. */
export function priorityBadge(priority, { size = 'md' } = {}) {
  const definition = getPriority(priority);
  return h(
    `span.badge${size === 'sm' ? '.badge--sm' : ''}`,
    {
      style: {
        background: `color-mix(in srgb, ${priorityColor(priority)} 16%, transparent)`,
        color: priorityColor(priority),
        fontWeight: '600',
        letterSpacing: '0.04em',
      },
      title: definition.description,
    },
    definition.id,
    h('span', { style: { opacity: '0.75', fontWeight: '450' } }, definition.label),
  );
}

/**
 * Provenance badge — reported / observed / AI inferred / verified / needs
 * confirmation. Deliberately verbose rather than a colour alone, because the
 * distinction is a safety property and colour is not readable to everyone.
 */
export function provenanceBadge(source) {
  const definition = factSource(source);
  const tone = definition.tone === 'neutral' ? 'var(--text-dim)' : `var(--${definition.tone})`;

  return h(
    'span.badge',
    {
      style: {
        background: `color-mix(in srgb, ${tone} 14%, transparent)`,
        color: tone,
        fontSize: 'var(--t-micro)',
        letterSpacing: '0.05em',
        textTransform: 'uppercase',
      },
      title: definition.note,
    },
    definition.label,
  );
}

export function stageBadge(stage) {
  const definition = getStage(stage);
  const tone = definition.tone === 'neutral' ? 'var(--text-dim)'
    : definition.tone === 'accent' ? 'var(--accent)'
      : `var(--${definition.tone})`;

  return h(
    'span.badge',
    { style: { background: `color-mix(in srgb, ${tone} 14%, transparent)`, color: tone } },
    h('span.dot', { style: { background: tone } }),
    definition.label,
  );
}

/**
 * Clinical-window meter.
 *
 * The number that matters most on the board: how much of the time budget for
 * this kind of emergency has already been spent. Turns red as it closes.
 */
export function windowMeter(incident, { showLabel = true } = {}) {
  const consumed = windowConsumed(incident);
  const budget = getType(incident.type).window;
  const pct = Math.min(1, consumed);
  const tone = consumed >= 1 ? 'var(--neg)' : consumed > 0.7 ? 'var(--warn)' : 'var(--pos)';

  return h(
    'div.stack.stack--tight',
    { title: `${Math.round(consumed * 100)}% of the ${budget}-minute window for ${getType(incident.type).label}` },
    showLabel
      ? h(
          'div.row.row--between',
          { style: { fontSize: 'var(--t-micro)' } },
          h('span.text-dim', {}, 'Clinical window'),
          h('span', { style: { color: tone, fontVariantNumeric: 'tabular-nums' } },
            consumed >= 1 ? 'exceeded' : `${Math.round((1 - consumed) * budget)} min left`),
        )
      : null,
    h('span.meter', {}, h('span.meter__fill', { style: { width: `${pct * 100}%`, background: tone } })),
  );
}

/* ── Case row ─────────────────────────────────────────────────────────────── */

/**
 * One line on the command board. Everything about it is a click target — the
 * row opens the case, the badges filter to their own facet.
 */
export function incidentRow(incident, { onOpen, compact = false } = {}) {
  const definition = getType(incident.type);
  const destination = incident.route ? getFacility(incident.route.destinationId) : null;

  return h(
    'button.case-row',
    {
      type: 'button',
      dataset: { priority: incident.priority },
      'aria-label': `${definition.label}, ${getPriority(incident.priority).label}, ${incident.origin.label}. Open case.`,
      on: { click: () => onOpen?.(incident) },
    },
    h('span.case-row__bar', { style: { background: priorityColor(incident.priority) } }),

    h(
      'span.case-row__main',
      {},
      h(
        'span.case-row__head',
        {},
        h('span.case-row__type', {}, definition.label),
        priorityBadge(incident.priority),
        incident.simulated ? h('span.badge.badge--accent', {}, 'Live sim') : null,
      ),
      h(
        'span.case-row__meta',
        {},
        h('span.mono', {}, incident.id),
        h('span.sep', {}, '·'),
        h('span', {}, incident.origin.label),
        h('span.sep', {}, '·'),
        h('span', {}, fmt.relative(incident.createdAt)),
        incident.patients > 1
          ? [h('span.sep', {}, '·'), h('span', {}, `${incident.patients} patients`)]
          : null,
      ),
      !compact && destination
        ? h(
            'span.case-row__meta',
            {},
            icon('hospital', { size: 12 }),
            h('span', {}, destination.name),
            h('span.sep', {}, '·'),
            prepPill(incident.prep?.[destination.id]),
          )
        : null,
    ),

    h(
      'span.case-row__side',
      {},
      stageBadge(incident.stage),
      h('span', { style: { width: '84px' } }, windowMeter(incident, { showLabel: false })),
    ),
  );
}

/** Small hospital-readiness pill, used inline. */
export function prepPill(state) {
  const definition = getPrepState(state || 'idle');
  const tone = definition.tone === 'neutral' ? 'var(--text-dim)'
    : definition.tone === 'accent' ? 'var(--accent)'
      : `var(--${definition.tone})`;

  return h(
    'span.badge',
    { style: { background: `color-mix(in srgb, ${tone} 14%, transparent)`, color: tone } },
    definition.label,
  );
}

/* ── Emergency brief ──────────────────────────────────────────────────────── */

/**
 * The Emergency Brief: the structured handover every responder sees on entry.
 *
 * Its purpose is that nobody joining the case has to re-interview the caller, so
 * it is built to be read top-to-bottom in about fifteen seconds.
 */
export function emergencyBrief(incident, { onFacetClick } = {}) {
  const definition = getType(incident.type);
  const completeness = briefCompleteness(incident);
  const missing = missingInformation(incident).slice(0, 4);
  const destination = incident.route ? getFacility(incident.route.destinationId) : null;

  const line = (label, value, source, onClick) =>
    h(
      'div.brief__row',
      {},
      h('span.brief__key', {}, label),
      h(
        'span.brief__val',
        {},
        onClick
          ? h('button.btn.btn--bare.btn--sm', { type: 'button', on: { click: onClick } }, value)
          : h('span', {}, value),
        source ? provenanceBadge(source) : null,
      ),
    );

  return h(
    'div.brief',
    {},
    h(
      'div.brief__head',
      {},
      h(
        'div',
        {},
        h('div.eyebrow', {}, 'Emergency brief'),
        h('h3.brief__title', {}, definition.label),
      ),
      priorityBadge(incident.priority),
    ),

    /* Completeness is shown honestly — an incomplete brief must look incomplete. */
    h(
      'div.brief__complete',
      {},
      h(
        'div.row.row--between',
        { style: { fontSize: 'var(--t-micro)', marginBottom: '4px' } },
        h('span.text-dim', {}, 'Brief completeness'),
        h('span', { style: { fontVariantNumeric: 'tabular-nums' } }, fmt.pct(completeness)),
      ),
      h('span.meter', {}, h('span.meter__fill', {
        style: {
          width: `${completeness * 100}%`,
          background: completeness > 0.75 ? 'var(--pos)' : completeness > 0.45 ? 'var(--warn)' : 'var(--neg)',
        },
      })),
    ),

    h(
      'div.brief__grid',
      {},
      line('Emergency ID', incident.id),
      line('Location', incident.origin.label, 'reported',
        onFacetClick ? () => onFacetClick('district', incident.origin.district) : null),
      line('Coordinates', `${incident.origin.lat.toFixed(4)}, ${incident.origin.lng.toFixed(4)}`, 'observed'),
      line('Category', definition.label, incident.verifiedBy ? 'verified' : 'inferred',
        onFacetClick ? () => onFacetClick('type', incident.type) : null),
      line('Priority', `${getPriority(incident.priority).id} — ${getPriority(incident.priority).label}`,
        incident.verifiedBy ? 'verified' : 'inferred',
        onFacetClick ? () => onFacetClick('priority', incident.priority) : null),
      line('Patients', String(incident.patients), 'reported'),
      ...incident.facts.map((entry) => line(entry.label, entry.value, entry.source)),
      line('Reported via', getChannel(incident.channel).label, 'observed',
        onFacetClick ? () => onFacetClick('channel', incident.channel) : null),
      incident.assignments.unit ? line('Assigned unit', incident.assignments.unit, 'verified') : null,
      incident.assignments.clinician ? line('Clinician', incident.assignments.clinician, 'verified') : null,
      incident.assignments.volunteers?.length
        ? line('Volunteer', incident.assignments.volunteers.join(', '), 'verified')
        : null,
      destination ? line('Destination', destination.name, 'inferred') : null,
    ),

    /* Caller's own words are kept verbatim — the interpretation sits above it, not over it. */
    incident.narrative
      ? h(
          'div.brief__quote',
          {},
          h('div.eyebrow', { style: { marginBottom: 'var(--s-2)' } }, 'Caller, verbatim'),
          h('p', {}, incident.narrative),
        )
      : null,

    missing.length
      ? h(
          'div.brief__missing',
          {},
          h('div.eyebrow', { style: { marginBottom: 'var(--s-2)' } }, 'Information still required'),
          h('ul', {}, missing.map((item) => h('li', {}, item.label))),
        )
      : null,

    h(
      'div.brief__foot',
      {},
      incident.verifiedBy
        ? h('span.badge.badge--pos', {}, icon('shieldCheck', { size: 12 }), `Verified by ${incident.verifiedBy}`)
        : h('span.badge.badge--warn', {}, 'Awaiting professional verification'),
      incident.confidence !== null
        ? h('span.badge', {}, `AI confidence ${fmt.pct(incident.confidence)}`)
        : null,
    ),
  );
}

/* ── Timeline ─────────────────────────────────────────────────────────────── */

/** The live emergency timeline. Every entry is inspectable. */
export function timeline(incident, { onSelect } = {}) {
  if (!incident.timeline?.length) {
    return h('p.text-dim', { style: { fontSize: 'var(--t-xs)' } }, 'No events recorded yet.');
  }

  const start = incident.createdAt;

  return h(
    'ol.timeline',
    {},
    incident.timeline.map((entry, index) =>
      h(
        'li.timeline__item',
        {},
        h(
          'button.timeline__button',
          {
            type: 'button',
            on: { click: () => onSelect?.(entry, incident) },
            title: `${fmt.asClock(entry.at)} — ${entry.label}`,
          },
          h(
            'span.timeline__gutter',
            {},
            h('span.timeline__dot', { dataset: { actor: entry.actor } }),
            index < incident.timeline.length - 1 ? h('span.timeline__line') : null,
          ),
          h(
            'span.timeline__body',
            {},
            h(
              'span.timeline__head',
              {},
              h('span.timeline__time.mono', {}, fmt.asClock(entry.at)),
              h('span.timeline__offset', {}, `+${fmt.minutes(Math.max(0, (entry.at - start) / 60_000))}`),
            ),
            h('span.timeline__label', {}, entry.label),
            entry.detail ? h('span.timeline__detail', {}, entry.detail) : null,
          ),
        ),
      ),
    ),
  );
}

/* ── Equipment manifest ───────────────────────────────────────────────────── */

/**
 * What the ambulance should carry. Rendered as a checklist a crew confirms —
 * the platform proposes, the crew decides.
 */
export function equipmentManifest(incident, { onToggle, interactive = false } = {}) {
  const items = incident.equipment?.length
    ? incident.equipment
    : equipmentFor(incident.type).map((item) => ({ ...item, confirmed: false }));

  return h(
    'ul.manifest',
    {},
    items.map((item) =>
      h(
        interactive ? 'li.manifest__item' : 'li.manifest__item',
        {},
        interactive
          ? h(
              'button.manifest__check',
              {
                type: 'button',
                'aria-pressed': String(Boolean(item.confirmed)),
                'aria-label': `Confirm ${item.label}`,
                on: { click: () => onToggle?.(item) },
              },
              item.confirmed ? icon('check', { size: 12, stroke: 2.4 }) : null,
            )
          : h('span.manifest__dot', { style: { background: item.critical ? 'var(--neg)' : 'var(--text-faint)' } }),
        h('span.manifest__label', {}, item.label),
        item.critical ? h('span.badge.badge--neg', {}, 'Critical') : null,
      ),
    ),
  );
}

/* ── Route plan ───────────────────────────────────────────────────────────── */

/**
 * The route, drawn as a chain: scene → relay(s) → destination.
 *
 * This is the clearest expression of the product's central idea, so it gets a
 * dedicated component rather than a line of text.
 */
export function routePlan(incident, { onFacility, onExplain } = {}) {
  if (!incident.route) {
    return h('p.text-dim', { style: { fontSize: 'var(--t-xs)' } }, 'Route not yet planned.');
  }

  const destination = getFacility(incident.route.destinationId);
  const relays = (incident.route.relayIds || []).map(getFacility).filter(Boolean);

  const node = (label, sub, state, options = {}) =>
    h(
      options.onClick ? 'button.route__node' : 'div.route__node',
      {
        ...(options.onClick ? { type: 'button', on: { click: options.onClick } } : {}),
        dataset: { kind: options.kind || 'stop' },
      },
      h('span.route__marker', {}, icon(options.iconName || 'hospital', { size: 13 })),
      h(
        'span.route__text',
        {},
        h('span.route__label', {}, label),
        h('span.route__sub', {}, sub),
      ),
      state ? prepPill(state) : null,
    );

  return h(
    'div.route',
    {},
    node(incident.origin.label, `Scene · ${incident.origin.district}`, null, { kind: 'origin', iconName: 'pin' }),

    ...relays.flatMap((relay) => [
      h('div.route__link', {}, h('span.route__link-label', {}, 'relay')),
      node(
        relay.name,
        `${relay.city} · stabilise and hand up supplies`,
        incident.prep?.[relay.id],
        { kind: 'relay', onClick: onFacility ? () => onFacility(relay) : null, iconName: 'route' },
      ),
    ]),

    h('div.route__link', {}, h('span.route__link-label', {}, `${incident.route.directMinutes} min`)),

    destination
      ? node(
          destination.name,
          `${destination.city} · definitive care`,
          incident.prep?.[destination.id],
          { kind: 'destination', onClick: onFacility ? () => onFacility(destination) : null },
        )
      : null,

    onExplain
      ? h(
          'button.btn.btn--ghost.btn--sm',
          { type: 'button', style: { marginTop: 'var(--s-3)' }, on: { click: onExplain } },
          icon('spark', { size: 13 }),
          'Why this hospital?',
        )
      : null,
  );
}

/* ── Timing summary ───────────────────────────────────────────────────────── */

/** The four intervals that define a case, each one clickable for its own panel. */
export function timingStats(incident, { onPick } = {}) {
  const rows = [
    { id: 'decision', label: 'Call → dispatch', value: decisionMinutes(incident) },
    { id: 'response', label: 'Dispatch → patient', value: responseMinutes(incident) },
    { id: 'total', label: 'End to end', value: totalMinutes(incident) },
    {
      id: 'window',
      label: 'Window used',
      value: windowConsumed(incident) * 100,
      format: (value) => `${Math.round(value)}%`,
    },
  ];

  return h(
    'div.stats',
    {},
    rows.map((row) =>
      h(
        onPick ? 'button.stat' : 'div.stat',
        onPick ? { type: 'button', on: { click: () => onPick(row) } } : {},
        h('span.stat__label', {}, row.label),
        h('span.stat__value', {}, row.value === null || row.value === undefined
          ? '—'
          : (row.format || fmt.minutes)(row.value)),
      ),
    ),
  );
}

export { getType, getPriority, priorityColor, typeColor };
