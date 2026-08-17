/**
 * The care network: facilities, what each can actually do, and the routing that
 * connects them.
 *
 * The relay logic in `planRoute` is the heart of the product. Standard dispatch
 * answers "which hospital is nearest". This answers a harder question — "which
 * hospital can definitively treat this, and who can we meet on the way there to
 * raise the level of care during the journey".
 */

import { getType, getCapability } from './taxonomy.js';

/**
 * Clinical capabilities a facility may hold. Kept as flat ids so a facility's
 * capability set can be intersected against an emergency's requirements.
 */
export const CAPABILITY_TAGS = {
  emergency: 'Emergency department',
  ot: 'Operating theatre',
  icu: 'Intensive care',
  ccu: 'Coronary care',
  cathlab: 'Cardiac cath lab',
  neuro: 'Neurosurgery',
  stroke: 'Stroke unit / thrombolysis',
  trauma: 'Major trauma',
  ortho: 'Orthopaedic surgery',
  burn: 'Burn unit',
  obstetric: 'Obstetric / caesarean',
  neonatal: 'Neonatal care',
  ct: 'CT imaging',
  mri: 'MRI',
  bloodbank: 'Blood bank',
  dialysis: 'Dialysis',
  ventilator: 'Ventilator capacity',
  toxicology: 'Toxicology',
};

/**
 * Facilities. Coordinates are real; bed counts, occupancy and readiness are
 * simulated operational state that the demo mutates live.
 *
 * `tier` drives routing: 1 = primary/stabilisation only, 2 = district general,
 * 3 = divisional tertiary, 4 = national specialist centre.
 */
export const FACILITIES = [
  {
    id: 'kuakata-uhc',
    name: 'Kuakata Upazila Health Complex',
    city: 'Kuakata',
    district: 'Patuakhali',
    tier: 1,
    lat: 21.8206,
    lng: 90.1195,
    beds: 50,
    capabilities: ['emergency', 'obstetric'],
    note: 'Stabilisation and basic emergency care only. No surgical theatre.',
  },
  {
    id: 'patuakhali-mch',
    name: 'Patuakhali Medical College Hospital',
    city: 'Patuakhali',
    district: 'Patuakhali',
    tier: 2,
    lat: 22.3596,
    lng: 90.3298,
    beds: 250,
    capabilities: ['emergency', 'ot', 'icu', 'ct', 'bloodbank', 'obstetric', 'ortho'],
    note: 'District referral centre. Can stabilise, transfuse and image.',
  },
  {
    id: 'barishal-smch',
    name: 'Sher-e-Bangla Medical College Hospital',
    city: 'Barishal',
    district: 'Barishal',
    tier: 3,
    lat: 22.6954,
    lng: 90.3536,
    beds: 1000,
    capabilities: ['emergency', 'ot', 'icu', 'ccu', 'ct', 'trauma', 'ortho', 'bloodbank', 'obstetric', 'neonatal', 'ventilator', 'dialysis'],
    note: 'Divisional tertiary centre for Barishal division.',
  },
  {
    id: 'barguna-dh',
    name: 'Barguna District Hospital',
    city: 'Barguna',
    district: 'Barguna',
    tier: 2,
    lat: 22.1550,
    lng: 90.1265,
    beds: 250,
    capabilities: ['emergency', 'ot', 'bloodbank', 'obstetric'],
    note: 'District hospital serving the southern coastal belt.',
  },
  {
    id: 'dhaka-dmch',
    name: 'Dhaka Medical College Hospital',
    city: 'Dhaka',
    district: 'Dhaka',
    tier: 4,
    lat: 23.7258,
    lng: 90.3975,
    beds: 2600,
    capabilities: ['emergency', 'ot', 'icu', 'ccu', 'ct', 'mri', 'trauma', 'ortho', 'neuro', 'stroke', 'bloodbank', 'obstetric', 'neonatal', 'ventilator', 'dialysis', 'toxicology'],
    note: 'National referral hospital. Full specialist coverage.',
  },
  {
    id: 'dhaka-nitor',
    name: 'NITOR (Pangu Hospital)',
    city: 'Dhaka',
    district: 'Dhaka',
    tier: 4,
    lat: 23.7776,
    lng: 90.3762,
    beds: 500,
    capabilities: ['emergency', 'ot', 'icu', 'ct', 'trauma', 'ortho', 'bloodbank', 'ventilator'],
    note: 'National orthopaedic and major trauma institute.',
  },
  {
    id: 'dhaka-nicvd',
    name: 'National Institute of Cardiovascular Diseases',
    city: 'Dhaka',
    district: 'Dhaka',
    tier: 4,
    lat: 23.7519,
    lng: 90.3822,
    beds: 650,
    capabilities: ['emergency', 'ot', 'icu', 'ccu', 'cathlab', 'ct', 'bloodbank', 'ventilator'],
    note: 'National cardiac centre. Primary PCI capable.',
  },
  {
    id: 'dhaka-nins',
    name: 'National Institute of Neurosciences',
    city: 'Dhaka',
    district: 'Dhaka',
    tier: 4,
    lat: 23.8103,
    lng: 90.3654,
    beds: 300,
    capabilities: ['emergency', 'ot', 'icu', 'ct', 'mri', 'neuro', 'stroke', 'ventilator'],
    note: 'National neurosurgery and stroke centre.',
  },
  {
    id: 'dhaka-burn',
    name: 'Sheikh Hasina National Burn Institute',
    city: 'Dhaka',
    district: 'Dhaka',
    tier: 4,
    lat: 23.7261,
    lng: 90.3982,
    beds: 500,
    capabilities: ['emergency', 'ot', 'icu', 'burn', 'bloodbank', 'ventilator'],
    note: 'National burn and plastic surgery institute.',
  },
  {
    id: 'faridpur-mch',
    name: 'Faridpur Medical College Hospital',
    city: 'Faridpur',
    district: 'Faridpur',
    tier: 3,
    lat: 23.6070,
    lng: 89.8429,
    beds: 500,
    capabilities: ['emergency', 'ot', 'icu', 'ct', 'trauma', 'ortho', 'bloodbank', 'obstetric', 'ventilator'],
    note: 'Divisional centre on the Barishal–Dhaka corridor.',
  },
  {
    id: 'gopalganj-dh',
    name: 'Gopalganj General Hospital',
    city: 'Gopalganj',
    district: 'Gopalganj',
    tier: 2,
    lat: 23.0050,
    lng: 89.8266,
    beds: 250,
    capabilities: ['emergency', 'ot', 'ct', 'bloodbank', 'obstetric'],
    note: 'On the Padma Bridge corridor toward Dhaka.',
  },
];

/** Which capability tags each emergency type needs at the definitive facility. */
const REQUIREMENTS = {
  cardiac: ['ccu', 'cathlab'],
  unconscious: ['emergency', 'ct', 'icu'],
  trauma: ['trauma', 'ot', 'bloodbank'],
  bleeding: ['ot', 'bloodbank'],
  breathing: ['emergency', 'icu', 'ventilator'],
  stroke: ['stroke', 'ct'],
  obstetric: ['obstetric', 'ot'],
  burn: ['burn', 'icu'],
  poisoning: ['toxicology', 'icu'],
  fire: ['burn', 'emergency'],
  police: ['emergency'],
  other: ['emergency'],
};

/** Capabilities that meaningfully help *during* a stop, short of definitive care. */
const STABILISATION_TAGS = ['emergency', 'bloodbank', 'ot', 'ct', 'icu'];

export const getFacility = (id) => FACILITIES.find((facility) => facility.id === id) || null;

export const requiredCapabilities = (type) => REQUIREMENTS[type] || REQUIREMENTS.other;

/* ── Geometry ─────────────────────────────────────────────────────────────── */

const R_KM = 6371;
const toRad = (deg) => (deg * Math.PI) / 180;

/** Great-circle distance in km. */
export function distanceKm(a, b) {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R_KM * Math.asin(Math.sqrt(h));
}

/**
 * Road distance estimate. Bangladeshi road routing is rarely direct — rivers,
 * ferries and single-carriageway highways add substantially to straight-line
 * distance, so we apply a detour factor rather than pretending crow-flies is real.
 */
const roadKm = (a, b) => distanceKm(a, b) * 1.35;

/**
 * Travel time in minutes. Average speed degrades on long runs (towns, traffic,
 * bridge queues) and improves marginally for ambulances running priority.
 */
export function travelMinutes(a, b, { priority = true } = {}) {
  const km = roadKm(a, b);
  const baseSpeed = km > 150 ? 55 : km > 60 ? 48 : 35;
  const speed = priority ? baseSpeed * 1.15 : baseSpeed;
  return (km / speed) * 60;
}

/* ── Routing ──────────────────────────────────────────────────────────────── */

/**
 * Score a facility as the definitive destination for an emergency.
 * Capability coverage dominates; travel time breaks ties. A nearer hospital that
 * cannot perform the operation is not a destination, it is a delay.
 */
function scoreDestination(facility, origin, type) {
  const needs = requiredCapabilities(type);
  const met = needs.filter((tag) => facility.capabilities.includes(tag));
  const coverage = met.length / needs.length;
  const minutes = travelMinutes(origin, facility);

  return {
    facility,
    coverage,
    met,
    missing: needs.filter((tag) => !facility.capabilities.includes(tag)),
    minutes,
    // Coverage is weighted an order of magnitude above speed on purpose.
    score: coverage * 1000 - minutes,
  };
}

/**
 * Find facilities that sit usefully on the way to the destination.
 *
 * A relay candidate must (a) genuinely be en route — the detour it adds is small
 * relative to the direct journey, (b) be reached materially earlier than the
 * destination, and (c) actually add capability the ambulance does not carry.
 */
function findRelays(origin, destination, type, { maxDetourRatio = 0.22 } = {}) {
  const direct = roadKm(origin, destination);

  return FACILITIES
    .filter((facility) => facility.id !== destination.id)
    .map((facility) => {
      const viaKm = roadKm(origin, facility) + roadKm(facility, destination);
      const detourRatio = (viaKm - direct) / direct;
      const reachedAt = travelMinutes(origin, facility);
      const stabilisation = facility.capabilities.filter((tag) => STABILISATION_TAGS.includes(tag));

      return { facility, detourRatio, reachedAt, stabilisation, viaKm };
    })
    .filter((candidate) =>
      candidate.detourRatio <= maxDetourRatio &&
      candidate.reachedAt > 4 &&
      candidate.reachedAt < travelMinutes(origin, destination) * 0.82 &&
      candidate.stabilisation.length >= 2)
    .sort((a, b) => a.reachedAt - b.reachedAt)
    .slice(0, 2);
}

/**
 * Build the full route plan for an incident.
 *
 * @param {{lat:number,lng:number}} origin  Scene coordinates.
 * @param {string} type                     Emergency type id.
 * @param {object} [options]
 * @returns {{destination, alternatives, relays, directMinutes, rationale}}
 */
export function planRoute(origin, type, { now = Date.now() } = {}) {
  const ranked = FACILITIES
    .map((facility) => scoreDestination(facility, origin, type))
    .sort((a, b) => b.score - a.score);

  const best = ranked[0];
  const destination = best.facility;
  const relays = findRelays(origin, destination, type);
  const directMinutes = travelMinutes(origin, destination);
  const clinicalWindow = getType(type).window;

  return {
    destination,
    coverage: best.coverage,
    met: best.met,
    missing: best.missing,
    directMinutes,
    relays,
    alternatives: ranked.slice(1, 4),
    /* A structured rationale so the "Why this hospital?" action never has to guess. */
    rationale: {
      required: requiredCapabilities(type),
      satisfied: best.met,
      unsatisfied: best.missing,
      travelMinutes: Math.round(directMinutes),
      clinicalWindowMinutes: clinicalWindow,
      exceedsWindow: directMinutes > clinicalWindow,
      nearestRejected: ranked
        .filter((entry) => entry.minutes < directMinutes && entry.coverage < best.coverage)
        .slice(0, 2)
        .map((entry) => ({
          name: entry.facility.name,
          minutes: Math.round(entry.minutes),
          missing: entry.missing,
        })),
      relayJustification: relays.map((relay) => ({
        name: relay.facility.name,
        reachedInMinutes: Math.round(relay.reachedAt),
        detourPercent: Math.round(relay.detourRatio * 100),
        provides: relay.stabilisation,
      })),
      generatedAt: now,
    },
  };
}

/* ── Live operational state ───────────────────────────────────────────────── */

/**
 * Facility readiness for an inbound case. This is what turns "Notified" into
 * "Preparing" into "Team ready" on the hospital board.
 */
export const PREP_STATES = [
  { id: 'idle', label: 'Standby', tone: 'neutral', order: 0 },
  { id: 'notified', label: 'Notified', tone: 'info', order: 1 },
  { id: 'preparing', label: 'Preparing', tone: 'warn', order: 2 },
  { id: 'ready', label: 'Team ready', tone: 'pos', order: 3 },
  { id: 'receiving', label: 'Receiving', tone: 'accent', order: 4 },
];

export const getPrepState = (id) => PREP_STATES.find((state) => state.id === id) || PREP_STATES[0];

/** Ambulance fleet. Capability is what matters for matching, not the vehicle name. */
export const AMBULANCE_TYPES = [
  { id: 'bls', label: 'Basic ambulance', capability: 'bls' },
  { id: 'als', label: 'Advanced life support', capability: 'als' },
  { id: 'trauma', label: 'Trauma unit', capability: 'trauma' },
  { id: 'neonatal', label: 'Neonatal / obstetric', capability: 'obstetric' },
];

/**
 * Does this unit meet the capability an emergency implies?
 * ALS satisfies BLS needs; trauma units satisfy ALS needs. Anything else does not.
 */
export function meetsCapability(unitCapability, required) {
  const ladder = { bls: 0, als: 1, trauma: 2 };
  if (unitCapability === required) return true;
  if (!(unitCapability in ladder) || !(required in ladder)) return false;
  return ladder[unitCapability] >= ladder[required];
}

export const capabilityLabel = (id) => getCapability(id).label;
