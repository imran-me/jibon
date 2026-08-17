/**
 * Deterministic demo dataset.
 *
 * The console has to be convincing the moment it loads, on a venue wifi that
 * may or may not work, so the baseline data is generated locally rather than
 * fetched. It is seeded from a fixed constant: every reload, every laptop and
 * every judge sees exactly the same numbers, which makes the demo repeatable.
 *
 * Timestamps are generated relative to "now" so the dashboard is always current.
 */

import { CATEGORIES, WARDS, CHANNELS, SEVERITIES, getCategory } from './taxonomy.js';

const SEED = 0x5eed_1234;
const DAYS_OF_HISTORY = 90;

/**
 * mulberry32 — small, fast, and good enough for plausible-looking data.
 * The important property is reproducibility, not cryptographic quality.
 */
function makeRandom(seed) {
  let state = seed >>> 0;
  return function random() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/** Pick from a list of `{ weight }` items. */
function weightedPick(random, items, weightOf = (item) => item.weight ?? 1) {
  const total = items.reduce((sum, item) => sum + weightOf(item), 0);
  let roll = random() * total;
  for (const item of items) {
    roll -= weightOf(item);
    if (roll <= 0) return item;
  }
  return items[items.length - 1];
}

/** Normal-ish variate via the central limit trick; clamped to a sane range. */
function gaussian(random, mean, sd, min = 0, max = Infinity) {
  const sum = random() + random() + random() + random() + random() + random();
  const value = mean + ((sum - 3) / 3) * sd * 1.7;
  return Math.min(max, Math.max(min, value));
}

const pick = (random, list) => list[Math.floor(random() * list.length)];

/* ── Locality flavour ─────────────────────────────────────────────────────── */

const LANDMARKS = {
  gulshan: ['Gulshan Avenue', 'Road 11', 'Gulshan 2 circle', 'Police Plaza lane', 'Road 41'],
  banani: ['Kemal Ataturk Ave', 'Road 27', 'Banani Chairman Bari', 'Road 17', 'Banani bazar'],
  mirpur: ['Mirpur 10 roundabout', 'Kazipara', 'Shewrapara', 'Mirpur 12 bus stand', 'Purobi'],
  uttara: ['Sector 7 park', 'Rajlakshmi', 'Sector 11 road 3', 'Azampur', 'House Building'],
  mohammadpur: ['Shia Masjid road', 'Katasur', 'Tajmahal Road', 'Nurjahan Road', 'Bosila'],
  tejgaon: ['Tejgaon industrial area', 'Nakhalpara', 'Farmgate', 'Karwan Bazar', 'Tejturi Bazar'],
  dhanmondi: ['Satmasjid Road', 'Road 27 old', 'Green Road', 'Jigatola', 'Dhanmondi 32'],
  motijheel: ['Dilkusha', 'Shapla Chattar', 'Arambagh', 'Fakirapool', 'Notre Dame crossing'],
  'old-dhaka': ['Nawabpur Road', 'Bangshal', 'Islampur', 'Chawkbazar', 'Sadarghat approach'],
  jatrabari: ['Shanir Akhra', 'Kajla', 'Dholaipar', 'Jatrabari crossing', 'Matuail'],
};

/**
 * Report bodies per category, written the way people actually file them:
 * short, specific, sometimes in Bangla, sometimes code-switching. `{place}` is
 * replaced with a landmark from the report's ward.
 */
const TEMPLATES = {
  waterlogging: [
    { lang: 'en', text: 'Knee-deep water on {place} since last night. Rickshaws refusing to enter the lane.' },
    { lang: 'bn', text: '{place} এলাকায় হাঁটু পানি জমে আছে। ড্রেন পরিষ্কার করা দরকার।' },
    { lang: 'mixed', text: '{place} e drain block, pani namche na. Shops closed for two days now.' },
    { lang: 'en', text: 'Storm drain at {place} is blocked with polythene, water backing into ground floor flats.' },
    { lang: 'bn', text: 'বৃষ্টির পর {place} রাস্তায় পানি জমে যায়, স্কুলের বাচ্চাদের যেতে সমস্যা হচ্ছে।' },
  ],
  waste: [
    { lang: 'en', text: 'Garbage container at {place} has not been emptied for four days. Smell is unbearable.' },
    { lang: 'bn', text: '{place} এর ডাস্টবিন উপচে পড়ছে, মশা বাড়ছে।' },
    { lang: 'mixed', text: 'Ashe pashe kono cleaner ashe na. {place} corner e waste pile hoye ache.' },
    { lang: 'en', text: 'Open dumping beside {place} market. Stray dogs spreading it across the footpath.' },
    { lang: 'en', text: 'Medical waste seen mixed with household garbage near {place}. Needs urgent inspection.' },
  ],
  road: [
    { lang: 'en', text: 'Large pothole on {place}, roughly two feet wide. A CNG overturned here yesterday.' },
    { lang: 'bn', text: '{place} রাস্তায় বড় গর্ত, রাতে দেখা যায় না। দুর্ঘটনা ঘটছে।' },
    { lang: 'mixed', text: '{place} road ekdom bhanga. Every rickshaw ride feels dangerous now.' },
    { lang: 'en', text: 'Utility cut on {place} left unpatched for three weeks. Loose gravel everywhere.' },
    { lang: 'en', text: 'Manhole cover missing near {place}. Someone has put a bamboo stick as warning.' },
  ],
  water: [
    { lang: 'en', text: 'No WASA supply at {place} for two days. Buying water from tankers at triple rate.' },
    { lang: 'bn', text: '{place} এলাকায় পানির লাইনে দুর্গন্ধ, খাওয়ার অযোগ্য।' },
    { lang: 'mixed', text: 'Pani ashe na sokal e. {place} building e reserve tank empty.' },
    { lang: 'en', text: 'Main pipeline leaking at {place}, drinking water running into the drain all day.' },
    { lang: 'en', text: 'Water pressure dropped sharply across {place} since the new construction started.' },
  ],
  power: [
    { lang: 'en', text: 'Power out at {place} for five hours. No announcement from the substation.' },
    { lang: 'bn', text: '{place} এ ঘন ঘন লোডশেডিং, ফ্রিজের খাবার নষ্ট হয়ে যাচ্ছে।' },
    { lang: 'mixed', text: '{place} area te transformer theke spark hocche, khub risky.' },
    { lang: 'en', text: 'Sagging live cable over the footpath at {place}. Children play directly below it.' },
    { lang: 'en', text: 'Voltage fluctuation at {place} burned two ceiling fans in our building this week.' },
  ],
  streetlight: [
    { lang: 'en', text: 'All street lights on {place} are dead. The stretch is pitch dark after 8pm.' },
    { lang: 'bn', text: '{place} এর সড়কবাতি নষ্ট, রাতে মেয়েরা একা চলাচল করতে ভয় পায়।' },
    { lang: 'mixed', text: '{place} e light gulo jole na. Snatching hoyeche last week.' },
    { lang: 'en', text: 'Six poles near {place} flicker all night, seems like a wiring fault not bulbs.' },
  ],
  traffic: [
    { lang: 'en', text: 'Illegal parking has taken the entire left lane of {place} during office hours.' },
    { lang: 'bn', text: '{place} মোড়ে সিগন্যাল কাজ করছে না, প্রচণ্ড যানজট।' },
    { lang: 'mixed', text: '{place} e bus gulo dariye thake middle of road, 40 min jam every morning.' },
    { lang: 'en', text: 'Footpath at {place} fully occupied by vendors, pedestrians pushed onto the road.' },
  ],
  air: [
    { lang: 'en', text: 'Construction dust at {place} is constant. Cannot open windows, children coughing.' },
    { lang: 'bn', text: '{place} এলাকায় রাতভর নির্মাণকাজের শব্দ, ঘুমানো যাচ্ছে না।' },
    { lang: 'mixed', text: '{place} er pashe brick breaking cholche without any cover. Dust everywhere.' },
    { lang: 'en', text: 'Black smoke from a generator exhaust at {place} vents directly into a classroom window.' },
  ],
  safety: [
    { lang: 'en', text: 'Open manhole beside the school gate at {place}. Someone will fall in after dark.' },
    { lang: 'bn', text: '{place} এ পরিত্যক্ত ভবনের দেয়াল ধসে পড়ার ঝুঁকিতে আছে।' },
    { lang: 'mixed', text: '{place} corner e ekta boro gach half broken, next storm e porbe.' },
    { lang: 'en', text: 'Exposed transformer with no fencing at {place}, right next to a tea stall.' },
  ],
};

const OFFICERS = [
  'A. Rahman', 'S. Chowdhury', 'M. Islam', 'N. Akter', 'T. Hossain',
  'R. Karim', 'F. Begum', 'K. Ahmed', 'J. Uddin', 'P. Das',
];

/* ── Generation ───────────────────────────────────────────────────────────── */

/**
 * Monsoon weighting. Dhaka's drainage complaints spike with rainfall, so a
 * smooth seasonal curve peaking mid-window makes the trend charts tell a story
 * instead of drawing noise.
 */
function rainFactor(dayIndex, random) {
  const seasonal = 0.5 + 0.5 * Math.sin((dayIndex / DAYS_OF_HISTORY) * Math.PI * 1.6);
  const burst = random() < 0.09 ? 1.8 : 1; // occasional heavy-rain day
  return seasonal * burst;
}

/**
 * Build the dataset.
 * @param {number} [now] Epoch millis to anchor the window to; injectable for tests.
 * @returns {Array<object>} newest-first list of signals
 */
export function generateSignals(now = Date.now()) {
  const random = makeRandom(SEED);
  const signals = [];
  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);

  for (let daysAgo = DAYS_OF_HISTORY; daysAgo >= 0; daysAgo -= 1) {
    const dayIndex = DAYS_OF_HISTORY - daysAgo;
    const date = new Date(dayStart.getTime() - daysAgo * 86_400_000);
    const weekday = date.getDay();

    // Friday is the weekly holiday in Bangladesh; reporting drops noticeably.
    const weekdayFactor = weekday === 5 ? 0.55 : weekday === 6 ? 0.8 : 1;
    const rain = rainFactor(dayIndex, random);

    // Volume grows slowly across the window — the programme is being adopted.
    const growth = 0.78 + (dayIndex / DAYS_OF_HISTORY) * 0.5;
    const count = Math.max(3, Math.round(gaussian(random, 17 * weekdayFactor * growth, 4)));

    for (let i = 0; i < count; i += 1) {
      signals.push(makeSignal(random, date, rain, now));
    }
  }

  markDuplicates(signals);
  return signals.sort((a, b) => b.createdAt - a.createdAt);
}

function makeSignal(random, date, rain, now) {
  // Waterlogging is the category that responds to rain; the rest stay flat.
  const category = weightedPick(random, CATEGORIES, (item) =>
    item.id === 'waterlogging' ? item.weight * (0.6 + rain * 1.4) : item.weight,
  );

  const ward = weightedPick(random, WARDS, (item) => Math.sqrt(item.population));
  const channel = weightedPick(random, CHANNELS);

  // Severity leans higher for utilities and safety, lower for slow-burn issues.
  const severityBias = { power: 0.9, safety: 1.2, water: 0.6, air: -0.5, streetlight: -0.4 }[category.id] ?? 0;
  const severity = clampInt(
    Math.round(weightedPick(random, SEVERITIES).id + severityBias * (random() < 0.5 ? 1 : 0)),
    1,
    5,
  );

  // Reports arrive in two humps: the morning commute and the evening return.
  const hour = random() < 0.58
    ? clampInt(Math.round(gaussian(random, 9.5, 2.4)), 5, 13)
    : clampInt(Math.round(gaussian(random, 19, 2.6)), 14, 23);

  const createdAt = date.getTime() + hour * 3_600_000 + Math.floor(random() * 3_600_000);
  const template = pick(random, TEMPLATES[category.id]);
  const place = pick(random, LANDMARKS[ward.id]);
  const ageHours = (now - createdAt) / 3_600_000;

  const signal = {
    id: makeId(random),
    createdAt,
    category: category.id,
    ward: ward.id,
    zone: ward.zone,
    channel: channel.id,
    severity,
    language: template.lang,
    text: template.text.replace('{place}', place),
    place,
    reporter: `+8801${Math.floor(random() * 9) + 1}${String(Math.floor(random() * 100_000_000)).padStart(8, '0')}`,
    /* How confident the triage model was in its own classification. */
    confidence: Number(gaussian(random, 0.88, 0.09, 0.42, 0.995).toFixed(3)),
    autoTriaged: random() > 0.06,
    duplicateOf: null,
    assignee: null,
    resolvedAt: null,
    status: 'new',
    dept: category.dept,
  };

  applyLifecycle(signal, random, ageHours, now);
  return signal;
}

/**
 * Decide where a report has got to. Older reports are more likely to be closed;
 * high severity moves faster; a slice of every cohort is deliberately left
 * stuck, because that is what the SLA-breach KPI is there to surface.
 */
function applyLifecycle(signal, random, ageHours, now) {
  const sla = getCategory(signal.category).sla;
  const urgency = 1 + (signal.severity - 3) * 0.28;

  // Probability of eventual resolution rises with age and urgency.
  const resolveChance = Math.min(0.94, (ageHours / (sla * 2.4)) * urgency * 0.85);

  if (random() < resolveChance) {
    // Log-ish response distribution: most fast, a long tail of stragglers.
    const responseHours = Math.max(
      0.4,
      gaussian(random, sla * 0.62, sla * 0.42) * (random() < 0.14 ? 2.6 : 1) / urgency,
    );
    const resolvedAt = signal.createdAt + responseHours * 3_600_000;

    if (resolvedAt <= now) {
      signal.status = 'resolved';
      signal.resolvedAt = Math.round(resolvedAt);
      signal.assignee = pick(random, OFFICERS);
      return;
    }
  }

  // Still open: how far it has travelled depends on how long it has waited.
  if (ageHours > sla * 0.5 && random() < 0.72) {
    signal.status = 'assigned';
    signal.assignee = pick(random, OFFICERS);
  } else if (ageHours > 2 && random() < 0.8) {
    signal.status = 'triaged';
  } else {
    signal.status = 'new';
  }
}

/**
 * Flag near-duplicates: same category, same ward, filed within 36 hours.
 * The dedup rate is one of the headline KPIs, so it has to be derived from the
 * data rather than invented.
 */
function markDuplicates(signals) {
  const byKey = new Map();

  for (const signal of [...signals].sort((a, b) => a.createdAt - b.createdAt)) {
    const key = `${signal.category}:${signal.ward}`;
    const previous = byKey.get(key);

    if (previous && signal.createdAt - previous.createdAt < 36 * 3_600_000) {
      signal.duplicateOf = previous.duplicateOf ?? previous.id;
    } else {
      byKey.set(key, signal);
    }
  }
}

function makeId(random) {
  const digits = String(Math.floor(random() * 1_000_000)).padStart(6, '0');
  return `NGK-${digits}`;
}

const clampInt = (value, min, max) => Math.min(max, Math.max(min, Math.round(value)));

/** Exported for the intake view, which needs ids in the same shape. */
export function newSignalId() {
  return `NGK-${String(Math.floor(Math.random() * 1_000_000)).padStart(6, '0')}`;
}
