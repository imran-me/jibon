/**
 * Scenario simulation.
 *
 * Real emergency infrastructure — 999, ambulance telematics, hospital systems —
 * is not available to a prototype, and pretending otherwise would be dishonest.
 * So the demo runs a scripted case forward through the same state machine the
 * live system uses, at compressed speed, mutating a real incident record through
 * the real store. Nothing here is a mock-up of the UI: the interfaces are simply
 * reacting to an incident that is genuinely changing.
 *
 * Each step declares the wall-clock minute it represents and the mutation it
 * applies. `SPEED` compresses that into demo time.
 */

import { emit } from '../core/bus.js';
import { commitIncident, addIncident, setSimulating, getState } from '../core/store.js';
import {
  createIncident, applyClassification, applyRoutePlan, setPrepState,
  addTimelineEntry, verifyIncident, fact, preArrivalLeadMinutes,
} from './incidents.js';
import { SCENES } from './incidents.js';
import { getFacility, travelMinutes } from './network.js';
import { getType } from './taxonomy.js';

/** One simulated minute per this many milliseconds of real time. */
const SPEED = 1400;

export const TOPICS = {
  STEP: 'sim:step',
  STARTED: 'sim:started',
  FINISHED: 'sim:finished',
  STOPPED: 'sim:stopped',
};

let timers = [];
let running = null;

const scene = (id) => SCENES.find((item) => item.id === id) || SCENES[0];

/* ── Scenarios ────────────────────────────────────────────────────────────── */

/**
 * The scenarios are written to exercise different parts of the system: the
 * Kuakata case is the long-transfer relay problem, the Mawa case is a
 * multi-casualty scene close to a tertiary centre.
 */
export const SCENARIOS = [
  {
    id: 'kuakata-unconscious',
    label: 'Unconscious person — Kuakata',
    blurb: 'Remote coastal location, no clinician nearby, definitive care 250 km away. Exercises the relay chain.',
    type: 'unconscious',
    sceneId: 'kuakata',
    channel: 'voice',
    language: 'mixed',
    narrative:
      'Uni hothat pore gechen, dak dile sara dicchen na. Nishash nicchen kina bujhte parchi na. ' +
      'Ekhane kono doctor nai. Amra Kuakata beach er kache achi.',
    classification: {
      priority: 'P1',
      confidence: 0.91,
      summary: 'Adult collapsed, unresponsive, breathing status unconfirmed. No trained help on scene.',
      reasoning: 'Unresponsive with unconfirmed breathing is treated as P1 until breathing is established.',
      consciousness: 'unresponsive',
      breathing: 'unknown',
      observations: [
        'Caller reports no response to voice',
        'Breathing not established — caller unable to confirm',
        'No trained responder present at the scene',
      ],
      missing: ['Is the chest rising?', 'Was there a fall or a blow to the head?', 'Any known heart condition?'],
    },
  },
  {
    id: 'mawa-rta',
    label: 'Road traffic accident — Padma Bridge approach',
    blurb: 'Multi-casualty collision on a highway. Exercises trauma routing and equipment matching.',
    type: 'trauma',
    sceneId: 'mawa',
    channel: 'icon',
    language: 'mixed',
    narrative:
      'Bus ar microbus dhakka legeche Padma setu approach road e. Onek manush injured, ' +
      'ekjon rasta te pore ache uthte parche na, onek rokto porche.',
    classification: {
      priority: 'P1',
      confidence: 0.88,
      summary: 'Bus and microbus collision, multiple casualties, one immobile with heavy bleeding.',
      reasoning: 'High-energy mechanism with uncontrolled haemorrhage and an immobile casualty.',
      consciousness: 'voice',
      breathing: 'laboured',
      observations: [
        'High-energy collision — bus against microbus',
        'At least one casualty immobile on the carriageway',
        'Heavy visible bleeding reported',
        'Live traffic hazard at the scene',
      ],
      missing: ['How many people are trapped?', 'Is the bleeding controlled by pressure?', 'Is traffic stopped?'],
    },
  },
];

export const getScenario = (id) => SCENARIOS.find((scenario) => scenario.id === id) || SCENARIOS[0];

/* ── Step script ──────────────────────────────────────────────────────────── */

/**
 * Build the step list for a scenario.
 *
 * `at` is the simulated minute since the call was raised. Steps mutate the
 * incident and return a short caption the UI narrates.
 */
function buildSteps(scenario, incident) {
  const definition = getType(incident.type);
  const destination = () => getFacility(incident.route?.destinationId);
  const relays = () => (incident.route?.relayIds || []).map(getFacility).filter(Boolean);

  return [
    {
      at: 0.2,
      caption: 'AI parsing the caller\'s speech',
      apply: () => {
        addTimelineEntry(incident, {
          code: 'listening',
          label: 'Voice channel opened',
          detail: 'Continuous session established — caller does not need to repeat anything',
          actor: 'system',
        });
      },
    },
    {
      at: 0.35,
      caption: `Classified ${definition.label} · ${scenario.classification.priority}`,
      apply: () => {
        applyClassification(incident, {
          type: scenario.type,
          priority: scenario.classification.priority,
          confidence: scenario.classification.confidence,
          summary: scenario.classification.summary,
          reasoning: scenario.classification.reasoning,
          consciousness: scenario.classification.consciousness,
          breathing: scenario.classification.breathing,
          observations: scenario.classification.observations,
        });

        incident.answers = { ...incident.answers, location: true, patients: true, responsive: true };
        incident.missing = scenario.classification.missing;
      },
    },
    {
      at: 0.6,
      caption: 'Destination chosen by capability, relay points identified',
      apply: () => {
        applyRoutePlan(incident);
        const target = destination();
        addTimelineEntry(incident, {
          code: 'routed',
          label: `Destination set — ${target?.name}`,
          detail: relays().length
            ? `Relay prepared at ${relays().map((facility) => facility.city).join(' and ')}`
            : 'Direct transfer — no relay needed',
          actor: 'gemini',
        });
      },
    },
    {
      at: 0.9,
      caption: 'Ambulance dispatched with a matched equipment manifest',
      apply: () => {
        incident.dispatchedAt = Date.now();
        incident.stage = 'dispatched';
        incident.assignments.unit = scenario.type === 'trauma' ? 'TRA-118' : 'ALS-142';
        incident.assignments.equipped = true;

        addTimelineEntry(incident, {
          code: 'dispatched',
          label: `Ambulance ${incident.assignments.unit} dispatched`,
          detail: `Loaded for ${definition.label.toLowerCase()} — manifest sent to crew before departure`,
          actor: 'dispatch',
        });
      },
    },
    {
      at: 1.6,
      caption: 'Emergency physician joined the open session',
      apply: () => {
        incident.assignments.clinician = 'Dr. N. Akter';
        addTimelineEntry(incident, {
          code: 'clinician',
          label: 'Dr. N. Akter joined the session',
          detail: 'Read the brief on entry — no re-interview of the caller',
          actor: 'clinician',
        });
      },
    },
    {
      at: 2.4,
      caption: 'Bystander receiving guided first aid',
      apply: () => {
        addTimelineEntry(incident, {
          code: 'guidance',
          label: 'First-aid guidance started',
          detail: 'Doctor guiding the bystander through the protocol on the open line',
          actor: 'clinician',
        });
        incident.facts = [
          ...incident.facts,
          fact('guidance', 'Bystander action', 'Guided first aid in progress', 'verified', 'Directed by Dr. N. Akter'),
        ];
      },
    },
    {
      at: 3.5,
      caption: 'Nearby trained volunteer notified',
      apply: () => {
        incident.assignments.volunteers = ['H. Sultana (off-duty nurse)'];
        addTimelineEntry(incident, {
          code: 'volunteer',
          label: 'Volunteer H. Sultana notified',
          detail: 'Off-duty nurse, four minutes away on foot',
          actor: 'system',
        });
      },
    },
    {
      at: 5,
      caption: 'Clinician verified the AI assessment',
      apply: () => {
        verifyIncident(incident, 'Dr. N. Akter');
      },
    },
    {
      at: 9,
      caption: 'Volunteer reached the patient before the ambulance',
      apply: () => {
        addTimelineEntry(incident, {
          code: 'volunteer-onscene',
          label: 'Volunteer reached the patient',
          detail: 'Confirmed breathing status — brief updated from the scene',
          actor: 'volunteer',
        });

        incident.facts = incident.facts.map((entry) =>
          entry.key === 'breathing'
            ? { ...entry, value: scenario.type === 'trauma' ? 'laboured' : 'agonal', source: 'verified' }
            : entry);
        incident.answers = { ...incident.answers, breathing: true };
      },
    },
    {
      at: 16,
      caption: 'Crew on scene, treatment started',
      apply: () => {
        incident.onSceneAt = Date.now();
        incident.stage = 'onscene';
        addTimelineEntry(incident, {
          code: 'onscene',
          label: 'Crew reached the patient',
          detail: 'Arrived with the equipment the case actually needed',
          actor: 'ambulance',
        });
      },
    },
    {
      at: 23,
      caption: 'Patient loaded, transport begun',
      apply: () => {
        incident.departedAt = Date.now();
        incident.stage = 'transporting';
        const target = destination();

        addTimelineEntry(incident, {
          code: 'departed',
          label: `Departed for ${target?.name}`,
          detail: `${Math.round(travelMinutes(incident.origin, target))} minutes estimated`,
          actor: 'ambulance',
        });

        for (const relay of relays()) setPrepState(incident, relay.id, 'preparing');
        if (target) setPrepState(incident, target.id, 'preparing');
      },
    },
    {
      at: 31,
      caption: 'Relay hospital standing by at the roadside',
      apply: () => {
        const [relay] = relays();
        if (relay) {
          setPrepState(incident, relay.id, 'ready');
          addTimelineEntry(incident, {
            code: 'relay-ready',
            label: `${relay.city} team ready at the roadside`,
            detail: 'Blood, fluids and a clinician prepared to join the vehicle',
            actor: 'hospital',
          });
        }
      },
    },
    {
      at: 44,
      caption: 'Relay rendezvous — care level raised in transit',
      apply: () => {
        const [relay] = relays();
        if (relay) {
          addTimelineEntry(incident, {
            code: 'relay-handover',
            label: `Rendezvous at ${relay.city}`,
            detail: 'Supplies transferred and clinician joined the ambulance — journey continued without admission',
            actor: 'hospital',
          });
          incident.facts = [
            ...incident.facts,
            fact('relay', 'Care escalation', `Clinician joined at ${relay.city}`, 'verified'),
          ];
        }
      },
    },
    {
      at: 58,
      caption: 'Receiving hospital team assembled',
      apply: () => {
        const target = destination();
        if (target) {
          setPrepState(incident, target.id, 'ready');
          addTimelineEntry(incident, {
            code: 'destination-ready',
            label: `${target.name} — team ready`,
            detail: `${definition.dept} standing by, theatre and blood confirmed`,
            actor: 'hospital',
          });
        }
      },
    },
    {
      at: 72,
      caption: 'Handover complete — treatment began at the door',
      apply: () => {
        const target = destination();
        incident.handoverAt = Date.now();
        incident.stage = 'arrived';

        if (target) setPrepState(incident, target.id, 'receiving');

        addTimelineEntry(incident, {
          code: 'arrived',
          label: `Handed over at ${target?.name}`,
          detail: 'Team was already assembled — assessment did not restart',
          actor: 'hospital',
        });

        const consumed = (incident.handoverAt - incident.createdAt) / 60_000 / definition.window;
        incident.outcome = {
          windowConsumed: Number(consumed.toFixed(2)),
          survivalIndex: Number(Math.max(0.35, Math.min(0.985, 1.02 - consumed * 0.28)).toFixed(3)),
          equipmentMatched: true,
          preArrivalMinutes: Math.round(preArrivalLeadMinutes(incident) || 0),
        };
      },
    },
  ];
}

/* ── Runner ───────────────────────────────────────────────────────────────── */

/**
 * Start a scenario. Creates a real incident, pushes it into the store, then
 * schedules each step. Returns the incident so the caller can navigate to it.
 */
export function runScenario(scenarioId) {
  stopScenario();

  const scenario = getScenario(scenarioId);
  const location = scene(scenario.sceneId);

  const incident = createIncident({
    type: scenario.type,
    scene: location,
    narrative: scenario.narrative,
    channel: scenario.channel,
    language: scenario.language,
    priority: scenario.classification.priority,
    confidence: scenario.classification.confidence,
    patients: scenario.type === 'trauma' ? 3 : 1,
    mode: 'jibon',
  });

  incident.simulated = true;
  addIncident(incident);
  setSimulating(incident.id);

  const steps = buildSteps(scenario, incident);
  running = { id: incident.id, scenario, total: steps.length, done: 0 };

  emit(TOPICS.STARTED, { incident, scenario, steps: steps.length });

  steps.forEach((step, index) => {
    const timer = setTimeout(() => {
      // A stop or a second run invalidates any steps still queued.
      if (!running || running.id !== incident.id) return;

      step.apply();
      commitIncident(incident);
      running.done = index + 1;

      emit(TOPICS.STEP, {
        incident,
        caption: step.caption,
        index: index + 1,
        total: steps.length,
        minute: step.at,
      });

      if (index === steps.length - 1) {
        emit(TOPICS.FINISHED, { incident, scenario });
        setSimulating(null);
        running = null;
      }
    }, step.at * SPEED);

    timers.push(timer);
  });

  return incident;
}

/** Cancel any running scenario. Safe to call when nothing is running. */
export function stopScenario() {
  for (const timer of timers) clearTimeout(timer);
  timers = [];

  if (running) {
    emit(TOPICS.STOPPED, { id: running.id });
    setSimulating(null);
    running = null;
  }
}

export const isRunning = () => Boolean(running);
export const runningId = () => running?.id || null;

/** Roughly how long a scenario takes to play out, for the UI's progress hint. */
export const scenarioDurationSeconds = (scenarioId) => {
  const scenario = getScenario(scenarioId);
  const incident = createIncident({ type: scenario.type, scene: scene(scenario.sceneId) });
  const steps = buildSteps(scenario, incident);
  return Math.round((steps[steps.length - 1].at * SPEED) / 1000);
};
