/**
 * Application state.
 *
 * One mutable object behind a `subscribe`/`set` pair — enough for a console this
 * size, and it keeps every mutation traceable through a single function instead
 * of scattered across the interfaces.
 *
 * Persistence is partial by design:
 *   - settings and range survive a reload (a judge reloading keeps their API key)
 *   - filters and paging do not (every visit starts from a clean board)
 *   - incidents raised during the session are stored apart from the seed history
 */

import * as storage from './storage.js';

const SETTINGS_KEY = 'settings';
const RANGE_KEY = 'range';
const LIVE_KEY = 'incidents.live';

const DEFAULT_SETTINGS = {
  geminiKey: '',
  elevenKey: '',
  model: 'gemini-2.5-flash',
  voiceId: '21m00Tcm4TlvDq8ikWAM',
  autoSpeak: false,
  consentMic: false,
  consentCamera: false,
  redactPII: true,
  role: 'command',
};

export const DEFAULT_FILTERS = Object.freeze({
  q: '',
  types: [],
  priorities: [],
  stages: [],
  channels: [],
  districts: [],
  modes: [],
});

const state = {
  ready: false,
  incidents: [],
  range: storage.read(RANGE_KEY, 7),
  filters: { ...DEFAULT_FILTERS },
  sort: { key: 'createdAt', dir: 'desc' },
  page: 1,
  pageSize: 12,
  /** Id of the case the simulation is currently driving, if any. */
  simulating: null,
  settings: { ...DEFAULT_SETTINGS, ...(storage.read(SETTINGS_KEY, {}) || {}) },
};

const subscribers = new Set();

export const getState = () => state;

/**
 * Merge a patch into state and notify subscribers. The changed key list lets a
 * subscriber cheaply skip work it does not care about.
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

export const hasGeminiKey = () => Boolean(state.settings.geminiKey.trim());
export const hasElevenKey = () => Boolean(state.settings.elevenKey.trim());

/* ── Range, filters, sorting ──────────────────────────────────────────────── */

export function setRange(days) {
  storage.write(RANGE_KEY, days);
  set({ range: days, page: 1 });
}

export function setFilters(patch) {
  set({ filters: { ...state.filters, ...patch }, page: 1 });
}

export function toggleFilter(facet, value) {
  const current = state.filters[facet] || [];
  setFilters({
    [facet]: current.includes(value)
      ? current.filter((item) => item !== value)
      : [...current, value],
  });
}

export function clearFilters() {
  set({ filters: { ...DEFAULT_FILTERS }, page: 1 });
}

export function activeFilterCount() {
  const { q, ...facets } = state.filters;
  return Object.values(facets).reduce((total, list) => total + list.length, 0) + (q ? 1 : 0);
}

export function setSort(key) {
  const dir = state.sort.key === key && state.sort.dir === 'desc' ? 'asc' : 'desc';
  set({ sort: { key, dir }, page: 1 });
}

export const setPage = (page) => set({ page: Math.max(1, page) });

/* ── Incidents ────────────────────────────────────────────────────────────── */

/** Seed the board. Cases raised in earlier sessions are merged back in. */
export function loadIncidents(seeded) {
  const live = storage.read(LIVE_KEY, []) || [];
  set({ incidents: [...live, ...seeded], ready: true });
}

/** Raise a new case and persist it so a reload does not lose the demo state. */
export function addIncident(incident) {
  const live = storage.read(LIVE_KEY, []) || [];
  storage.write(LIVE_KEY, [incident, ...live].slice(0, 40));
  set({ incidents: [incident, ...state.incidents] });
  return incident;
}

/**
 * Replace one incident.
 *
 * The simulation mutates incident objects in place for speed, so callers pass
 * the mutated object back through here to trigger a render.
 */
export function commitIncident(updated) {
  const live = storage.read(LIVE_KEY, []) || [];
  if (live.some((incident) => incident.id === updated.id)) {
    storage.write(LIVE_KEY, live.map((incident) => (incident.id === updated.id ? updated : incident)));
  }

  set({
    incidents: state.incidents.map((incident) => (incident.id === updated.id ? updated : incident)),
  });
  return updated;
}

export const findIncident = (id) => state.incidents.find((incident) => incident.id === id) || null;

export function clearLiveIncidents() {
  storage.remove(LIVE_KEY);
}

export const setSimulating = (id) => set({ simulating: id });
