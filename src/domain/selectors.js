/**
 * Selectors — the agreed reading of "what am I looking at right now".
 *
 * Every interface and every drill-down panel reads through these, which is what
 * guarantees a KPI tile and the panel explaining it are computed from exactly
 * the same rows. Results are memoised on a cheap signature so re-rendering does
 * not re-filter the whole dataset for nothing.
 */

import { getState } from '../core/store.js';
import * as analytics from './analytics.js';
import { isActiveIncident } from './incidents.js';

let cache = { key: '', value: null };

export function rangeIncidents(state = getState()) {
  return analytics.withinRange(state.incidents, state.range);
}

/** The active slice: time range plus every facet filter and the search box. */
export function filteredIncidents(state = getState()) {
  const key = signature(state);
  if (cache.key === key) return cache.value;

  const value = analytics.applyFilters(rangeIncidents(state), state.filters);
  cache = { key, value };
  return value;
}

export function sortedIncidents(state = getState()) {
  return analytics.sortIncidents(filteredIncidents(state), state.sort);
}

/** Open cases, most urgent first — the ordering the command board lives by. */
export function activeIncidents(state = getState()) {
  const priorityOrder = { P1: 0, P2: 1, P3: 2, P4: 3 };
  return filteredIncidents(state)
    .filter(isActiveIncident)
    .sort((a, b) =>
      (priorityOrder[a.priority] ?? 9) - (priorityOrder[b.priority] ?? 9) ||
      a.createdAt - b.createdAt);
}

export const currentKpis = (state = getState()) =>
  analytics.buildKpis(filteredIncidents(state), state.incidents, state.range);

export const currentEvidence = (state = getState()) =>
  analytics.evidencePacket(filteredIncidents(state), state.range);

export const currentComparison = (state = getState()) =>
  analytics.modeComparison(filteredIncidents(state));

function signature(state) {
  const { q, types, priorities, stages, channels, districts, modes } = state.filters;
  return [
    state.incidents.length,
    state.updatedStamp || 0,
    state.range,
    q,
    types.join(','),
    priorities.join(','),
    stages.join(','),
    channels.join(','),
    districts.join(','),
    modes.join(','),
  ].join('|');
}

/** Called whenever an incident mutates under us, so the next read recomputes. */
export function invalidate() {
  cache = { key: '', value: null };
}
