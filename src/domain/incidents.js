/**
 * The incident record — the single object every interface in the platform reads.
 *
 * An incident carries its own audit trail: a timeline of state transitions, a
 * fact list where each entry records *how it is known* (reported, observed,
 * inferred, verified), and the hospital preparation state for each facility that
 * has been brought into the case. Nothing about a case is stored as bare truth;
 * everything is stored with its provenance, because a responder acting on an
 * AI inference needs to know that is what it is.
 *
 * Demo data is generated deterministically from a fixed seed so the console
 * looks identical on every laptop and every reload.
 */

import {
  EMERGENCY_TYPES, CHANNELS, PROVENANCE, getType, getPriority,
} from './taxonomy.js';
import { FACILITIES, planRoute, getFacility, travelMinutes } from './network.js';
import { requiredInformationFor, equipmentFor, hospitalPrepFor } from './protocols.js';

const SEED = 0x11b0_2c4a;
const DAYS_OF_HISTORY = 30;

/**
 * Coordination mode.
 *
 * Historic cases are marked `baseline` — the conventional chain, where the
 * hospital learns about the patient on arrival. Recent cases run through
 * `jibon`. Keeping both in one dataset is what lets the console show a real
 * before/after rather than an asserted one.
 */
export const MODES = {
  baseline: { id: 'baseline', label: 'Conventional dispatch', tone: 'neutral' },
  jibon: { id: 'jibon', label: 'JIBON coordinated', tone: 'accent' },
};

/* ── Deterministic randomness ─────────────────────────────────────────────── */

function makeRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function weightedPick(random, items, weightOf = (item) => item.weight ?? 1) {
  const total = items.reduce((sum, item) => sum + weightOf(item), 0);
  let roll = random() * total;
  for (const item of items) {
    roll -= weightOf(item);
    if (roll <= 0) return item;
  }
  return items[items.length - 1];
}

function gaussian(random, mean, sd, min = 0, max = Infinity) {
  const sum = random() + random() + random() + random() + random() + random();
  return Math.min(max, Math.max(min, mean + ((sum - 3) / 3) * sd * 1.7));
}

const pick = (random, list) => list[Math.floor(random() * list.length)];

/* ── Scene locations ──────────────────────────────────────────────────────── */

/**
 * Places emergencies are reported from. Spread across the Barishal division and
 * Dhaka so the routing engine has genuinely different problems to solve — a
 * Kuakata case and a Dhaka case should not produce the same plan.
 */
export const SCENES = [
  { id: 'kuakata', label: 'Kuakata beach road', district: 'Patuakhali', lat: 21.8206, lng: 90.1195, weight: 0.08 },
  { id: 'kalapara', label: 'Kalapara bazar', district: 'Patuakhali', lat: 21.9833, lng: 90.2333, weight: 0.06 },
  { id: 'patuakhali-town', label: 'Patuakhali town', district: 'Patuakhali', lat: 22.3596, lng: 90.3298, weight: 0.08 },
  { id: 'amtali', label: 'Amtali ferry ghat', district: 'Barguna', lat: 22.1333, lng: 90.2333, weight: 0.05 },
  { id: 'barguna-town', label: 'Barguna town', district: 'Barguna', lat: 22.1550, lng: 90.1265, weight: 0.06 },
  { id: 'barishal-city', label: 'Barishal city', district: 'Barishal', lat: 22.7010, lng: 90.3535, weight: 0.11 },
  { id: 'bhola', label: 'Bhola sadar', district: 'Bhola', lat: 22.6859, lng: 90.6482, weight: 0.06 },
  { id: 'gopalganj', label: 'Gopalganj highway', district: 'Gopalganj', lat: 23.0050, lng: 89.8266, weight: 0.07 },
  { id: 'faridpur', label: 'Faridpur bypass', district: 'Faridpur', lat: 23.6070, lng: 89.8429, weight: 0.07 },
  { id: 'mawa', label: 'Padma Bridge approach', district: 'Munshiganj', lat: 23.4200, lng: 90.2650, weight: 0.08 },
  { id: 'dhaka-mirpur', label: 'Mirpur 10, Dhaka', district: 'Dhaka', lat: 23.8069, lng: 90.3687, weight: 0.10 },
  { id: 'dhaka-gulshan', label: 'Gulshan Avenue, Dhaka', district: 'Dhaka', lat: 23.7925, lng: 90.4078, weight: 0.08 },
  { id: 'dhaka-jatrabari', label: 'Jatrabari crossing, Dhaka', district: 'Dhaka', lat: 23.7104, lng: 90.4344, weight: 0.10 },
];

/* ── Narratives ───────────────────────────────────────────────────────────── */

/**
 * How people actually report. Bangla, English and code-switched Banglish, none
 * of it using medical vocabulary — which is the point: the model has to do the
 * interpretation a caller cannot.
 */
const NARRATIVES = {
  cardiac: [
    { lang: 'bn', text: 'একজন হঠাৎ বুকে ব্যথা বলে পড়ে গেছেন, এখন সাড়া দিচ্ছেন না।' },
    { lang: 'mixed', text: 'Ekjon lok buke hat diye pore gechen, dak dile utthen na. Ekhane keu nai.' },
    { lang: 'en', text: 'Man about fifty collapsed holding his chest. He is grey and not answering me.' },
  ],
  unconscious: [
    { lang: 'mixed', text: 'Uni pore gechen, nishash nite parchen na, mukh nila hoye jacche. Kono doctor nai ekhane.' },
    { lang: 'bn', text: 'একজন লোক অজ্ঞান হয়ে পড়ে আছে, ডাকলে সাড়া দিচ্ছে না। কী করব বুঝতে পারছি না।' },
    { lang: 'en', text: 'A man suddenly collapsed. He is unconscious. I do not know if he is breathing properly. There is no doctor here.' },
  ],
  trauma: [
    { lang: 'mixed', text: 'Bus ar CNG dhakka legeche. Onek manush injured, ekjon rasta te pore ache, uthte parche na.' },
    { lang: 'bn', text: 'মোটরসাইকেল দুর্ঘটনা হয়েছে, একজনের পা ভেঙে গেছে, অনেক রক্ত পড়ছে।' },
    { lang: 'en', text: 'Truck hit a rickshaw near the highway. Two people down, one is not moving at all.' },
  ],
  bleeding: [
    { lang: 'bn', text: 'হাত কেটে গেছে, রক্ত বন্ধ হচ্ছে না, কাপড় দিয়ে চেপে ধরেছি।' },
    { lang: 'mixed', text: 'Onek rokto porche, gamcha diye chepe dhorechi kintu bondho hocche na.' },
    { lang: 'en', text: 'Deep cut on his leg from machinery. Blood is soaking through everything we press on it.' },
  ],
  breathing: [
    { lang: 'mixed', text: 'Amar ma nishash nite parchen na, kotha bolte parchen na, thot nila hoye jacche.' },
    { lang: 'bn', text: 'শ্বাসকষ্ট হচ্ছে খুব, ইনহেলার কাজ করছে না।' },
    { lang: 'en', text: 'She cannot finish a sentence, breathing very fast, lips going blue.' },
  ],
  stroke: [
    { lang: 'en', text: 'His face is drooping on one side and he cannot lift his right arm. Speech is slurred.' },
    { lang: 'bn', text: 'মুখ একদিকে বেঁকে গেছে, ডান হাত নাড়াতে পারছেন না, কথা জড়িয়ে যাচ্ছে।' },
    { lang: 'mixed', text: 'Mukh ekdike beke gache, kotha bujha jacche na. Ghonta khanek age thik chilen.' },
  ],
  obstetric: [
    { lang: 'bn', text: 'প্রসব বেদনা শুরু হয়েছে, রক্তপাত হচ্ছে, হাসপাতাল অনেক দূরে।' },
    { lang: 'mixed', text: 'Amar bhabi labour pain e achen, onek rokto jacche. Gari nai ekhane.' },
  ],
  burn: [
    { lang: 'mixed', text: 'Gas cylinder theke ag legeche, ekjoner hat ar mukh pure gache.' },
    { lang: 'bn', text: 'গরম পানি পড়ে বাচ্চার শরীর পুড়ে গেছে।' },
  ],
  poisoning: [
    { lang: 'bn', text: 'কীটনাশক খেয়ে ফেলেছে, বমি করছে, বোতল হাতে আছে।' },
    { lang: 'mixed', text: 'Onek ghum er oshudh kheye feleche, ekhon dak dile sara dicche na.' },
  ],
  fire: [
    { lang: 'mixed', text: 'Building e ag legeche, upore manush atke ache, dhoa onek.' },
    { lang: 'bn', text: 'বাজারে আগুন লেগেছে, দ্রুত ছড়াচ্ছে।' },
  ],
  police: [
    { lang: 'mixed', text: 'Marামari hocche, ekjon rokte bhije gache. Police lagbe.' },
    { lang: 'en', text: 'There has been a fight, one man is injured on the ground and the group is still here.' },
  ],
  other: [
    { lang: 'en', text: 'Someone is unwell here and we do not know what to do.' },
    { lang: 'bn', text: 'একজন অসুস্থ হয়ে পড়েছে, কী করব বুঝতে পারছি না।' },
  ],
};

const CLINICIANS = [
  'Dr. A. Rahman', 'Dr. S. Chowdhury', 'Dr. N. Akter', 'Dr. T. Hossain',
  'Dr. F. Begum', 'Dr. K. Ahmed', 'Dr. M. Islam', 'Dr. R. Karim',
];

const VOLUNTEERS = [
  'S. Mahmud (nursing student)', 'J. Uddin (trained first aider)', 'P. Das (community responder)',
  'H. Sultana (off-duty nurse)', 'A. Siddique (Red Crescent)', 'M. Rahim (paramedic, off duty)',
];

const UNIT_PREFIX = { bls: 'BLS', als: 'ALS', trauma: 'TRA', obstetric: 'OBS' };

/* ── Fact helpers ─────────────────────────────────────────────────────────── */

/**
 * Create a provenance-tagged fact. Every line the interfaces display about a
 * patient goes through here, so nothing can be rendered without a source.
 */
export function fact(key, label, value, source = 'reported', detail = '') {
  return {
    key,
    label,
    value,
    source: PROVENANCE[source] ? source : 'reported',
    detail,
    at: Date.now(),
  };
}

export const factSource = (source) => PROVENANCE[source] || PROVENANCE.reported;

/* ── Timeline ─────────────────────────────────────────────────────────────── */

/** Append a timeline entry. Entries are immutable once written — this is an audit log. */
export function addTimelineEntry(incident, { code, label, detail = '', actor = 'system', at }) {
  const entry = {
    id: `${incident.id}-T${incident.timeline.length + 1}`,
    at: at ?? Date.now(),
    code,
    label,
    detail,
    actor,
  };
  incident.timeline = [...incident.timeline, entry];
  incident.updatedAt = entry.at;
  return entry;
}

/* ── Construction ─────────────────────────────────────────────────────────── */

let sequence = 4100;

export function nextIncidentId() {
  sequence += 1;
  return `EMG-${sequence}`;
}

/**
 * Build a fresh incident from a citizen report.
 *
 * @param {object} input
 * @param {string} input.type      Emergency type id.
 * @param {object} input.scene     { label, district, lat, lng }
 * @param {string} input.narrative Raw caller text.
 * @returns {object} incident
 */
export function createIncident({
  type = 'other',
  scene,
  narrative = '',
  channel = 'icon',
  language = 'en',
  patients = 1,
  priority,
  confidence = null,
  answers = {},
  createdAt = Date.now(),
  mode = 'jibon',
} = {}) {
  const definition = getType(type);
  const location = scene || SCENES[0];

  const incident = {
    id: nextIncidentId(),
    createdAt,
    updatedAt: createdAt,
    mode,

    type,
    priority: priority || definition.basePriority,
    stage: 'reported',
    channel,
    language,
    patients,

    origin: {
      label: location.label,
      district: location.district,
      lat: location.lat,
      lng: location.lng,
    },

    narrative,
    answers,
    facts: [],
    confidence,
    verifiedBy: null,
    verifiedAt: null,

    assignments: { unit: null, clinician: null, volunteers: [] },
    route: null,
    prep: {},

    equipment: equipmentFor(type).map((item) => ({ ...item, confirmed: false })),
    timeline: [],

    dispatchedAt: null,
    onSceneAt: null,
    departedAt: null,
    handoverAt: null,
    outcome: null,
  };

  addTimelineEntry(incident, {
    code: 'reported',
    label: 'Emergency reported',
    detail: `${CHANNELS.find((c) => c.id === channel)?.label || channel} · ${location.label}`,
    actor: 'citizen',
    at: createdAt,
  });

  return incident;
}

/** Attach the AI classification result to an incident. */
export function applyClassification(incident, classification, { at = Date.now(), source = 'gemini' } = {}) {
  const definition = getType(classification.type || incident.type);

  incident.type = classification.type || incident.type;
  incident.priority = classification.priority || definition.basePriority;
  incident.confidence = classification.confidence ?? incident.confidence;
  incident.stage = 'classified';
  incident.equipment = equipmentFor(incident.type).map((item) => ({ ...item, confirmed: false }));

  const facts = [];

  if (classification.summary) facts.push(fact('summary', 'Situation', classification.summary, 'inferred'));
  if (classification.consciousness) {
    facts.push(fact('consciousness', 'Consciousness', classification.consciousness, classification.consciousness_source || 'reported'));
  }
  if (classification.breathing) {
    facts.push(fact('breathing', 'Breathing', classification.breathing, classification.breathing_source || 'reported'));
  }
  if (classification.mechanism) facts.push(fact('mechanism', 'Mechanism', classification.mechanism, 'reported'));
  if (classification.hazards?.length) {
    facts.push(fact('hazards', 'Scene hazards', classification.hazards.join(', '), 'reported'));
  }
  if (classification.observations?.length) {
    for (const [i, observation] of classification.observations.entries()) {
      facts.push(fact(`obs-${i}`, 'Observation', observation, 'inferred'));
    }
  }
  if (classification.image_findings) {
    facts.push(fact('image', 'Visual assessment', classification.image_findings, 'observed'));
  }

  incident.facts = [...incident.facts, ...facts];

  addTimelineEntry(incident, {
    code: 'classified',
    label: `AI classified as ${getPriority(incident.priority).label.toLowerCase()} — ${definition.label}`,
    detail: classification.reasoning || '',
    actor: source,
    at,
  });

  return incident;
}

/** Compute and attach the route plan, including relay points. */
export function applyRoutePlan(incident, { at = Date.now() } = {}) {
  const plan = planRoute(incident.origin, incident.type, { now: at });

  incident.route = {
    destinationId: plan.destination.id,
    relayIds: plan.relays.map((relay) => relay.facility.id),
    directMinutes: Math.round(plan.directMinutes),
    coverage: plan.coverage,
    rationale: plan.rationale,
    alternatives: plan.alternatives.map((entry) => ({
      id: entry.facility.id,
      name: entry.facility.name,
      minutes: Math.round(entry.minutes),
      coverage: entry.coverage,
      missing: entry.missing,
    })),
  };

  // Every facility in the chain starts as notified — that is the whole point.
  incident.prep[plan.destination.id] = 'notified';
  for (const relay of plan.relays) incident.prep[relay.facility.id] = 'notified';

  return incident;
}

/** Move a facility along notified → preparing → ready → receiving. */
export function setPrepState(incident, facilityId, state, { at = Date.now() } = {}) {
  incident.prep = { ...incident.prep, [facilityId]: state };
  const facility = getFacility(facilityId);

  addTimelineEntry(incident, {
    code: `prep-${state}`,
    label: `${facility?.name || facilityId} — ${state}`,
    detail: state === 'ready' ? 'Team and resources confirmed standing by' : '',
    actor: 'hospital',
    at,
  });

  return incident;
}

/** Record professional verification of the AI's assessment. */
export function verifyIncident(incident, clinician, { at = Date.now() } = {}) {
  incident.verifiedBy = clinician;
  incident.verifiedAt = at;
  incident.facts = incident.facts.map((entry) =>
    entry.source === 'inferred' ? { ...entry, source: 'verified', detail: `Confirmed by ${clinician}` } : entry);

  addTimelineEntry(incident, {
    code: 'verified',
    label: `Case verified by ${clinician}`,
    detail: 'AI inferences confirmed by a qualified clinician',
    actor: 'clinician',
    at,
  });

  return incident;
}

/* ── Derived measures ─────────────────────────────────────────────────────── */

const minutesBetween = (from, to) => (from && to ? (to - from) / 60_000 : null);

/** Report → dispatch decision. The interval AI coordination compresses hardest. */
export const decisionMinutes = (incident) => minutesBetween(incident.createdAt, incident.dispatchedAt);

/** Dispatch → on scene. Governed by geography and traffic, not by software. */
export const responseMinutes = (incident) => minutesBetween(incident.dispatchedAt, incident.onSceneAt);

/** Report → handover at the receiving hospital. The end-to-end number. */
export const totalMinutes = (incident) => minutesBetween(incident.createdAt, incident.handoverAt);

/**
 * How long the receiving hospital had the case before the patient arrived.
 *
 * In the conventional chain this is zero by definition — the hospital finds out
 * when the doors open. It is the clearest single measure of what the platform
 * changes, which is why it gets its own KPI.
 */
export function preArrivalLeadMinutes(incident) {
  if (incident.mode === 'baseline') return 0;
  const notified = incident.timeline.find((entry) => entry.code.startsWith('prep-'));
  if (!notified || !incident.handoverAt) return null;
  return Math.max(0, (incident.handoverAt - notified.at) / 60_000);
}

export const isActiveIncident = (incident) =>
  incident.stage !== 'closed' && incident.stage !== 'arrived';

/* ── Dataset generation ───────────────────────────────────────────────────── */

/**
 * Generate the demo history.
 *
 * The last seven days run in JIBON mode and everything older is conventional
 * dispatch, so the dashboard's period-over-period deltas describe a real
 * transition inside the data rather than invented movement.
 */
export function generateIncidents(now = Date.now()) {
  const random = makeRandom(SEED);
  const incidents = [];
  const cutover = now - 7 * 86_400_000;

  for (let daysAgo = DAYS_OF_HISTORY; daysAgo >= 0; daysAgo -= 1) {
    const dayStart = new Date(now - daysAgo * 86_400_000);
    dayStart.setHours(0, 0, 0, 0);

    // Emergencies cluster around the commute and the late evening.
    const count = Math.max(2, Math.round(gaussian(random, 11, 3)));

    for (let i = 0; i < count; i += 1) {
      const hour = random() < 0.55
        ? Math.round(gaussian(random, 9, 2.6, 5, 14))
        : Math.round(gaussian(random, 20, 2.8, 15, 23));

      const createdAt = dayStart.getTime() + hour * 3_600_000 + Math.floor(random() * 3_600_000);
      if (createdAt > now) continue;

      incidents.push(makeIncident(random, createdAt, createdAt >= cutover ? 'jibon' : 'baseline', now));
    }
  }

  return incidents.sort((a, b) => b.createdAt - a.createdAt);
}

function makeIncident(random, createdAt, mode, now) {
  const definition = weightedPick(random, EMERGENCY_TYPES);
  const scene = weightedPick(random, SCENES);
  const channelPool = mode === 'baseline'
    ? CHANNELS.filter((channel) => channel.id === 'call' || channel.id === 'field')
    : CHANNELS;
  const channel = weightedPick(random, channelPool);
  const narrative = pick(random, NARRATIVES[definition.id] || NARRATIVES.other);

  // Priority mostly follows the type, with a minority escalating or de-escalating.
  const roll = random();
  const priority = roll < 0.68
    ? definition.basePriority
    : roll < 0.86
      ? escalate(definition.basePriority, 1)
      : escalate(definition.basePriority, -1);

  const incident = createIncident({
    type: definition.id,
    scene,
    narrative: narrative.text,
    language: narrative.lang,
    channel: channel.id,
    priority,
    patients: definition.id === 'trauma' && random() < 0.35 ? 2 + Math.floor(random() * 3) : 1,
    confidence: Number(gaussian(random, mode === 'jibon' ? 0.89 : 0.72, 0.08, 0.45, 0.99).toFixed(3)),
    createdAt,
    mode,
  });

  runLifecycle(incident, random, mode, now);
  return incident;
}

function escalate(priority, direction) {
  const order = ['P1', 'P2', 'P3', 'P4'];
  const index = order.indexOf(priority);
  return order[Math.min(order.length - 1, Math.max(0, index - direction))];
}

/**
 * Play a case forward through its stages.
 *
 * The two modes differ in exactly the places the product claims to act: how long
 * classification and dispatch take, whether the ambulance is correctly equipped,
 * and whether the hospital is told anything before arrival. Everything else —
 * road distance, traffic — is identical, because the platform does not pretend
 * to change physics.
 */
function runLifecycle(incident, random, mode, now) {
  const jibon = mode === 'jibon';
  let clock = incident.createdAt;

  // 1. Understanding the call.
  const classifySeconds = jibon
    ? gaussian(random, 9, 3, 4, 25)
    : gaussian(random, 105, 40, 45, 260);
  clock += classifySeconds * 1000;

  if (clock > now) return;

  applyClassification(incident, {
    type: incident.type,
    priority: incident.priority,
    confidence: incident.confidence,
    summary: summarise(incident),
    reasoning: jibon
      ? 'Classified from caller speech and scene evidence.'
      : 'Classified by operator during voice call.',
  }, { at: clock, source: jibon ? 'gemini' : 'operator' });

  // 2. Route planning happens immediately in JIBON mode; conventionally the
  //    destination is chosen by the crew, later, and usually by proximity.
  if (jibon) {
    applyRoutePlan(incident, { at: clock });
    addTimelineEntry(incident, {
      code: 'routed',
      label: `Destination set — ${getFacility(incident.route.destinationId)?.name}`,
      detail: incident.route.relayIds.length
        ? `Relay prepared at ${incident.route.relayIds.map((id) => getFacility(id)?.city).join(', ')}`
        : 'Direct transfer',
      actor: 'gemini',
      at: clock,
    });
  }

  // 3. Dispatch.
  const dispatchSeconds = jibon ? gaussian(random, 22, 8, 8, 60) : gaussian(random, 150, 70, 40, 420);
  clock += dispatchSeconds * 1000;
  if (clock > now) return;

  const capability = getType(incident.type).capability;
  // Conventional dispatch frequently sends whatever is free, not what is needed.
  const correctlyEquipped = jibon ? random() > 0.06 : random() > 0.62;
  const unitCapability = correctlyEquipped ? capability : 'bls';

  incident.dispatchedAt = clock;
  incident.stage = 'dispatched';
  incident.assignments.unit = `${UNIT_PREFIX[unitCapability] || 'BLS'}-${100 + Math.floor(random() * 60)}`;
  incident.assignments.equipped = correctlyEquipped;

  addTimelineEntry(incident, {
    code: 'dispatched',
    label: `Ambulance ${incident.assignments.unit} dispatched`,
    detail: correctlyEquipped
      ? `Loaded for ${getType(incident.type).label.toLowerCase()}`
      : 'Nearest available unit — equipment not matched to case',
    actor: 'dispatch',
    at: clock,
  });

  // 4. Parallel actions that only exist in the coordinated model.
  if (jibon) {
    incident.assignments.clinician = pick(random, CLINICIANS);
    addTimelineEntry(incident, {
      code: 'clinician',
      label: `${incident.assignments.clinician} joined the session`,
      detail: 'Reviewed AI brief, guiding the bystander',
      actor: 'clinician',
      at: clock + gaussian(random, 25, 10, 5, 70) * 1000,
    });

    if (random() < 0.62) {
      const volunteer = pick(random, VOLUNTEERS);
      incident.assignments.volunteers = [volunteer];
      addTimelineEntry(incident, {
        code: 'volunteer',
        label: `Volunteer ${volunteer} notified`,
        detail: 'Within walking distance of the scene',
        actor: 'system',
        at: clock + gaussian(random, 40, 15, 10, 120) * 1000,
      });
    }
  }

  // 5. Travel to scene — identical physics in both modes.
  const destination = incident.route ? getFacility(incident.route.destinationId) : null;
  const toScene = gaussian(random, incident.origin.district === 'Dhaka' ? 14 : 22, 7, 5, 55);
  clock += toScene * 60_000;
  if (clock > now) return;

  incident.onSceneAt = clock;
  incident.stage = 'onscene';
  addTimelineEntry(incident, {
    code: 'onscene',
    label: 'Crew reached the patient',
    detail: `${Math.round(toScene)} minutes from dispatch`,
    actor: 'ambulance',
    at: clock,
  });

  // On-scene time is shorter when the crew arrived with the right equipment and
  // a brief they have already read.
  const sceneMinutes = jibon
    ? gaussian(random, correctlyEquipped ? 7 : 14, 3, 3, 30)
    : gaussian(random, 16, 6, 6, 45);
  clock += sceneMinutes * 60_000;
  if (clock > now) return;

  incident.departedAt = clock;
  incident.stage = 'transporting';

  if (!incident.route) applyRoutePlan(incident, { at: clock });
  const finalDestination = destination || getFacility(incident.route.destinationId);

  addTimelineEntry(incident, {
    code: 'departed',
    label: `Departed for ${finalDestination?.name}`,
    detail: `${Math.round(sceneMinutes)} minutes on scene`,
    actor: 'ambulance',
    at: clock,
  });

  // 6. Hospital preparation runs during transit — or does not happen at all.
  const transitMinutes = travelMinutes(incident.origin, finalDestination);

  if (jibon) {
    for (const relayId of incident.route.relayIds) {
      setPrepState(incident, relayId, 'ready', { at: clock + gaussian(random, 6, 2, 2, 15) * 60_000 });
    }
    setPrepState(incident, finalDestination.id, 'preparing', { at: clock + 60_000 });
    setPrepState(incident, finalDestination.id, 'ready', {
      at: clock + Math.min(transitMinutes * 0.6, 25) * 60_000,
    });
  }

  clock += transitMinutes * 60_000;
  if (clock > now) return;

  incident.handoverAt = clock;
  incident.stage = 'arrived';

  addTimelineEntry(incident, {
    code: 'arrived',
    label: `Handed over at ${finalDestination?.name}`,
    detail: jibon
      ? 'Team was standing by — treatment started at the door'
      : 'Assessment began on arrival',
    actor: 'hospital',
    at: clock,
  });

  // 7. Outcome. Deliberately modelled as a probability shaped by how much of the
  //    clinical window survived, not asserted as a flat improvement.
  const window = getType(incident.type).window;
  const consumed = (clock - incident.createdAt) / 60_000 / window;
  const survival = Math.max(0.35, Math.min(0.985, 1.02 - consumed * 0.28));

  incident.outcome = {
    windowConsumed: Number(consumed.toFixed(2)),
    survivalIndex: Number(survival.toFixed(3)),
    equipmentMatched: Boolean(incident.assignments.equipped),
    preArrivalMinutes: Math.round(preArrivalLeadMinutes(incident) || 0),
  };

  // A slice of cases stay open so the live board always has something on it.
  if (now - clock > 4 * 3_600_000 && random() < 0.9) {
    incident.stage = 'closed';
    addTimelineEntry(incident, { code: 'closed', label: 'Case closed', actor: 'system', at: clock + 3_600_000 });
  }
}

/** Short English summary of a case, used where the raw narrative is too long. */
function summarise(incident) {
  const definition = getType(incident.type);
  return `${definition.label} at ${incident.origin.label}, ${incident.patients} patient${incident.patients > 1 ? 's' : ''}.`;
}

export { FACILITIES, requiredInformationFor, hospitalPrepFor };
