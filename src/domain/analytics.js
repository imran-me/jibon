/**
 * Analytics engine.
 *
 * Pure functions over an array of signals. Nothing here touches the DOM or the
 * store, which means every number on screen can be recomputed — and checked —
 * in isolation. The drill-down drawer relies on this: it re-runs the same
 * functions against a narrowed slice rather than caching pre-baked results.
 */

import {
  CATEGORIES, WARDS, CHANNELS, STATUSES, SEVERITIES,
  getCategory, isCritical, isOpen, isBreached,
} from './taxonomy.js';
import * as fmt from '../core/format.js';

const HOUR = 3_600_000;
const DAY = 86_400_000;

/* ── Slicing ──────────────────────────────────────────────────────────────── */

/** Reports created within the last `days` days. */
export function withinRange(signals, days, now = Date.now()) {
  const cutoff = now - days * DAY;
  return signals.filter((signal) => signal.createdAt >= cutoff);
}

/** The equivalent window immediately before the current one, for deltas. */
export function previousRange(signals, days, now = Date.now()) {
  const end = now - days * DAY;
  const start = end - days * DAY;
  return signals.filter((signal) => signal.createdAt >= start && signal.createdAt < end);
}

/** Apply the filter facets plus free-text search. */
export function applyFilters(signals, filters) {
  const query = (filters.q || '').trim().toLowerCase();

  return signals.filter((signal) => {
    if (filters.categories?.length && !filters.categories.includes(signal.category)) return false;
    if (filters.wards?.length && !filters.wards.includes(signal.ward)) return false;
    if (filters.statuses?.length && !filters.statuses.includes(signal.status)) return false;
    if (filters.channels?.length && !filters.channels.includes(signal.channel)) return false;
    if (filters.severities?.length && !filters.severities.includes(signal.severity)) return false;

    if (query) {
      const haystack = `${signal.id} ${signal.text} ${signal.place} ${signal.assignee ?? ''}`.toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    return true;
  });
}

/** Sort a list by a field, with sensible handling of nulls. */
export function sortSignals(signals, { key, dir }) {
  const factor = dir === 'asc' ? 1 : -1;

  return [...signals].sort((a, b) => {
    let left = a[key];
    let right = b[key];

    if (key === 'responseHours') {
      left = responseHours(a);
      right = responseHours(b);
    }

    // Unresolved rows have no response time; park them at the end either way.
    if (left === null || left === undefined) return 1;
    if (right === null || right === undefined) return -1;

    if (typeof left === 'string') return left.localeCompare(right) * factor;
    return (left - right) * factor;
  });
}

/* ── Statistics helpers ───────────────────────────────────────────────────── */

export function percentile(values, p) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = (sorted.length - 1) * p;
  const low = Math.floor(rank);
  const high = Math.ceil(rank);
  if (low === high) return sorted[low];
  return sorted[low] + (sorted[high] - sorted[low]) * (rank - low);
}

export const median = (values) => percentile(values, 0.5);
export const mean = (values) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : null);

/** Hours from creation to resolution; null while a report is still open. */
export const responseHours = (signal) =>
  signal.resolvedAt ? (signal.resolvedAt - signal.createdAt) / HOUR : null;

/** Relative change between two periods; null when the baseline is empty. */
function change(current, previous) {
  if (!Number.isFinite(previous) || previous === 0) return null;
  return (current - previous) / previous;
}

/* ── Headline metrics ─────────────────────────────────────────────────────── */

/**
 * Compute one period's raw metrics. Kept separate from KPI presentation so the
 * same numbers can be reused for the previous period without duplicating logic.
 */
export function metrics(signals, now = Date.now()) {
  const resolved = signals.filter((signal) => signal.status === 'resolved');
  const open = signals.filter(isOpen);
  const responses = resolved.map(responseHours).filter(Number.isFinite);
  const breached = signals.filter((signal) => isBreached(signal, now));
  const duplicates = signals.filter((signal) => signal.duplicateOf);
  const autoTriaged = signals.filter((signal) => signal.autoTriaged);

  return {
    total: signals.length,
    open: open.length,
    resolved: resolved.length,
    critical: signals.filter(isCritical).length,
    criticalOpen: open.filter(isCritical).length,
    medianResponse: median(responses),
    p90Response: percentile(responses, 0.9),
    meanResponse: mean(responses),
    resolutionRate: signals.length ? resolved.length / signals.length : 0,
    breachRate: signals.length ? breached.length / signals.length : 0,
    breached: breached.length,
    duplicateRate: signals.length ? duplicates.length / signals.length : 0,
    duplicates: duplicates.length,
    autoTriageRate: signals.length ? autoTriaged.length / signals.length : 0,
    meanConfidence: mean(signals.map((signal) => signal.confidence)),
    reporters: new Set(signals.map((signal) => signal.reporter)).size,
    backlogHours: median(open.map((signal) => (now - signal.createdAt) / HOUR)),
  };
}

/**
 * The eight headline tiles.
 *
 * `inverse: true` marks metrics where an increase is bad, so the delta chip is
 * coloured by meaning rather than by sign.
 */
export function buildKpis(signals, allSignals, range, now = Date.now()) {
  const current = metrics(signals, now);
  const prior = metrics(previousRange(allSignals, range, now), now);
  const spark = dailyCounts(signals, range, now).map((point) => point.value);

  const tile = (config) => ({
    delta: null,
    inverse: false,
    spark,
    ...config,
  });

  return [
    tile({
      id: 'total',
      label: 'Total reports',
      value: current.total,
      display: fmt.num(current.total),
      delta: change(current.total, prior.total),
      hint: `Citizen reports filed in the last ${range} days.`,
    }),
    tile({
      id: 'open',
      label: 'Open',
      value: current.open,
      display: fmt.num(current.open),
      delta: change(current.open, prior.open),
      inverse: true,
      spark: dailyCounts(signals.filter(isOpen), range, now).map((p) => p.value),
      hint: 'Reports not yet marked resolved, across every stage of triage.',
    }),
    tile({
      id: 'response',
      label: 'Median response',
      value: current.medianResponse,
      display: current.medianResponse === null ? '—' : fmt.hours(current.medianResponse),
      delta: change(current.medianResponse, prior.medianResponse),
      inverse: true,
      hint: 'Middle of the creation-to-resolution distribution for closed reports.',
    }),
    tile({
      id: 'resolution',
      label: 'Resolution rate',
      value: current.resolutionRate,
      display: fmt.pct(current.resolutionRate),
      delta: change(current.resolutionRate, prior.resolutionRate),
      hint: 'Share of reports in this window that reached a resolved state.',
    }),
    tile({
      id: 'critical',
      label: 'Critical open',
      value: current.criticalOpen,
      display: fmt.num(current.criticalOpen),
      delta: change(current.criticalOpen, prior.criticalOpen),
      inverse: true,
      spark: dailyCounts(signals.filter(isCritical), range, now).map((p) => p.value),
      hint: 'Severity 4 and 5 reports still awaiting resolution.',
    }),
    tile({
      id: 'breach',
      label: 'SLA breach rate',
      value: current.breachRate,
      display: fmt.pct(current.breachRate),
      delta: change(current.breachRate, prior.breachRate),
      inverse: true,
      hint: 'Reports that passed their category deadline, whether or not they closed.',
    }),
    tile({
      id: 'triage',
      label: 'AI triage coverage',
      value: current.autoTriageRate,
      display: fmt.pct(current.autoTriageRate),
      delta: change(current.autoTriageRate, prior.autoTriageRate),
      hint: 'Reports classified by the model without a human relabelling them.',
    }),
    tile({
      id: 'duplicates',
      label: 'Duplicates merged',
      value: current.duplicates,
      display: fmt.num(current.duplicates),
      delta: change(current.duplicates, prior.duplicates),
      hint: 'Reports folded into an existing case for the same issue and ward.',
    }),
  ];
}

/* ── Series ───────────────────────────────────────────────────────────────── */

/** One bucket per day across the window, zero-filled so gaps stay visible. */
export function dailyCounts(signals, days, now = Date.now()) {
  const buckets = new Map();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);

  for (let i = days - 1; i >= 0; i -= 1) {
    buckets.set(start.getTime() - i * DAY, 0);
  }

  for (const signal of signals) {
    const day = new Date(signal.createdAt);
    day.setHours(0, 0, 0, 0);
    const key = day.getTime();
    if (buckets.has(key)) buckets.set(key, buckets.get(key) + 1);
  }

  return Array.from(buckets, ([ts, value]) => ({ ts, value }));
}

/** Daily counts split by a field — the stacked/multi-line trend chart. */
export function dailyByField(signals, field, days, now = Date.now()) {
  const keys = distinctValues(field);
  return keys.map((key) => ({
    key: key.id,
    label: key.label,
    points: dailyCounts(signals.filter((signal) => signal[field] === key.id), days, now),
  }));
}

/** Counts per facet value, richest first, with share of total. */
export function breakdown(signals, field) {
  const counts = new Map();
  for (const signal of signals) {
    counts.set(signal[field], (counts.get(signal[field]) || 0) + 1);
  }

  const total = signals.length || 1;
  return distinctValues(field)
    .map((option) => ({
      id: option.id,
      label: option.label,
      value: counts.get(option.id) || 0,
      share: (counts.get(option.id) || 0) / total,
    }))
    .filter((row) => row.value > 0)
    .sort((a, b) => b.value - a.value);
}

/** The canonical option list for a field, so zero-count values keep their label. */
function distinctValues(field) {
  switch (field) {
    case 'category': return CATEGORIES.map((c) => ({ id: c.id, label: c.label }));
    case 'ward': return WARDS.map((w) => ({ id: w.id, label: w.label }));
    case 'channel': return CHANNELS.map((c) => ({ id: c.id, label: c.label }));
    case 'status': return STATUSES.map((s) => ({ id: s.id, label: s.label }));
    case 'severity': return SEVERITIES.map((s) => ({ id: s.id, label: `${s.short} · ${s.label}` }));
    case 'zone': return [{ id: 'North', label: 'Dhaka North' }, { id: 'South', label: 'Dhaka South' }];
    default: return [];
  }
}

/** Reports by hour of day — shows the commute peaks that drive staffing. */
export function hourHistogram(signals) {
  const buckets = Array.from({ length: 24 }, (_, hour) => ({ hour, value: 0 }));
  for (const signal of signals) {
    buckets[new Date(signal.createdAt).getHours()].value += 1;
  }
  return buckets;
}

/** Response-time distribution for resolved reports, in log-ish buckets. */
export function responseHistogram(signals) {
  const edges = [0, 2, 6, 12, 24, 48, 96, 168, Infinity];
  const labels = ['<2h', '2–6h', '6–12h', '12–24h', '1–2d', '2–4d', '4–7d', '7d+'];
  const buckets = labels.map((label) => ({ label, value: 0 }));

  for (const signal of signals) {
    const hours = responseHours(signal);
    if (hours === null) continue;
    const bucket = edges.findIndex((edge, i) => hours >= edge && hours < edges[i + 1]);
    if (bucket > -1) buckets[bucket].value += 1;
  }
  return buckets;
}

/** Ward × category grid used by the heat matrix. */
export function matrix(signals, rowField = 'ward', colField = 'category') {
  const rows = distinctValues(rowField);
  const cols = distinctValues(colField);
  const counts = new Map();

  for (const signal of signals) {
    const key = `${signal[rowField]}|${signal[colField]}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  }

  const cells = rows.map((row) => ({
    id: row.id,
    label: row.label,
    total: 0,
    cells: cols.map((col) => {
      const value = counts.get(`${row.id}|${col.id}`) || 0;
      return { row: row.id, col: col.id, colLabel: col.label, value };
    }),
  }));

  for (const row of cells) row.total = row.cells.reduce((sum, cell) => sum + cell.value, 0);

  const max = Math.max(1, ...cells.flatMap((row) => row.cells.map((cell) => cell.value)));
  return { rows: cells, cols, max };
}

/** Per-category performance table: volume, median response, breach rate. */
export function categoryPerformance(signals, now = Date.now()) {
  return CATEGORIES.map((category) => {
    const subset = signals.filter((signal) => signal.category === category.id);
    const stats = metrics(subset, now);
    return {
      id: category.id,
      label: category.label,
      dept: category.dept,
      sla: category.sla,
      total: stats.total,
      open: stats.open,
      medianResponse: stats.medianResponse,
      resolutionRate: stats.resolutionRate,
      breachRate: stats.breachRate,
    };
  })
    .filter((row) => row.total > 0)
    .sort((a, b) => b.total - a.total);
}

/* ── Narrative ────────────────────────────────────────────────────────────── */

/**
 * Rule-based insights.
 *
 * These are what the Analytics view shows when there is no API key, and they
 * also become the evidence block handed to Gemini when there is one — the model
 * gets pre-computed facts rather than a raw dump, which keeps it from
 * hallucinating totals.
 */
export function deriveInsights(signals, range, now = Date.now()) {
  const stats = metrics(signals, now);
  const prior = metrics(previousRange(signals, range, now), now);
  const insights = [];

  const byCategory = breakdown(signals, 'category');
  const byWard = breakdown(signals, 'ward');

  if (byCategory.length) {
    const top = byCategory[0];
    insights.push(
      `${top.label} is the largest driver at ${fmt.num(top.value)} reports ` +
      `(${fmt.pct(top.share)} of volume) over the last ${range} days.`,
    );
  }

  if (byWard.length) {
    const top = byWard[0];
    const perCapita = byWard
      .map((row) => ({ ...row, rate: row.value / (WARDS.find((w) => w.id === row.id)?.population || 1) * 100_000 }))
      .sort((a, b) => b.rate - a.rate)[0];

    insights.push(
      `${top.label} files the most reports in absolute terms (${fmt.num(top.value)}), ` +
      `but ${perCapita.label} leads per capita at ${fmt.dec(perCapita.rate)} per 100k residents.`,
    );
  }

  const slowest = categoryPerformance(signals, now)
    .filter((row) => Number.isFinite(row.medianResponse))
    .sort((a, b) => b.breachRate - a.breachRate)[0];

  if (slowest) {
    insights.push(
      `${slowest.label} breaches its ${slowest.sla}h target on ${fmt.pct(slowest.breachRate)} of cases — ` +
      `the widest gap between promise and delivery. Owner: ${slowest.dept}.`,
    );
  }

  const volumeChange = change(stats.total, prior.total);
  if (volumeChange !== null && Math.abs(volumeChange) > 0.05) {
    insights.push(
      `Volume is ${volumeChange > 0 ? 'up' : 'down'} ${fmt.signedPct(volumeChange)} against the previous ` +
      `${range} days, with median response ${
        stats.medianResponse < prior.medianResponse ? 'improving' : 'slipping'
      } to ${fmt.hours(stats.medianResponse)}.`,
    );
  }

  if (stats.duplicates > 0) {
    insights.push(
      `${fmt.num(stats.duplicates)} reports (${fmt.pct(stats.duplicateRate)}) were folded into existing cases, ` +
      `saving roughly ${fmt.num(Math.round(stats.duplicates * 0.75))} duplicate site visits.`,
    );
  }

  return insights;
}

/** Compact, token-cheap summary of the current slice for the model. */
export function evidencePacket(signals, range, now = Date.now()) {
  const stats = metrics(signals, now);

  return {
    window_days: range,
    generated_at: new Date(now).toISOString(),
    totals: {
      reports: stats.total,
      open: stats.open,
      resolved: stats.resolved,
      critical_open: stats.criticalOpen,
      unique_reporters: stats.reporters,
    },
    performance: {
      median_response_hours: stats.medianResponse === null ? null : Number(stats.medianResponse.toFixed(1)),
      p90_response_hours: stats.p90Response === null ? null : Number(stats.p90Response.toFixed(1)),
      resolution_rate: Number(stats.resolutionRate.toFixed(3)),
      sla_breach_rate: Number(stats.breachRate.toFixed(3)),
      duplicate_rate: Number(stats.duplicateRate.toFixed(3)),
    },
    by_category: breakdown(signals, 'category').map((row) => ({
      category: row.label,
      count: row.value,
      share: Number(row.share.toFixed(3)),
      sla_hours: getCategory(row.id).sla,
    })),
    by_ward: breakdown(signals, 'ward').map((row) => ({ ward: row.label, count: row.value })),
    by_channel: breakdown(signals, 'channel').map((row) => ({ channel: row.label, count: row.value })),
    category_performance: categoryPerformance(signals, now).map((row) => ({
      category: row.label,
      median_response_hours: row.medianResponse === null ? null : Number(row.medianResponse.toFixed(1)),
      sla_breach_rate: Number(row.breachRate.toFixed(3)),
      open: row.open,
    })),
  };
}
