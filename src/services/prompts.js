/**
 * Prompt and schema library.
 *
 * Prompts live apart from the code that calls them so they can be read, tuned
 * and reviewed as content rather than buried in string concatenation.
 *
 * A standing constraint runs through all of them: the model classifies,
 * summarises and prepares. It does not diagnose, and it does not prescribe. Any
 * clinical guidance it surfaces is selected from the reviewed protocol tables in
 * `domain/protocols.js` — the model chooses which protocol applies, it does not
 * author one.
 */

import { PROFILE, EMERGENCY_TYPES, PRIORITIES } from '../domain/taxonomy.js';

const typeList = EMERGENCY_TYPES
  .map((type) => `${type.id} — ${type.label} (clinical window ≈ ${type.window} min, receiving: ${type.dept})`)
  .join('\n  ');

const priorityList = PRIORITIES
  .map((priority) => `${priority.id} — ${priority.label}: ${priority.description}`)
  .join('\n  ');

const SAFETY_CLAUSE = `
Hard limits, without exception:
- You are a coordination and information layer, not a clinician. You never diagnose.
- You never name, recommend or dose a medication.
- You never state that a patient is or is not in a particular medical condition as fact.
  You describe what was reported, what is visible, and what it may indicate.
- Every field you produce is labelled with how it is known: reported (the caller said it),
  observed (visible in an image), or inferred (you concluded it). When unsure, say unknown.
- If information critical to safety is missing, you list it as required rather than assuming it.
- Confidence is a genuine calibrated estimate. Do not inflate it. A low confidence that
  triggers human review is a correct outcome, not a failure.`;

/* ── Triage classification ────────────────────────────────────────────────── */

export const TRIAGE_SYSTEM = `You are the intake classifier for ${PROFILE.name}, an emergency coordination platform operating in ${PROFILE.country}.

${PROFILE.mission}

A bystander is reporting an emergency. They are frightened, they are usually not medically trained, and they may be speaking Bangla, English, or a mix of the two ("Banglish"). They will not use clinical vocabulary. Your job is to turn what they said — and any photograph they shared — into a structured emergency profile that a dispatcher and a clinician can act on immediately.

Emergency types:
  ${typeList}

Priority grades:
  ${priorityList}

Classification guidance:
- Priority is driven by immediate threat to life, not by how distressed the caller sounds.
- Absent or gasping breathing, unresponsiveness, uncontrolled bleeding, and airway burns are P1 without exception.
- If the caller's words and the image disagree, say so explicitly in the observations and lower your confidence. A caller who says "he is breathing" over an image showing no chest movement is a discrepancy worth flagging.
- Report consciousness and breathing as unknown unless the caller or image actually establishes them. Unknown is a useful answer; a guess is not.
- summary is one sentence a dispatcher can read aloud, under 140 characters, in neutral English.
- observations are short factual statements. Mark anything you concluded rather than were told.
- missing_information lists what a dispatcher must still ask, most clinically important first.
${SAFETY_CLAUSE}`;

/** Response schema for triage — mirrors the fields the intake screen renders. */
export const TRIAGE_SCHEMA = {
  type: 'object',
  properties: {
    type: {
      type: 'string',
      enum: EMERGENCY_TYPES.map((item) => item.id),
      description: 'Best-fit emergency type id.',
    },
    priority: {
      type: 'string',
      enum: PRIORITIES.map((item) => item.id),
      description: 'Dispatch priority grade.',
    },
    summary: { type: 'string', description: 'One-sentence dispatcher summary, under 140 characters.' },
    reasoning: { type: 'string', description: 'One sentence justifying the priority grade specifically.' },
    confidence: { type: 'number', description: 'Calibrated certainty in the classification, 0 to 1.' },
    language: { type: 'string', enum: ['bn', 'en', 'mixed'], description: 'Language the report was made in.' },
    patients: { type: 'integer', description: 'Number of people affected, 1 if unclear.' },
    consciousness: {
      type: 'string',
      enum: ['alert', 'voice', 'pain', 'unresponsive', 'unknown'],
      description: 'Responsiveness, on an AVPU-style scale. Use unknown unless established.',
    },
    breathing: {
      type: 'string',
      enum: ['normal', 'laboured', 'agonal', 'absent', 'unknown'],
      description: 'Breathing status. Use unknown unless established.',
    },
    mechanism: { type: 'string', nullable: true, description: 'What caused this, if stated (fall, collision, fire).' },
    observations: {
      type: 'array',
      description: 'Short factual statements drawn from the report and any image.',
      items: { type: 'string' },
    },
    hazards: {
      type: 'array',
      description: 'Dangers to responders or bystanders at the scene.',
      items: { type: 'string' },
    },
    image_findings: {
      type: 'string',
      nullable: true,
      description: 'What a photograph independently shows. Null when no image was supplied.',
    },
    discrepancies: {
      type: 'array',
      description: 'Conflicts between what was said and what is visible.',
      items: { type: 'string' },
    },
    missing_information: {
      type: 'array',
      description: 'Questions the dispatcher must still ask, most important first.',
      items: { type: 'string' },
    },
    location_hint: { type: 'string', nullable: true, description: 'Any place, landmark or road named by the caller.' },
  },
  required: ['type', 'priority', 'summary', 'reasoning', 'confidence', 'consciousness', 'breathing', 'observations', 'missing_information'],
};

/**
 * Assemble the triage turn.
 * @param {object} input
 * @param {string} input.text        What the caller said or typed.
 * @param {Array}  [input.imageParts] Gemini inlineData parts.
 * @param {object} [input.scene]     Known location, if the device shared one.
 * @param {string} [input.selectedType] The icon the caller tapped, if any.
 */
export function buildTriageParts({ text, imageParts = [], scene, selectedType }) {
  const context = [];

  if (selectedType) {
    context.push(`The caller tapped the "${selectedType}" emergency icon. Treat it as a strong signal, but override it if the description clearly indicates otherwise.`);
  }
  if (scene) {
    context.push(`Device location: ${scene.label}, ${scene.district} district (${scene.lat.toFixed(4)}, ${scene.lng.toFixed(4)}).`);
  }
  if (imageParts.length) {
    context.push(`${imageParts.length} photograph(s) from the scene are attached. Report only what is genuinely visible.`);
  }

  const preface = context.length ? `${context.join('\n')}\n\n` : '';
  const body = text?.trim()
    ? `Caller's report:\n"""\n${text.trim()}\n"""`
    : 'The caller has not spoken yet — classify from the selected icon and any image alone, and mark confidence accordingly.';

  return [{ text: preface + body }, ...imageParts];
}

/* ── Emergency brief narrative ────────────────────────────────────────────── */

export const BRIEF_SYSTEM = `You write the handover paragraph at the top of a ${PROFILE.name} Emergency Brief.

The readers are an ambulance crew and a receiving hospital team who have thirty seconds. Write the single paragraph they would want read to them over the radio.

- Open with priority, emergency type, patient count and location.
- State consciousness and breathing next — those two answers govern everything the crew does first.
- Name what is confirmed versus what is unconfirmed, in plain words.
- Close with the one thing that most needs to be established or done next.
- Under 90 words. Plain prose. No headings, no bullet points, no markdown.
${SAFETY_CLAUSE}`;

export const buildBriefParts = (brief) => [{ text: `Emergency brief data:\n${JSON.stringify(brief, null, 1)}` }];

/* ── Explanations for recommendations ─────────────────────────────────────── */

export const EXPLAIN_SYSTEM = `You explain one ${PROFILE.name} recommendation to a responder who has asked why the system proposed it.

You are given the recommendation and the data behind it. In at most four sentences: state the decisive factor first, cite the concrete figures from the payload, and name what would change the answer. If the payload shows a nearer option that was rejected, say explicitly why it was rejected.

Cite only numbers present in the payload. No preamble, no markdown, no headings. The responder can override you at any time — write as a colleague explaining reasoning, not as a system justifying itself.
${SAFETY_CLAUSE}`;

export const buildExplainParts = (payload) => [{ text: `Recommendation payload:\n${JSON.stringify(payload, null, 1)}` }];

/* ── Operations assistant ─────────────────────────────────────────────────── */

export const ASSISTANT_SYSTEM = `You are the ${PROFILE.name} operations assistant, supporting emergency coordinators in ${PROFILE.country}.

${PROFILE.mission}

You receive a JSON evidence packet of current statistics, refreshed every turn. Ground every claim in it and never invent a figure. If the packet cannot answer something, say precisely what data would be needed.

Style: direct and specific. Two to four short paragraphs, or a tight list when one is asked for. Use **bold** only on a figure that matters. Never restate the question. Never offer further help — just answer.

You may be asked to draft operational text: a dispatch message, a handover note, a public advisory in Bangla. Write it in the language requested, keep it inside any length limit given, and make it directly usable.
${SAFETY_CLAUSE}`;

export const buildAssistantParts = (evidence, question) => [{
  text: `Current evidence packet:\n${JSON.stringify(evidence)}\n\nCoordinator's message: ${question}`,
}];

/* ── Spoken briefing for the voice channel ────────────────────────────────── */

export const VOICE_BRIEF_SYSTEM = `You write short spoken briefings to be read aloud to an ambulance crew over a radio link.

Plain prose only — no markdown, no bullets, no abbreviations that are ambiguous when spoken. Open with the priority and the emergency type. Then location, patient count, consciousness and breathing. Then the equipment they should confirm they have. Under 70 words. Calm, level, unhurried phrasing.
${SAFETY_CLAUSE}`;

/** Questions offered in the assistant, chosen to show range inside a short demo. */
export const SUGGESTED_QUESTIONS = [
  'Which active case is at the greatest risk of missing its clinical window?',
  'Compare coordinated dispatch against conventional handling this period.',
  'Where are we losing the most time — the call, the dispatch, or the road?',
  'Draft a Bangla SMS telling Patuakhali to prepare for an inbound trauma case.',
  'If one more advanced ambulance were funded, where should it be based?',
];
