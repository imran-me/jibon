/**
 * Selectors — the single agreed reading of "what am I looking at right now".
 *
 * Views and the drill-down drawer both call these, which is what guarantees a
 * KPI tile and the panel that explains it are computed from exactly the same
 * rows. Results are memoised on a cheap signature so a re-render does not
 * re-filter a few thousand records for nothing.
 */

import { getState } from '../core/store.js';
import * as analytics from './analytics.js';

let cache = { key: '', value: null };

/** Everything inside the selected time range, before facet filters. */
export function rangeSignals(state = getState()) {
  return analytics.withinRange(state.signals, state.range);
}

/** The active slice: time range plus every facet filter and the search box. */
export function filteredSignals(state = getState()) {
  const key = signature(state);
  if (cache.key === key) return cache.value;

  const value = analytics.applyFilters(rangeSignals(state), state.filters);
  cache = { key, value };
  return value;
}

/** Filtered, sorted, ready for the table. */
export function sortedSignals(state = getState()) {
  return analytics.sortSignals(filteredSignals(state), state.sort);
}

/** Headline tiles for the current slice. */
export function currentKpis(state = getState()) {
  return analytics.buildKpis(filteredSignals(state), state.signals, state.range);
}

/** Evidence packet handed to the model. */
export function currentEvidence(state = getState()) {
  return analytics.evidencePacket(filteredSignals(state), state.range);
}

/**
 * Cache key. `signals.length` is enough to notice new reports because the list
 * is only ever appended to or patched through the store.
 */
function signature(state) {
  const { q, categories, wards, statuses, severities, channels } = state.filters;
  return [
    state.signals.length,
    state.range,
    q,
    categories.join(','),
    wards.join(','),
    statuses.join(','),
    severities.join(','),
    channels.join(','),
  ].join('|');
}

/** Called by the store subscriber when signals change under us. */
export function invalidate() {
  cache = { key: '', value: null };
}
