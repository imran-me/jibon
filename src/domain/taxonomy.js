/**
 * Emergency vocabulary.
 *
 * Everything the platform knows about *kinds* of emergency lives here: what can
 * be reported, how urgent it is, which responder capability it implies and which
 * hospital department eventually owns it. Views, prompts and the simulation all
 * read from these tables, so the domain can be re-pointed without touching UI.
 */

export const PROFILE = {
  name: 'JIBON',
  script: 'জীবন',
  tagline: 'Emergency Response Intelligence',
  country: 'Bangladesh',
  emergencyNumber: '999',
  statement: "Don't wait for the patient to arrive before preparing for the patient.",
  mission:
    'Coordination intelligence between citizens, emergency services, ambulances, ' +
    'volunteers and hospitals — so every responder in the chain has the full case ' +
    'before the patient physically reaches them.',
};

/**
 * Reportable emergency types, shown as the icon grid on the citizen screen.
 *
 * `capability` is the responder tier this normally implies, `dept` the hospital
 * department that ultimately receives the patient, and `window` the clinically
 * meaningful time budget in minutes — the number the whole product exists to
 * protect.
 */
export const EMERGENCY_TYPES = [
  {
    id: 'cardiac',
    label: 'Cardiac Emergency',
    short: 'Cardiac',
    icon: 'heart',
    capability: 'als',
    dept: 'Cardiology / CCU',
    window: 8,
    basePriority: 'P1',
    weight: 0.13,
    series: 5,
  },
  {
    id: 'unconscious',
    label: 'Unconscious Person',
    short: 'Unconscious',
    icon: 'person-down',
    capability: 'als',
    dept: 'Emergency Medicine',
    window: 10,
    basePriority: 'P1',
    weight: 0.16,
    series: 3,
  },
  {
    id: 'trauma',
    label: 'Road Accident',
    short: 'Trauma',
    icon: 'crash',
    capability: 'trauma',
    dept: 'Trauma / Orthopaedics',
    window: 60,
    basePriority: 'P1',
    weight: 0.19,
    series: 1,
  },
  {
    id: 'bleeding',
    label: 'Severe Bleeding',
    short: 'Haemorrhage',
    icon: 'droplet',
    capability: 'trauma',
    dept: 'Emergency Surgery',
    window: 15,
    basePriority: 'P1',
    weight: 0.09,
    series: 5,
  },
  {
    id: 'breathing',
    label: 'Breathing Problem',
    short: 'Respiratory',
    icon: 'lungs',
    capability: 'als',
    dept: 'Emergency Medicine',
    window: 12,
    basePriority: 'P2',
    weight: 0.11,
    series: 2,
  },
  {
    id: 'stroke',
    label: 'Stroke Symptoms',
    short: 'Stroke',
    icon: 'brain',
    capability: 'als',
    dept: 'Neurology / Stroke Unit',
    window: 270, // thrombolysis window, in minutes
    basePriority: 'P1',
    weight: 0.07,
    series: 3,
  },
  {
    id: 'obstetric',
    label: 'Childbirth / Obstetric',
    short: 'Obstetric',
    icon: 'obstetric',
    capability: 'obstetric',
    dept: 'Obstetrics',
    window: 30,
    basePriority: 'P2',
    weight: 0.08,
    series: 6,
  },
  {
    id: 'burn',
    label: 'Burn Injury',
    short: 'Burns',
    icon: 'flame',
    capability: 'trauma',
    dept: 'Burn Unit',
    window: 45,
    basePriority: 'P2',
    weight: 0.05,
    series: 5,
  },
  {
    id: 'poisoning',
    label: 'Poisoning / Overdose',
    short: 'Poisoning',
    icon: 'poison',
    capability: 'als',
    dept: 'Toxicology / Medicine',
    window: 30,
    basePriority: 'P2',
    weight: 0.05,
    series: 4,
  },
  {
    id: 'fire',
    label: 'Fire',
    short: 'Fire',
    icon: 'flame',
    capability: 'fire',
    dept: 'Burn Unit',
    window: 20,
    basePriority: 'P1',
    weight: 0.04,
    series: 5,
  },
  {
    id: 'police',
    label: 'Police / Violence',
    short: 'Police',
    icon: 'shield',
    capability: 'police',
    dept: 'Emergency Medicine',
    window: 20,
    basePriority: 'P2',
    weight: 0.02,
    series: 7,
  },
  {
    id: 'other',
    label: 'Other Emergency',
    short: 'Other',
    icon: 'alert',
    capability: 'bls',
    dept: 'Emergency Medicine',
    window: 60,
    basePriority: 'P3',
    weight: 0.01,
    series: 8,
  },
];

/**
 * Priority grades. These drive colour semantics across the entire console:
 * red is only ever P1, amber only P2. Colour is never decorative here.
 */
export const PRIORITIES = [
  { id: 'P1', label: 'Critical', tone: 'neg', target: 8, description: 'Immediate threat to life. Dispatch now.' },
  { id: 'P2', label: 'Urgent', tone: 'warn', target: 15, description: 'Serious, time-sensitive. Dispatch on next unit.' },
  { id: 'P3', label: 'Standard', tone: 'info', target: 30, description: 'Needs care, not immediately life-threatening.' },
  { id: 'P4', label: 'Routine', tone: 'neutral', target: 60, description: 'Non-urgent transport or advice.' },
];

/** Lifecycle of a case. `order` drives the timeline and progress rendering. */
export const STAGES = [
  { id: 'reported', label: 'Reported', order: 0, tone: 'info' },
  { id: 'classified', label: 'Classified', order: 1, tone: 'info' },
  { id: 'dispatched', label: 'Dispatched', order: 2, tone: 'warn' },
  { id: 'onscene', label: 'On scene', order: 3, tone: 'warn' },
  { id: 'transporting', label: 'Transporting', order: 4, tone: 'accent' },
  { id: 'arrived', label: 'Handed over', order: 5, tone: 'pos' },
  { id: 'closed', label: 'Closed', order: 6, tone: 'neutral' },
];

/** Responder capability tiers — what a unit can actually do, not what it is called. */
export const CAPABILITIES = [
  { id: 'bls', label: 'Basic Life Support', note: 'Transport, oxygen, basic first aid' },
  { id: 'als', label: 'Advanced Life Support', note: 'Paramedic, defibrillator, airway, cardiac monitoring' },
  { id: 'trauma', label: 'Trauma-capable', note: 'Immobilisation, haemorrhage control, ALS drugs' },
  { id: 'obstetric', label: 'Obstetric', note: 'Delivery kit, neonatal resuscitation' },
  { id: 'fire', label: 'Fire & rescue', note: 'Extrication, fire suppression' },
  { id: 'police', label: 'Police', note: 'Scene security, investigation' },
];

/**
 * Provenance of every fact in an Emergency Brief.
 *
 * This is a safety feature, not a decoration: a responder must be able to see at
 * a glance which lines the AI inferred and which a professional confirmed. The
 * UI renders each of these as a distinct, labelled badge.
 */
export const PROVENANCE = {
  observed: { id: 'observed', label: 'Observed', tone: 'info', note: 'Seen directly by camera or responder' },
  reported: { id: 'reported', label: 'Reported', tone: 'neutral', note: 'Stated by the caller' },
  inferred: { id: 'inferred', label: 'AI inferred', tone: 'warn', note: 'Derived by the model — not confirmed' },
  verified: { id: 'verified', label: 'Verified', tone: 'pos', note: 'Confirmed by a qualified professional' },
  unconfirmed: { id: 'unconfirmed', label: 'Needs confirmation', tone: 'neg', note: 'Required, still missing' },
};

/** How the report reached the platform. */
export const CHANNELS = [
  { id: 'icon', label: 'App — icon', weight: 0.34 },
  { id: 'voice', label: 'App — voice', weight: 0.31 },
  { id: 'call', label: `${PROFILE.emergencyNumber} call`, weight: 0.22 },
  { id: 'field', label: 'Field responder', weight: 0.08 },
  { id: 'partner', label: 'Partner hospital', weight: 0.05 },
];

/** Consciousness scale, kept deliberately close to AVPU so clinicians recognise it. */
export const CONSCIOUSNESS = [
  { id: 'alert', label: 'Alert', tone: 'pos' },
  { id: 'voice', label: 'Responds to voice', tone: 'info' },
  { id: 'pain', label: 'Responds to pain', tone: 'warn' },
  { id: 'unresponsive', label: 'Unresponsive', tone: 'neg' },
  { id: 'unknown', label: 'Unknown', tone: 'neutral' },
];

export const BREATHING = [
  { id: 'normal', label: 'Normal', tone: 'pos' },
  { id: 'laboured', label: 'Laboured', tone: 'warn' },
  { id: 'agonal', label: 'Agonal / gasping', tone: 'neg' },
  { id: 'absent', label: 'Absent', tone: 'neg' },
  { id: 'unknown', label: 'Unknown', tone: 'neutral' },
];

/* ── Lookups ──────────────────────────────────────────────────────────────── */

const index = (list) => new Map(list.map((item) => [item.id, item]));

const typeIndex = index(EMERGENCY_TYPES);
const priorityIndex = index(PRIORITIES);
const stageIndex = index(STAGES);
const capabilityIndex = index(CAPABILITIES);
const channelIndex = index(CHANNELS);
const consciousnessIndex = index(CONSCIOUSNESS);
const breathingIndex = index(BREATHING);

export const getType = (id) => typeIndex.get(id) || typeIndex.get('other');
export const getPriority = (id) => priorityIndex.get(id) || priorityIndex.get('P3');
export const getStage = (id) => stageIndex.get(id) || stageIndex.get('reported');
export const getCapability = (id) => capabilityIndex.get(id) || capabilityIndex.get('bls');
export const getChannel = (id) => channelIndex.get(id) || { id, label: id };
export const getConsciousness = (id) => consciousnessIndex.get(id) || consciousnessIndex.get('unknown');
export const getBreathing = (id) => breathingIndex.get(id) || breathingIndex.get('unknown');

export const typeColor = (id) => `var(--series-${getType(id).series})`;

/** Semantic colour for a priority — the one place red/amber/blue is decided. */
export const priorityColor = (id) => {
  const tone = getPriority(id).tone;
  return tone === 'neutral' ? 'var(--text-dim)' : `var(--${tone})`;
};

export const isActive = (incident) => incident.stage !== 'closed' && incident.stage !== 'arrived';
export const isCritical = (incident) => incident.priority === 'P1';

/** Minutes elapsed since the call was raised. */
export const elapsedMinutes = (incident, now = Date.now()) => (now - incident.createdAt) / 60_000;

/**
 * How much of the clinical window this case has consumed, 0–1+.
 * Above 1 means the window has closed — the single most important number on
 * the board, and the reason the command centre sorts the way it does.
 */
export function windowConsumed(incident, now = Date.now()) {
  const budget = getType(incident.type).window;
  const end = incident.stage === 'arrived' || incident.stage === 'closed'
    ? incident.handoverAt ?? now
    : now;
  return (end - incident.createdAt) / 60_000 / budget;
}

/** Facet definitions, so filter chips can be generated rather than hand-written. */
export const FACETS = [
  { key: 'types', field: 'type', label: 'Emergency type', options: EMERGENCY_TYPES },
  { key: 'priorities', field: 'priority', label: 'Priority', options: PRIORITIES },
  { key: 'stages', field: 'stage', label: 'Stage', options: STAGES },
  { key: 'channels', field: 'channel', label: 'Channel', options: CHANNELS },
];
