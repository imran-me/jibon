/**
 * Response protocols: what to send, what to ask, what to tell the bystander, and
 * what the receiving hospital should have standing by.
 *
 * These are deliberately *static, reviewable tables* rather than model output.
 * The AI decides which protocol applies; it does not invent the protocol. That
 * separation is what makes the system safe to demonstrate: a clinician can audit
 * this file line by line, and nothing reaches a bystander that was not written
 * here in advance.
 *
 * Guidance is bounded to widely published lay first-aid steps. Nothing here
 * prescribes medication, dosage, or any intervention requiring training.
 */

import { getType } from './taxonomy.js';

/**
 * Equipment manifests.
 *
 * The single highest-leverage output in the whole product: the ambulance is
 * already going to be dispatched, so telling the crew what to load costs nothing
 * and changes what treatment is possible on scene.
 */
export const EQUIPMENT = {
  cardiac: [
    { id: 'aed', label: 'Defibrillator / AED', critical: true },
    { id: 'airway', label: 'Advanced airway kit', critical: true },
    { id: 'oxygen', label: 'Oxygen with bag-valve mask', critical: true },
    { id: 'monitor', label: 'Cardiac monitor / 12-lead ECG', critical: true },
    { id: 'iv', label: 'IV access and fluids', critical: false },
    { id: 'suction', label: 'Portable suction', critical: false },
  ],
  unconscious: [
    { id: 'airway', label: 'Airway management kit', critical: true },
    { id: 'oxygen', label: 'Oxygen with bag-valve mask', critical: true },
    { id: 'glucometer', label: 'Blood glucose meter', critical: true },
    { id: 'monitor', label: 'Vitals monitor with SpO₂', critical: true },
    { id: 'aed', label: 'Defibrillator', critical: false },
    { id: 'spinal', label: 'Cervical collar (if trauma suspected)', critical: false },
  ],
  trauma: [
    { id: 'haemorrhage', label: 'Haemorrhage control — tourniquets, packing', critical: true },
    { id: 'spinal', label: 'Spinal board and cervical collar', critical: true },
    { id: 'splint', label: 'Limb splints / traction splint', critical: true },
    { id: 'iv', label: 'Large-bore IV access and fluids', critical: true },
    { id: 'oxygen', label: 'Oxygen with bag-valve mask', critical: true },
    { id: 'extrication', label: 'Extrication tools', critical: false },
    { id: 'monitor', label: 'Vitals monitor', critical: false },
  ],
  bleeding: [
    { id: 'haemorrhage', label: 'Tourniquets and haemostatic dressings', critical: true },
    { id: 'iv', label: 'Large-bore IV access and fluids', critical: true },
    { id: 'oxygen', label: 'Oxygen', critical: true },
    { id: 'monitor', label: 'Vitals monitor', critical: false },
    { id: 'warming', label: 'Patient warming blanket', critical: false },
  ],
  breathing: [
    { id: 'oxygen', label: 'High-flow oxygen', critical: true },
    { id: 'nebuliser', label: 'Nebuliser', critical: true },
    { id: 'airway', label: 'Airway kit and suction', critical: true },
    { id: 'spo2', label: 'Pulse oximeter', critical: true },
    { id: 'monitor', label: 'Vitals monitor', critical: false },
  ],
  stroke: [
    { id: 'monitor', label: 'Vitals monitor with SpO₂', critical: true },
    { id: 'glucometer', label: 'Blood glucose meter', critical: true },
    { id: 'oxygen', label: 'Oxygen', critical: false },
    { id: 'iv', label: 'IV access', critical: false },
    { id: 'stroke-scale', label: 'Stroke assessment scale card', critical: true },
  ],
  obstetric: [
    { id: 'delivery', label: 'Sterile delivery kit', critical: true },
    { id: 'neonatal', label: 'Neonatal resuscitation kit and warmer', critical: true },
    { id: 'iv', label: 'IV access and fluids', critical: true },
    { id: 'oxygen', label: 'Oxygen', critical: false },
    { id: 'bp', label: 'Blood pressure monitor (pre-eclampsia risk)', critical: true },
  ],
  burn: [
    { id: 'burn-dressing', label: 'Sterile burn dressings and cling film', critical: true },
    { id: 'iv', label: 'Large-bore IV access and fluids', critical: true },
    { id: 'airway', label: 'Airway kit — inhalation injury risk', critical: true },
    { id: 'oxygen', label: 'High-flow oxygen', critical: true },
    { id: 'warming', label: 'Warming blanket', critical: false },
  ],
  poisoning: [
    { id: 'airway', label: 'Airway kit and suction', critical: true },
    { id: 'oxygen', label: 'Oxygen', critical: true },
    { id: 'monitor', label: 'Cardiac monitor', critical: true },
    { id: 'iv', label: 'IV access', critical: true },
    { id: 'sample', label: 'Container for the substance / sample', critical: false },
  ],
  fire: [
    { id: 'oxygen', label: 'High-flow oxygen', critical: true },
    { id: 'airway', label: 'Airway kit — inhalation injury risk', critical: true },
    { id: 'burn-dressing', label: 'Burn dressings', critical: true },
    { id: 'extrication', label: 'Rescue and extrication', critical: true },
  ],
  police: [
    { id: 'trauma-kit', label: 'Basic trauma kit', critical: true },
    { id: 'ppe', label: 'Scene PPE', critical: false },
  ],
  other: [
    { id: 'basic', label: 'Standard response kit', critical: true },
    { id: 'oxygen', label: 'Oxygen', critical: false },
    { id: 'monitor', label: 'Vitals monitor', critical: false },
  ],
};

/**
 * Bystander guidance.
 *
 * Every step is a published lay first-aid action. The first item in each list is
 * always the safety check, and the last is always the instruction to stay on the
 * line, because that is what keeps the session — and the AI's view — alive.
 */
export const FIRST_AID = {
  cardiac: {
    headline: 'Start chest compressions if they are not responding and not breathing normally.',
    steps: [
      'Check the area is safe for you before you approach.',
      'Shout for help and ask a second person to find a defibrillator if one exists nearby.',
      'Place the heel of your hand in the centre of the chest, the other hand on top.',
      'Push down hard and fast — about twice per second, letting the chest rise fully each time.',
      'Do not stop to check for a pulse. Keep going until a responder takes over.',
      'Keep this line open. The doctor joining can count the rhythm with you.',
    ],
    avoid: ['Do not give food, water or any medicine.', 'Do not leave the person alone to look for help.'],
  },
  unconscious: {
    headline: 'Check breathing first. That single answer changes everything that follows.',
    steps: [
      'Check the area is safe, then tap their shoulders firmly and shout their name.',
      'Tilt the head back gently and lift the chin to open the airway.',
      'Look at the chest and listen for breath for ten seconds.',
      'If breathing normally, roll them onto their side with the head tilted back so the airway stays clear.',
      'If not breathing normally, begin chest compressions immediately — hard and fast in the centre of the chest.',
      'Stay on the line and keep the camera on them so we can watch for change.',
    ],
    avoid: [
      'Do not put anything in their mouth.',
      'Do not move them if they may have fallen from a height or been hit by a vehicle, unless they are in danger where they lie.',
      'Do not splash water on their face.',
    ],
  },
  trauma: {
    headline: 'Control visible bleeding. Do not move them unless they are in immediate danger.',
    steps: [
      'Check for traffic, fire, fuel or live wires before approaching.',
      'Press firmly and continuously on any heavy bleeding with the cleanest cloth available.',
      'Keep their head and neck still and in line with the body.',
      'Talk to them and note whether they answer — the responders will ask you this.',
      'Cover them to keep them warm.',
      'Keep the line open and point the camera at the injuries when asked.',
    ],
    avoid: [
      'Do not remove any object that is embedded in the body.',
      'Do not give food or water — surgery may be needed.',
      'Do not sit them up or drag them by the arms.',
    ],
  },
  bleeding: {
    headline: 'Direct, firm, continuous pressure. Do not release to check.',
    steps: [
      'Press hard directly on the wound with the cleanest cloth you have.',
      'If blood soaks through, add more cloth on top — do not remove what is already there.',
      'If a limb is bleeding heavily and pressure is not holding it, apply a tight band well above the wound and note the time.',
      'Lay the person down and raise their legs slightly.',
      'Keep them warm and keep talking to them.',
      'Stay on the line — tell us if they become pale, cold or stop answering.',
    ],
    avoid: ['Do not wash a deep wound.', 'Do not remove embedded objects.', 'Do not give anything to drink.'],
  },
  breathing: {
    headline: 'Sit them upright and keep the air around them clear.',
    steps: [
      'Help them sit up and lean slightly forward — do not lay them flat.',
      'Loosen anything tight around the neck and chest.',
      'Move them away from smoke, dust or fumes if it is safe to do so.',
      'If they have their own inhaler, help them use it as they normally would.',
      'Keep them calm and count their breaths for the responders.',
      'Stay on the line and tell us immediately if their lips or fingers turn blue.',
    ],
    avoid: ['Do not lay them flat.', 'Do not give anyone else\'s medication.'],
  },
  stroke: {
    headline: 'Note the time symptoms started. Treatment options depend on it.',
    steps: [
      'Ask them to smile, raise both arms, and repeat a short sentence.',
      'Note exactly when they were last seen completely normal — say this time to the responders.',
      'Sit them supported with the head slightly raised.',
      'Do not give food, drink or medicine — swallowing may be affected.',
      'Keep them calm and still.',
      'Stay on the line so the stroke team can be prepared before arrival.',
    ],
    avoid: ['Do not give aspirin or any other medicine.', 'Do not let them sleep it off.', 'Do not offer water.'],
  },
  obstetric: {
    headline: 'Get her comfortable and do not rush the delivery.',
    steps: [
      'Help her into a comfortable position and give her privacy where possible.',
      'Wash your hands if there is clean water.',
      'Do not pull on the baby. Support the head as it emerges.',
      'Keep the baby warm and dry against the mother, covered including the head.',
      'Note the time of birth.',
      'Stay on the line — a midwife or doctor can guide you through this.',
    ],
    avoid: ['Do not pull the umbilical cord.', 'Do not cut the cord without instruction.'],
  },
  burn: {
    headline: 'Cool the burn with running water for twenty minutes. Nothing else on it.',
    steps: [
      'Stop the burning — move away from the source and remove hot or soaked clothing unless it is stuck.',
      'Cool the burn under cool running water for twenty full minutes.',
      'Remove rings, bangles and watches before swelling begins.',
      'Cover loosely with cling film or a clean, non-fluffy cloth.',
      'Keep the rest of the body warm — cooling a large burn can drop their temperature.',
      'Stay on the line and show us the burn on camera when asked.',
    ],
    avoid: [
      'Do not apply toothpaste, oil, butter, ash or ice.',
      'Do not burst blisters.',
      'Do not peel off clothing stuck to the skin.',
    ],
  },
  poisoning: {
    headline: 'Do not make them vomit. Find the container.',
    steps: [
      'Move them to fresh air if fumes are involved.',
      'Find the bottle, packet or plant and keep it to show the responders.',
      'Note roughly how much and how long ago, if anyone saw it.',
      'If they are unresponsive but breathing, roll them onto their side.',
      'Watch their breathing continuously.',
      'Stay on the line — the poison information can be checked while help is coming.',
    ],
    avoid: [
      'Do not make them vomit.',
      'Do not give milk, salt water or any home remedy.',
      'Do not give anything by mouth.',
    ],
  },
  fire: {
    headline: 'Get everyone out and stay out. Do not go back inside.',
    steps: [
      'Leave the building immediately and take others with you.',
      'Stay low under smoke where the air is clearer.',
      'Close doors behind you as you leave.',
      'Move well clear and account for everyone.',
      'If clothing is on fire — stop, drop, and roll, or smother with a heavy cloth.',
      'Stay on the line and tell us how many people are unaccounted for.',
    ],
    avoid: ['Do not re-enter for belongings.', 'Do not use lifts.'],
  },
  police: {
    headline: 'Protect yourself first. Do not confront anyone.',
    steps: [
      'Move to a safe place and stay out of sight if there is a threat.',
      'Do not confront or pursue anyone.',
      'Note descriptions, direction of travel and vehicle details if you can do so safely.',
      'Attend to injuries only when the scene is safe.',
      'Preserve the scene — do not move things unnecessarily.',
      'Stay on the line.',
    ],
    avoid: ['Do not intervene physically.', 'Do not move a body or weapon.'],
  },
  other: {
    headline: 'Keep the person safe and stay with them until help arrives.',
    steps: [
      'Check the area is safe for you.',
      'Stay with the person and keep them calm.',
      'Do not move them unless they are in danger where they are.',
      'Watch their breathing and whether they stay responsive.',
      'Keep them warm.',
      'Stay on the line so we can update the responders.',
    ],
    avoid: ['Do not give medication.', 'Do not leave them alone.'],
  },
};

/**
 * Questions the operator still needs answered.
 *
 * The AI's job is to notice which of these are already answered by the caller's
 * narrative and ask only for what is genuinely missing — that is the difference
 * between a two-minute interview and a fifteen-second one.
 */
export const REQUIRED_INFORMATION = {
  universal: [
    { id: 'location', label: 'Exact location or nearest landmark', weight: 10 },
    { id: 'patients', label: 'How many people are affected', weight: 6 },
    { id: 'access', label: 'Can a vehicle reach the scene', weight: 4 },
  ],
  cardiac: [
    { id: 'breathing', label: 'Are they breathing normally', weight: 10 },
    { id: 'responsive', label: 'Do they respond to voice or touch', weight: 9 },
    { id: 'cpr', label: 'Is anyone doing chest compressions', weight: 8 },
    { id: 'age', label: 'Approximate age', weight: 5 },
    { id: 'history', label: 'Known heart condition or medication', weight: 4 },
  ],
  unconscious: [
    { id: 'breathing', label: 'Are they breathing normally', weight: 10 },
    { id: 'responsive', label: 'Any response to voice or pain', weight: 9 },
    { id: 'trauma', label: 'Was there a fall, blow or accident', weight: 8 },
    { id: 'duration', label: 'How long have they been unresponsive', weight: 7 },
    { id: 'diabetes', label: 'Known diabetes or epilepsy', weight: 5 },
  ],
  trauma: [
    { id: 'mechanism', label: 'What hit what, and at what speed', weight: 9 },
    { id: 'trapped', label: 'Is anyone trapped', weight: 9 },
    { id: 'bleeding', label: 'Any heavy visible bleeding', weight: 8 },
    { id: 'responsive', label: 'Are they conscious and talking', weight: 8 },
    { id: 'hazards', label: 'Fire, fuel, live wires or traffic risk', weight: 7 },
  ],
  bleeding: [
    { id: 'site', label: 'Where is the bleeding', weight: 9 },
    { id: 'rate', label: 'Is it spurting or oozing', weight: 9 },
    { id: 'controlled', label: 'Is pressure controlling it', weight: 8 },
    { id: 'responsive', label: 'Are they still alert', weight: 8 },
  ],
  breathing: [
    { id: 'speech', label: 'Can they speak a full sentence', weight: 9 },
    { id: 'colour', label: 'Any blue lips or fingertips', weight: 9 },
    { id: 'onset', label: 'How suddenly did it start', weight: 6 },
    { id: 'history', label: 'Known asthma or allergy', weight: 6 },
  ],
  stroke: [
    { id: 'onset', label: 'Exact time last seen normal', weight: 10 },
    { id: 'face', label: 'Is one side of the face drooping', weight: 8 },
    { id: 'arms', label: 'Can they hold both arms up', weight: 8 },
    { id: 'speech', label: 'Is speech slurred or confused', weight: 8 },
  ],
  obstetric: [
    { id: 'weeks', label: 'How many weeks pregnant', weight: 8 },
    { id: 'contractions', label: 'How far apart are contractions', weight: 8 },
    { id: 'bleeding', label: 'Any bleeding', weight: 9 },
    { id: 'crowning', label: 'Is the baby visible', weight: 9 },
  ],
  burn: [
    { id: 'area', label: 'How much of the body is burned', weight: 9 },
    { id: 'cause', label: 'Flame, scald, chemical or electrical', weight: 8 },
    { id: 'airway', label: 'Any burns to face, or smoke inhaled', weight: 9 },
    { id: 'cooling', label: 'Has cooling been started', weight: 6 },
  ],
  poisoning: [
    { id: 'substance', label: 'What was taken or swallowed', weight: 10 },
    { id: 'amount', label: 'Roughly how much', weight: 8 },
    { id: 'when', label: 'How long ago', weight: 8 },
    { id: 'responsive', label: 'Are they still responsive', weight: 8 },
  ],
  fire: [
    { id: 'trapped', label: 'Is anyone still inside', weight: 10 },
    { id: 'spread', label: 'How large is the fire', weight: 8 },
    { id: 'hazard', label: 'Gas cylinders or chemicals present', weight: 8 },
  ],
  police: [
    { id: 'threat', label: 'Is the threat still present', weight: 10 },
    { id: 'weapons', label: 'Any weapons involved', weight: 9 },
    { id: 'injuries', label: 'Anyone injured', weight: 8 },
  ],
  other: [
    { id: 'nature', label: 'What is actually happening', weight: 8 },
    { id: 'responsive', label: 'Is anyone injured or unwell', weight: 7 },
  ],
};

/**
 * What the receiving hospital should have standing by.
 *
 * Presented to the hospital as a *checklist to confirm*, never as an order. Each
 * item names a resource, not a treatment decision.
 */
export const HOSPITAL_PREP = {
  cardiac: [
    { id: 'ccu', label: 'CCU bed and cardiac monitoring', critical: true },
    { id: 'cathlab', label: 'Cath lab team on standby for primary PCI', critical: true },
    { id: 'ecg', label: 'ECG ready at the door', critical: true },
    { id: 'crash', label: 'Crash trolley and defibrillator at receiving bay', critical: true },
    { id: 'cardiologist', label: 'On-call cardiologist alerted', critical: true },
    { id: 'bloods', label: 'Cardiac enzyme panel ordered in advance', critical: false },
  ],
  unconscious: [
    { id: 'resus', label: 'Resuscitation bay cleared', critical: true },
    { id: 'ct', label: 'CT scanner slot held', critical: true },
    { id: 'airway', label: 'Intubation kit and anaesthetist alerted', critical: true },
    { id: 'glucose', label: 'Point-of-care glucose and electrolytes', critical: true },
    { id: 'icu', label: 'ICU bed provisionally held', critical: false },
    { id: 'tox', label: 'Toxicology screen if cause unknown', critical: false },
  ],
  trauma: [
    { id: 'trauma-team', label: 'Trauma team activation', critical: true },
    { id: 'resus', label: 'Resuscitation bay with rapid infuser', critical: true },
    { id: 'blood', label: 'Cross-match and reserve packed cells — O-negative on standby', critical: true },
    { id: 'ct', label: 'CT trauma series slot held', critical: true },
    { id: 'ot', label: 'Emergency theatre on standby', critical: true },
    { id: 'ortho', label: 'Orthopaedic and general surgery on-call alerted', critical: false },
    { id: 'icu', label: 'ICU bed provisionally held', critical: false },
  ],
  bleeding: [
    { id: 'blood', label: 'Activate massive transfusion protocol', critical: true },
    { id: 'ot', label: 'Emergency theatre on standby', critical: true },
    { id: 'resus', label: 'Resus bay with rapid infuser and warmer', critical: true },
    { id: 'surgeon', label: 'On-call surgeon alerted', critical: true },
    { id: 'coag', label: 'Coagulation panel ordered in advance', critical: false },
  ],
  breathing: [
    { id: 'resus', label: 'Resus bay with high-flow oxygen', critical: true },
    { id: 'neb', label: 'Nebuliser and bronchodilators ready', critical: true },
    { id: 'vent', label: 'Ventilator and ICU bed on standby', critical: true },
    { id: 'abg', label: 'Blood gas analyser available', critical: false },
    { id: 'xray', label: 'Portable chest X-ray at the bay', critical: false },
  ],
  stroke: [
    { id: 'stroke-team', label: 'Stroke team activation — clock is running', critical: true },
    { id: 'ct', label: 'CT scanner cleared for immediate scan', critical: true },
    { id: 'thrombolysis', label: 'Thrombolysis pathway prepared pending imaging', critical: true },
    { id: 'bloods', label: 'Coagulation and glucose ordered in advance', critical: true },
    { id: 'neuro', label: 'Neurologist alerted', critical: false },
  ],
  obstetric: [
    { id: 'labour', label: 'Labour ward informed, bed prepared', critical: true },
    { id: 'ot', label: 'Emergency caesarean theatre on standby', critical: true },
    { id: 'neonatal', label: 'Neonatal resuscitation team and warmer', critical: true },
    { id: 'blood', label: 'Cross-match — postpartum haemorrhage risk', critical: true },
    { id: 'obstetrician', label: 'On-call obstetrician alerted', critical: false },
  ],
  burn: [
    { id: 'burn-unit', label: 'Burn unit bed and burn team alerted', critical: true },
    { id: 'airway', label: 'Anaesthetist for airway assessment', critical: true },
    { id: 'fluids', label: 'Fluid resuscitation calculated on arrival weight', critical: true },
    { id: 'theatre', label: 'Theatre for escharotomy if indicated', critical: false },
    { id: 'isolation', label: 'Isolation and warming prepared', critical: false },
  ],
  poisoning: [
    { id: 'tox', label: 'Toxicology consult and poison centre reference', critical: true },
    { id: 'resus', label: 'Resus bay with cardiac monitoring', critical: true },
    { id: 'antidote', label: 'Confirm antidote availability for the named substance', critical: true },
    { id: 'icu', label: 'ICU bed on standby', critical: false },
    { id: 'lavage', label: 'Decontamination facilities ready', critical: false },
  ],
  fire: [
    { id: 'burn-unit', label: 'Burn unit alerted, multiple casualties possible', critical: true },
    { id: 'airway', label: 'Airway team for inhalation injury', critical: true },
    { id: 'surge', label: 'Mass casualty surge plan on standby', critical: true },
    { id: 'co', label: 'Carbon monoxide testing available', critical: false },
  ],
  police: [
    { id: 'resus', label: 'Resus bay prepared', critical: true },
    { id: 'security', label: 'Hospital security informed', critical: true },
    { id: 'forensic', label: 'Preserve clothing and evidence on arrival', critical: false },
  ],
  other: [
    { id: 'ed', label: 'Emergency department bay assigned', critical: true },
    { id: 'triage', label: 'Senior triage nurse to assess on arrival', critical: true },
  ],
};

/* ── Accessors ────────────────────────────────────────────────────────────── */

export const equipmentFor = (type) => EQUIPMENT[type] || EQUIPMENT.other;
export const firstAidFor = (type) => FIRST_AID[type] || FIRST_AID.other;
export const hospitalPrepFor = (type) => HOSPITAL_PREP[type] || HOSPITAL_PREP.other;

/** Universal questions plus the type-specific ones, ordered by clinical weight. */
export function requiredInformationFor(type) {
  const specific = REQUIRED_INFORMATION[type] || REQUIRED_INFORMATION.other;
  return [...specific, ...REQUIRED_INFORMATION.universal].sort((a, b) => b.weight - a.weight);
}

/**
 * Which required questions are still unanswered for an incident.
 * Drives the "Information still required" block on the Emergency Brief.
 */
export function missingInformation(incident) {
  const answered = new Set(Object.keys(incident.answers || {}));
  return requiredInformationFor(incident.type).filter((item) => !answered.has(item.id));
}

/**
 * Completeness of the brief, 0–1, weighted by how clinically important each
 * answer is. A high-weight gap (is the patient breathing) costs far more than a
 * low-weight one (approximate age).
 */
export function briefCompleteness(incident) {
  const required = requiredInformationFor(incident.type);
  const total = required.reduce((sum, item) => sum + item.weight, 0);
  if (!total) return 1;

  const answered = new Set(Object.keys(incident.answers || {}));
  const got = required
    .filter((item) => answered.has(item.id))
    .reduce((sum, item) => sum + item.weight, 0);

  return got / total;
}

/** Critical-only equipment, for the compact dispatch card. */
export const criticalEquipment = (type) => equipmentFor(type).filter((item) => item.critical);

/** Human-readable one-liner used in dispatch messages and model prompts. */
export function manifestSummary(type) {
  return criticalEquipment(type).map((item) => item.label).join(', ') ||
    `Standard kit for ${getType(type).label.toLowerCase()}`;
}
