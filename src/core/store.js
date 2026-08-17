/**
 * Application state.
 *
 * One mutable object behind a `subscribe`/`set` pair. That is enough for a
 * console of this size, and it keeps every mutation traceable through a single
 * function instead of scattered across views.
 *
 * Persistence is deliberately partial:
 *   - settings and range survive reloads (a judge reloading the page keeps their key)
 *   - filters and pagination do not (every visit starts from a clean view)
 *   - reports created during a session are stored separately from the seed data
 */

import * as storage from './storage.js';

const SETTINGS_KEY = 'settings';
const RANGE_KEY = 'range';
const CUSTOM_SIGNALS_KEY = 'signals.custom';

const DEFAULT_SETTINGS = {
  geminiKey: '',
  elevenKey: '',
  model: 'gemini-2.5-flash',
  voiceId: '21m00Tcm4TlvDq8ikWAM', // ElevenLabs "Rachel" — a safe public default
  autoSpeak: false,
  liveFeed: true,
  reduceMotion: false,
};

export const DEFAULT_FILTERS = Object.freeze({
  q: '',
  categories: [],
  wards: [],
  statuses: [],
  severities: [],
  channels: [],
});

const state = {
  ready: false,
  signals: [],
  range: storage.read(RANGE_KEY, 30),
  filters: { ...DEFAULT_FILTERS },
  sort: { key: 'createdAt', dir: 'desc' },
  page: 1,
  pageSize: 12,
  settings: { ...DEFAULT_SETTINGS, ...(storage.read(SETTINGS_KEY, {}) || {}) },
};

const subscribers = new Set();

/** Read-only-by-convention access to the current state. */
export function getState() {
  return state;
}

/**
 * Merge a patch into state and notify subscribers.
 * `keys` lets subscribers cheaply ignore changes they do not care about.
 */
export function set(patch) {
  Object.assign(state, patch);
  const keys = Object.keys(patch);
  for (const handler of Array.from(subscribers)) {
    try {
      handler(state, keys);
    } catch (error) {
      console.error('[store] subscriber threw', error);
    }
  }
}

/** Subscribe to every change. Returns an unsubscribe function. */
export function subscribe(handler) {
  subscribers.add(handler);
  return () => subscribers.delete(handler);
}

/* ── Settings ─────────────────────────────────────────────────────────────── */

export function updateSettings(patch) {
  const settings = { ...state.settings, ...patch };
  storage.write(SETTINGS_KEY, settings);
  set({ settings });
  return settings;
}

export function resetSettings() {
  storage.remove(SETTINGS_KEY);
  set({ settings: { ...DEFAULT_SETTINGS } });
}

/** True when a Gemini key is present — the app is fully usable without one. */
export const hasGeminiKey = () => Boolean(state.settings.geminiKey.trim());
export const hasElevenKey = () => Boolean(state.settings.elevenKey.trim());

/* ── Range ────────────────────────────────────────────────────────────────── */

export function setRange(days) {
  storage.write(RANGE_KEY, days);
  set({ range: days, page: 1 });
}

/* ── Filters ──────────────────────────────────────────────────────────────── */

export function setFilters(patch) {
  set({ filters: { ...state.filters, ...patch }, page: 1 });
}

/** Add or remove one value from a multi-select facet. */
export function toggleFilter(facet, value) {
  const current = state.filters[facet] || [];
  const next = current.includes(value)
    ? current.filter((item) => item !== value)
    : [...current, value];
  setFilters({ [facet]: next });
}

export function clearFilters() {
  set({ filters: { ...DEFAULT_FILTERS }, page: 1 });
}

export function activeFilterCount() {
  const { q, ...facets } = state.filters;
  return Object.values(facets).reduce((total, list) => total + list.length, 0) + (q ? 1 : 0);
}

/* ── Sorting and paging ───────────────────────────────────────────────────── */

export function setSort(key) {
  const dir = state.sort.key === key && state.sort.dir === 'desc' ? 'asc' : 'desc';
  set({ sort: { key, dir }, page: 1 });
}

export function setPage(page) {
  set({ page: Math.max(1, page) });
}

/* ── Signals ──────────────────────────────────────────────────────────────── */

/** Seed the dataset. Custom reports from previous sessions are merged back in. */
export function loadSignals(seeded) {
  const custom = storage.read(CUSTOM_SIGNALS_KEY, []) || [];
  set({ signals: [...custom, ...seeded], ready: true });
}

/** Prepend a newly filed report and persist it so a reload keeps the demo state. */
export function addSignal(signal) {
  const custom = storage.read(CUSTOM_SIGNALS_KEY, []) || [];
  storage.write(CUSTOM_SIGNALS_KEY, [signal, ...custom].slice(0, 200));
  set({ signals: [signal, ...state.signals] });
  return signal;
}

/** Patch one signal in place — used by status changes and re-triage. */
export function updateSignal(id, patch) {
  let updated = null;

  const signals = state.signals.map((signal) => {
    if (signal.id !== id) return signal;
    updated = { ...signal, ...patch };
    return updated;
  });

  // Mirror the change into the persisted custom list when it lives there.
  const custom = storage.read(CUSTOM_SIGNALS_KEY, []) || [];
  if (custom.some((signal) => signal.id === id)) {
    storage.write(CUSTOM_SIGNALS_KEY, custom.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }

  set({ signals });
  return updated;
}

export const findSignal = (id) => state.signals.find((signal) => signal.id === id) || null;

/** Drop session-created reports and return to pure seed data. */
export function clearCustomSignals() {
  storage.remove(CUSTOM_SIGNALS_KEY);
}
