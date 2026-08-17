/**
 * Analytics over the incident set.
 *
 * Pure functions, no DOM and no store access, so every figure on the board can
 * be recomputed in isolation — which is exactly what the drill-down panels do
 * when they narrow to a slice. A tile and the panel that explains it always run
 * the same code over the same rows.
 */

import {
  EMERGENCY_TYPES, PRIORITIES, STAGES, CHANNELS,
  getType, getPriority, isCritical,
} from './taxonomy.js';
import { FACILITIES, getFacility } from './network.js';
import {
  decisionMinutes, responseMinutes, totalMinutes, preArrivalLeadMinutes,
  isActiveIncident, MODES,
} from './incidents.js';
import * as fmt from '../core/format.js';

const DAY = 86_400_000;

/* ── Slicing ──────────────────────────────────────────────────────────────── */

export function withinRange(incidents, days, now = Date.now()) {
  const cutoff = now - days * DAY;
  return incidents.filter((incident) => incident.createdAt >= cutoff);
}

export function previousRange(incidents, days, now = Date.now()) {
  const end = now - days * DAY;
  return incidents.filter((incident) => incident.createdAt >= end - days * DAY && incident.createdAt < end);
}

export function applyFilters(incidents, filters) {
  const query = (filters.q || '').trim().toLowerCase();

  return incidents.filter((incident) => {
    if (filters.types?.length && !filters.types.includes(incident.type)) return false;
    if (filters.priorities?.length && !filters.priorities.includes(incident.priority)) return false;
    if (filters.stages?.length && !filters.stages.includes(incident.stage)) return false;
    if (filters.channels?.length && !filters.channels.includes(incident.channel)) return false;
    if (filters.districts?.length && !filters.districts.includes(incident.origin.district)) return false;
    if (filters.modes?.length && !filters.modes.includes(incident.mode)) return false;

    if (query) {
      const haystack = [
        incident.id, incident.narrative, incident.origin.label,
        incident.assignments.unit, incident.assignments.clinician,
      ].join(' ').toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    return true;
  });
}

/** Sort, with unresolved timings pushed to the end regardless of direction. */
export function sortIncidents(incidents, { key, dir }) {
  const factor = dir === 'asc' ? 1 : -1;

  const valueOf = (incident) => {
    switch (key) {
      case 'decision': return decisionMinutes(incident);
      case 'response': return responseMinutes(incident);
      case 'total': return totalMinutes(incident);
      case 'priority': return PRIORITIES.findIndex((p) => p.id === incident.priority);
      case 'stage': return STAGES.find((s) => s.id === incident.stage)?.order ?? 0;
      case 'type': return getType(incident.type).label;
      case 'district': return incident.origin.district;
      default: return incident[key];
    }
  };

  return [...incidents].sort((a, b) => {
    const left = valueOf(a);
    const right = valueOf(b);
    if (left === null || left === undefined) return 1;
    if (right === null || right === undefined) return -1;
    if (typeof left === 'string') return left.localeCompare(right) * factor;
    return (left - right) * factor;
  });
}

/* ── Statistics ───────────────────────────────────────────────────────────── */

export function percentile(values, p) {
  const clean = values.filter(Number.isFinite);
  if (!clean.length) return null;
  const sorted = [...clean].sort((a, b) => a - b);
  const rank = (sorted.length - 1) * p;
  const low = Math.floor(rank);
  const high = Math.ceil(rank);
  return low === high ? sorted[low] : sorted[low] + (sorted[high] - sorted[low]) * (rank - low);
}

export const median = (values) => percentile(values, 0.5);

export const mean = (values) => {
  const clean = values.filter(Number.isFinite);
  return clean.length ? clean.reduce((a, b) => a + b, 0) / clean.length : null;
};

const change = (current, previous) =>
  Number.isFinite(previous) && previous !== 0 && Number.isFinite(current)
    ? (current - previous) / previous
    : null;

/* ── Core metrics ─────────────────────────────────────────────────────────── */

export function metrics(incidents, now = Date.now()) {
  const active = incidents.filter(isActiveIncident);
  const transporting = incidents.filter((incident) => incident.stage === 'transporting');
  const decisions = incidents.map(decisionMinutes);
  const responses = incidents.map(responseMinutes);
  const totals = incidents.map(totalMinutes);
  const leads = incidents.map(preArrivalLeadMinutes);
  const equipped = incidents.filter((incident) => incident.assignments.equipped);
  const dispatched = incidents.filter((incident) => incident.dispatchedAt);

  // Facilities currently holding a prepared-but-not-arrived case.
  const preparing = new Set();
  for (const incident of active) {
    for (const [facilityId, state] of Object.entries(incident.prep || {})) {
      if (state === 'preparing' || state === 'ready' || state === 'notified') preparing.add(facilityId);
    }
  }

  const windowValues = incidents
    .filter((incident) => incident.outcome)
    .map((incident) => incident.outcome.windowConsumed);

  return {
    total: incidents.length,
    active: active.length,
    critical: incidents.filter(isCritical).length,
    criticalActive: active.filter(isCritical).length,
    transporting: transporting.length,

    medianDecision: median(decisions),
    medianResponse: median(responses),
    medianTotal: median(totals),
    p90Total: percentile(totals, 0.9),

    preArrivalLead: mean(leads.filter((value) => value !== null)),
    facilitiesPreparing: preparing.size,
    preparingIds: [...preparing],

    cliniciansConnected: new Set(
      incidents.filter((i) => i.assignments.clinician).map((i) => i.assignments.clinician),
    ).size,
    volunteersEngaged: incidents.reduce((sum, i) => sum + (i.assignments.volunteers?.length || 0), 0),

    equipmentMatchRate: dispatched.length ? equipped.length / dispatched.length : 0,
    meanConfidence: mean(incidents.map((incident) => incident.confidence)),
    verifiedRate: incidents.length
      ? incidents.filter((incident) => incident.verifiedBy).length / incidents.length
      : 0,

    windowConsumed: mean(windowValues),
    withinWindow: windowValues.length
      ? windowValues.filter((value) => value <= 1).length / windowValues.length
      : 0,
    survivalIndex: mean(incidents.filter((i) => i.outcome).map((i) => i.outcome.survivalIndex)),

    patients: incidents.reduce((sum, incident) => sum + (incident.patients || 1), 0),
  };
}

/**
 * Side-by-side comparison of the two coordination modes.
 *
 * This is the impact argument, computed rather than asserted: the same
 * geography and the same emergencies, differing only in how the information
 * moved.
 */
export function modeComparison(incidents, now = Date.now()) {
  const build = (mode) => {
    const subset = incidents.filter((incident) => incident.mode === mode);
    const stats = metrics(subset, now);
    return {
      mode,
      label: MODES[mode].label,
      count: subset.length,
      decision: stats.medianDecision,
      response: stats.medianResponse,
      total: stats.medianTotal,
      lead: stats.preArrivalLead,
      equipment: stats.equipmentMatchRate,
      withinWindow: stats.withinWindow,
      survival: stats.survivalIndex,
    };
  };

  const baseline = build('baseline');
  const jibon = build('jibon');

  return {
    baseline,
    jibon,
    deltas: {
      decision: change(jibon.decision, baseline.decision),
      response: change(jibon.response, baseline.response),
      total: change(jibon.total, baseline.total),
      equipment: change(jibon.equipment, baseline.equipment),
      withinWindow: change(jibon.withinWindow, baseline.withinWindow),
      survival: change(jibon.survival, baseline.survival),
      /* Minutes, not a ratio — baseline lead time is zero by definition. */
      leadMinutes: (jibon.lead || 0) - (baseline.lead || 0),
    },
  };
}

/**
 * The command-centre tiles.
 *
 * `inverse: true` marks metrics where an increase is bad, so a green chip always
 * means "this got better" regardless of which way the number moved.
 */
export function buildKpis(incidents, allIncidents, range, now = Date.now()) {
  const current = metrics(incidents, now);
  const prior = metrics(applyRangeOnly(allIncidents, range, now), now);
  const trend = dailyCounts(incidents, range, now).map((point) => point.value);

  const tile = (config) => ({ delta: null, inverse: false, spark: trend, ...config });

  return [
    tile({
      id: 'active',
      label: 'Active emergencies',
      value: current.active,
      display: fmt.num(current.active),
      delta: change(current.active, prior.active),
      hint: 'Cases open right now — reported through to transporting.',
    }),
    tile({
      id: 'critical',
      label: 'Critical (P1)',
      value: current.criticalActive,
      display: fmt.num(current.criticalActive),
      delta: change(current.criticalActive, prior.criticalActive),
      inverse: true,
      hint: 'Immediate threat to life, still open. These set the dispatch order.',
    }),
    tile({
      id: 'transit',
      label: 'Units in transit',
      value: current.transporting,
      display: fmt.num(current.transporting),
      delta: change(current.transporting, prior.transporting),
      hint: 'Ambulances currently carrying a patient to a facility.',
    }),
    tile({
      id: 'decision',
      label: 'Time to dispatch',
      value: current.medianDecision,
      display: current.medianDecision === null ? '—' : fmt.minutes(current.medianDecision),
      delta: change(current.medianDecision, prior.medianDecision),
      inverse: true,
      hint: 'Median from the call being raised to an ambulance being assigned.',
    }),
    tile({
      id: 'response',
      label: 'Time to patient',
      value: current.medianResponse,
      display: current.medianResponse === null ? '—' : fmt.minutes(current.medianResponse),
      delta: change(current.medianResponse, prior.medianResponse),
      inverse: true,
      hint: 'Median from dispatch to the crew physically reaching the patient.',
    }),
    tile({
      id: 'preparing',
      label: 'Hospitals preparing',
      value: current.facilitiesPreparing,
      display: fmt.num(current.facilitiesPreparing),
      delta: change(current.facilitiesPreparing, prior.facilitiesPreparing),
      hint: 'Facilities that have an inbound case and are readying resources.',
    }),
    tile({
      id: 'lead',
      label: 'Pre-arrival lead',
      value: current.preArrivalLead,
      display: current.preArrivalLead === null ? '—' : fmt.minutes(current.preArrivalLead),
      delta: change(current.preArrivalLead, prior.preArrivalLead),
      hint: 'How long the receiving hospital had the case before the patient arrived.',
    }),
    tile({
      id: 'window',
      label: 'Within clinical window',
      value: current.withinWindow,
      display: fmt.pct(current.withinWindow),
      delta: change(current.withinWindow, prior.withinWindow),
      hint: 'Share of cases handed over inside the time budget for that emergency.',
    }),
  ];
}

const applyRangeOnly = (incidents, range, now) => previousRange(incidents, range, now);

/* ── Series ───────────────────────────────────────────────────────────────── */

export function dailyCounts(incidents, days, now = Date.now()) {
  const buckets = new Map();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);

  for (let i = days - 1; i >= 0; i -= 1) buckets.set(start.getTime() - i * DAY, 0);

  for (const incident of incidents) {
    const day = new Date(incident.createdAt);
    day.setHours(0, 0, 0, 0);
    const key = day.getTime();
    if (buckets.has(key)) buckets.set(key, buckets.get(key) + 1);
  }

  return Array.from(buckets, ([ts, value]) => ({ ts, value }));
}

/** Daily median of a derived timing — used for the response-time trend. */
export function dailyMedian(incidents, measure, days, now = Date.now()) {
  const buckets = new Map();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);

  for (let i = days - 1; i >= 0; i -= 1) buckets.set(start.getTime() - i * DAY, []);

  for (const incident of incidents) {
    const day = new Date(incident.createdAt);
    day.setHours(0, 0, 0, 0);
    const key = day.getTime();
    if (!buckets.has(key)) continue;
    const value = measure(incident);
    if (Number.isFinite(value)) buckets.get(key).push(value);
  }

  return Array.from(buckets, ([ts, values]) => ({ ts, value: median(values) ?? 0 }));
}

const OPTIONS = {
  type: () => EMERGENCY_TYPES.map((item) => ({ id: item.id, label: item.label })),
  priority: () => PRIORITIES.map((item) => ({ id: item.id, label: `${item.id} · ${item.label}` })),
  stage: () => STAGES.map((item) => ({ id: item.id, label: item.label })),
  channel: () => CHANNELS.map((item) => ({ id: item.id, label: item.label })),
  mode: () => Object.values(MODES).map((item) => ({ id: item.id, label: item.label })),
  district: (incidents) => [...new Set(incidents.map((i) => i.origin.district))]
    .sort()
    .map((district) => ({ id: district, label: district })),
};

/** Counts per facet value, richest first. */
export function breakdown(incidents, field) {
  const read = (incident) => (field === 'district' ? incident.origin.district : incident[field]);
  const counts = new Map();
  for (const incident of incidents) counts.set(read(incident), (counts.get(read(incident)) || 0) + 1);

  const total = incidents.length || 1;
  const options = (OPTIONS[field] || (() => []))(incidents);

  return options
    .map((option) => ({
      id: option.id,
      label: option.label,
      value: counts.get(option.id) || 0,
      share: (counts.get(option.id) || 0) / total,
    }))
    .filter((row) => row.value > 0)
    .sort((a, b) => b.value - a.value);
}

export function hourHistogram(incidents) {
  const buckets = Array.from({ length: 24 }, (_, hour) => ({ hour, value: 0 }));
  for (const incident of incidents) buckets[new Date(incident.createdAt).getHours()].value += 1;
  return buckets;
}

/** Per-type operational performance. */
export function typePerformance(incidents, now = Date.now()) {
  return EMERGENCY_TYPES.map((definition) => {
    const subset = incidents.filter((incident) => incident.type === definition.id);
    const stats = metrics(subset, now);
    return {
      id: definition.id,
      label: definition.label,
      dept: definition.dept,
      window: definition.window,
      total: subset.length,
      active: stats.active,
      medianDecision: stats.medianDecision,
      medianResponse: stats.medianResponse,
      medianTotal: stats.medianTotal,
      withinWindow: stats.withinWindow,
      equipmentMatch: stats.equipmentMatchRate,
    };
  })
    .filter((row) => row.total > 0)
    .sort((a, b) => b.total - a.total);
}

/** Facility load: how many cases each hospital is holding or has received. */
export function facilityLoad(incidents) {
  return FACILITIES.map((facility) => {
    const inbound = incidents.filter((incident) => incident.route?.destinationId === facility.id);
    const relaying = incidents.filter((incident) => incident.route?.relayIds?.includes(facility.id));
    const active = inbound.filter(isActiveIncident);

    return {
      id: facility.id,
      label: facility.name,
      city: facility.city,
      tier: facility.tier,
      value: inbound.length,
      active: active.length,
      relays: relaying.length,
      prepState: active
        .map((incident) => incident.prep?.[facility.id])
        .find((state) => state === 'ready' || state === 'preparing') || 'idle',
    };
  })
    .filter((row) => row.value > 0 || row.relays > 0)
    .sort((a, b) => b.active - a.active || b.value - a.value);
}

/* ── Narrative ────────────────────────────────────────────────────────────── */

/**
 * Rule-based findings. These are what the console shows with no API key, and
 * they are also the evidence handed to Gemini when there is one — the model
 * receives computed facts rather than raw rows, which is what keeps it from
 * inventing totals.
 */
export function deriveInsights(incidents, range, now = Date.now()) {
  const stats = metrics(incidents, now);
  const comparison = modeComparison(incidents, now);
  const insights = [];

  if (comparison.baseline.count && comparison.jibon.count) {
    const saved = (comparison.baseline.decision ?? 0) - (comparison.jibon.decision ?? 0);
    insights.push(
      `Time from call to dispatch fell from ${fmt.minutes(comparison.baseline.decision)} under conventional ` +
      `handling to ${fmt.minutes(comparison.jibon.decision)} with coordinated triage — ` +
      `${fmt.minutes(Math.abs(saved))} recovered before an ambulance even moves.`,
    );

    insights.push(
      `Receiving hospitals now get the case ${fmt.minutes(comparison.jibon.lead)} before the patient arrives. ` +
      `In the conventional chain that figure is zero: the hospital learns of the patient at the door.`,
    );

    insights.push(
      `Equipment matched to the emergency on dispatch rose from ${fmt.pct(comparison.baseline.equipment)} ` +
      `to ${fmt.pct(comparison.jibon.equipment)} — the same ambulances, loaded on the basis of a classified case.`,
    );
  }

  const worst = typePerformance(incidents, now)
    .filter((row) => Number.isFinite(row.medianTotal))
    .sort((a, b) => a.withinWindow - b.withinWindow)[0];

  if (worst) {
    insights.push(
      `${worst.label} is the weakest pathway: only ${fmt.pct(worst.withinWindow)} of cases reach definitive ` +
      `care inside the ${worst.window}-minute window, against a median end-to-end time of ${fmt.minutes(worst.medianTotal)}.`,
    );
  }

  const loads = facilityLoad(incidents);
  if (loads.length) {
    insights.push(
      `${loads[0].label} carries the heaviest inbound load at ${fmt.num(loads[0].value)} cases, ` +
      `with ${fmt.num(loads[0].active)} active right now.`,
    );
  }

  return insights;
}

/** Compact packet for the model. Numbers only — no raw patient narratives. */
export function evidencePacket(incidents, range, now = Date.now()) {
  const stats = metrics(incidents, now);
  const comparison = modeComparison(incidents, now);

  const round = (value, digits = 1) => (Number.isFinite(value) ? Number(value.toFixed(digits)) : null);

  return {
    window_days: range,
    generated_at: new Date(now).toISOString(),
    totals: {
      incidents: stats.total,
      active: stats.active,
      critical_active: stats.criticalActive,
      in_transit: stats.transporting,
      patients: stats.patients,
      hospitals_preparing: stats.facilitiesPreparing,
      clinicians_connected: stats.cliniciansConnected,
      volunteers_engaged: stats.volunteersEngaged,
    },
    timings_minutes: {
      median_call_to_dispatch: round(stats.medianDecision),
      median_dispatch_to_patient: round(stats.medianResponse),
      median_end_to_end: round(stats.medianTotal),
      p90_end_to_end: round(stats.p90Total),
      mean_pre_arrival_lead: round(stats.preArrivalLead),
    },
    quality: {
      within_clinical_window: round(stats.withinWindow, 3),
      equipment_match_rate: round(stats.equipmentMatchRate, 3),
      mean_ai_confidence: round(stats.meanConfidence, 3),
      professionally_verified_rate: round(stats.verifiedRate, 3),
    },
    mode_comparison: {
      conventional: {
        cases: comparison.baseline.count,
        median_call_to_dispatch: round(comparison.baseline.decision),
        median_end_to_end: round(comparison.baseline.total),
        pre_arrival_lead: round(comparison.baseline.lead),
        equipment_match_rate: round(comparison.baseline.equipment, 3),
        within_window: round(comparison.baseline.withinWindow, 3),
      },
      coordinated: {
        cases: comparison.jibon.count,
        median_call_to_dispatch: round(comparison.jibon.decision),
        median_end_to_end: round(comparison.jibon.total),
        pre_arrival_lead: round(comparison.jibon.lead),
        equipment_match_rate: round(comparison.jibon.equipment, 3),
        within_window: round(comparison.jibon.withinWindow, 3),
      },
    },
    by_type: breakdown(incidents, 'type').map((row) => ({ type: row.label, count: row.value })),
    by_priority: breakdown(incidents, 'priority').map((row) => ({ priority: row.label, count: row.value })),
    by_district: breakdown(incidents, 'district').map((row) => ({ district: row.label, count: row.value })),
    facility_load: facilityLoad(incidents).slice(0, 6).map((row) => ({
      facility: row.label, inbound: row.value, active: row.active, relay_cases: row.relays,
    })),
  };
}

export { decisionMinutes, responseMinutes, totalMinutes, preArrivalLeadMinutes, getFacility };
