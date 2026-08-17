/**
 * Citizen / witness interface.
 *
 * The design constraint here is different from every other screen: the person
 * using it is frightened, probably not medically trained, and may not be able to
 * compose a sentence. So the primary action is a large icon they can hit in two
 * seconds, speech is a first-class input rather than a convenience, and nothing
 * is required before help can be raised.
 *
 * Consent is explicit and revocable. The microphone and camera are never touched
 * until the person taps the control that uses them.
 */

import { h } from '../../core/dom.js';
import { icon } from '../../ui/icons.js';
import { EMERGENCY_TYPES, getType, getPriority } from '../../domain/taxonomy.js';
import { SCENES, createIncident, applyClassification, applyRoutePlan, addTimelineEntry } from '../../domain/incidents.js';
import { firstAidFor } from '../../domain/protocols.js';
import { addIncident, getState, updateSettings } from '../../core/store.js';
import { callGemini, isConfigured, fileToPart, GeminiError } from '../../services/gemini.js';
import { TRIAGE_SYSTEM, TRIAGE_SCHEMA, buildTriageParts } from '../../services/prompts.js';
import { canListen, listen, speak } from '../../services/voice.js';
import { provenanceBadge, priorityBadge } from '../../ui/incident.js';
import { openIncident } from '../../ui/drilldown.js';
import { toast, toastError, toastOk } from '../../ui/toast.js';
import { go } from '../../core/router.js';
import * as fmt from '../../core/format.js';

export const meta = {
  path: '/report',
  title: 'Report an Emergency',
  subtitle: 'Citizen and witness interface',
  icon: 'alert',
};

export function render({ mount }) {
  /** Local view state — deliberately not in the store; nothing here outlives the screen. */
  const draft = {
    type: null,
    text: '',
    images: [],
    scene: SCENES.find((item) => item.id === 'kuakata'),
    classification: null,
    busy: false,
  };

  let recogniser = null;
  const root = h('div.stack.stack--loose');
  mount.appendChild(root);

  const draw = () => root.replaceChildren(...screens(draft, actions));

  const actions = {
    selectType(typeId) {
      draft.type = draft.type === typeId ? null : typeId;
      draw();
    },

    setText(value) {
      draft.text = value;
    },

    setScene(sceneId) {
      draft.scene = SCENES.find((item) => item.id === sceneId) || draft.scene;
      draw();
    },

    async addImages(files) {
      for (const file of Array.from(files).slice(0, 3)) {
        if (!file.type.startsWith('image/')) continue;
        draft.images.push({ file, url: URL.createObjectURL(file) });
      }
      draw();
    },

    removeImage(index) {
      URL.revokeObjectURL(draft.images[index]?.url);
      draft.images.splice(index, 1);
      draw();
    },

    toggleDictation(button) {
      if (recogniser) {
        recogniser.stop();
        return;
      }

      if (!canListen()) {
        toastError('Speech input needs Chrome or Edge. You can type instead.');
        return;
      }

      // Consent is recorded the first time, and only for this browser.
      if (!getState().settings.consentMic) {
        updateSettings({ consentMic: true });
        toast('Microphone consent recorded. It is used only while you hold this button.');
      }

      const textarea = root.querySelector('#report-text');
      const base = draft.text;
      button.dataset.recording = 'true';

      recogniser = listen({
        lang: 'bn-BD',
        onResult: ({ transcript, isFinal }) => {
          const combined = `${base} ${transcript}`.trim();
          if (textarea) textarea.value = combined;
          if (isFinal) draft.text = combined;
        },
        onError: (error) => toastError(error.message),
        onEnd: () => {
          recogniser = null;
          button.dataset.recording = 'false';
          if (textarea) draft.text = textarea.value;
        },
      });
    },

    async analyse() {
      if (!draft.type && !draft.text.trim()) {
        toastError('Choose an emergency type or describe what is happening.');
        return;
      }

      draft.busy = true;
      draw();

      try {
        draft.classification = isConfigured()
          ? await analyseWithGemini(draft)
          : offlineClassification(draft);
        toastOk(isConfigured() ? 'Classified by Gemini.' : 'Classified offline — add an API key for live analysis.');
      } catch (error) {
        toastError(error instanceof GeminiError ? error.message : 'Could not analyse the report.');
        draft.classification = offlineClassification(draft);
      } finally {
        draft.busy = false;
        draw();
      }
    },

    dispatch() {
      if (!draft.classification) return;

      const incident = createIncident({
        type: draft.classification.type,
        scene: draft.scene,
        narrative: draft.text.trim(),
        channel: draft.text.trim() ? 'voice' : 'icon',
        language: draft.classification.language || 'en',
        patients: draft.classification.patients || 1,
        priority: draft.classification.priority,
        confidence: draft.classification.confidence,
        mode: 'jibon',
      });

      applyClassification(incident, draft.classification, {
        source: isConfigured() ? 'gemini' : 'offline classifier',
      });
      applyRoutePlan(incident);

      addTimelineEntry(incident, {
        code: 'routed',
        label: 'Destination and relay plan generated',
        detail: 'Receiving facility notified before dispatch',
        actor: 'gemini',
      });

      addIncident(incident);
      toastOk(`${incident.id} raised — command centre notified.`);
      openIncident(incident);
      go('/command');
    },

    speakGuidance() {
      if (!draft.classification) return;
      const guidance = firstAidFor(draft.classification.type);
      speak(`${guidance.headline} ${guidance.steps.slice(0, 3).join(' ')}`)
        .catch(() => toastError('Could not play the guidance audio.'));
    },

    reset() {
      draft.type = null;
      draft.text = '';
      draft.images.forEach((image) => URL.revokeObjectURL(image.url));
      draft.images = [];
      draft.classification = null;
      draw();
    },
  };

  draw();

  return () => {
    recogniser?.stop();
    draft.images.forEach((image) => URL.revokeObjectURL(image.url));
  };
}

/* ── Screens ──────────────────────────────────────────────────────────────── */

function screens(draft, actions) {
  return [
    h('div.grid.grid--split', {},
      h('div.stack', {}, typeGrid(draft, actions), describeCard(draft, actions)),
      h('div.stack', {}, analysisCard(draft, actions), guidanceCard(draft, actions))),
  ];
}

/** The icon grid. Large targets, plain words, no medical vocabulary. */
function typeGrid(draft, actions) {
  return h(
    'section.card',
    {},
    h('div.card__head', {},
      h('div', {},
        h('div.card__title', {}, 'What is happening?'),
        h('div.card__note', {}, 'Tap the closest match. You can also just speak — the system will work it out.'))),

    h('div.emergency-grid', {},
      EMERGENCY_TYPES.map((type) =>
        h('button.emergency-tile', {
          type: 'button',
          'aria-pressed': String(draft.type === type.id),
          on: { click: () => actions.selectType(type.id) },
        },
        h('span.emergency-tile__icon', {}, icon(type.icon, { size: 26, stroke: 1.4 })),
        h('span.emergency-tile__label', {}, type.label),
        h('span.emergency-tile__sub', {}, `${type.window} min window`)))),
  );
}

/** Speech, text, photo and location. */
function describeCard(draft, actions) {
  return h(
    'section.card',
    {},
    h('div.card__head', {},
      h('div', {},
        h('div.card__title', {}, 'Describe it'),
        h('div.card__note', {}, 'Bangla, English or a mix. Say it the way you would to a neighbour.'))),

    h('div.stack', {},
      h('button.mic-button', {
        type: 'button',
        dataset: { recording: 'false' },
        on: { click: (event) => actions.toggleDictation(event.currentTarget) },
      },
      h('span.mic-button__pulse'),
      icon('mic', { size: 20 }),
      h('span', {}, 'Hold to speak')),

      h('textarea.textarea#report-text', {
        placeholder: 'Or type what you can see. "Uni pore gechen, sara dicchen na…"',
        value: draft.text,
        on: { input: (event) => actions.setText(event.target.value) },
      }),

      h('div.field', {},
        h('label.field__label', { for: 'scene-select' }, 'Location'),
        h('select.select#scene-select', {
          on: { change: (event) => actions.setScene(event.target.value) },
        }, SCENES.map((scene) =>
          h('option', { value: scene.id, selected: scene.id === draft.scene.id },
            `${scene.label} — ${scene.district}`))),
        h('span.field__hint', {}, 'A real deployment reads GPS directly. Selectable here so the demo is repeatable.')),

      photoField(draft, actions),

      h('div.row', {},
        h('button.btn.btn--primary', {
          type: 'button',
          disabled: draft.busy,
          on: { click: () => actions.analyse() },
        }, draft.busy ? h('span.spinner') : icon('spark', { size: 14 }),
        draft.busy ? 'Analysing' : 'Get help now'),
        draft.classification
          ? h('button.btn.btn--ghost', { type: 'button', on: { click: () => actions.reset() } }, 'Start over')
          : null)),
  );
}

function photoField(draft, actions) {
  const input = h('input', {
    type: 'file',
    accept: 'image/*',
    multiple: true,
    style: { display: 'none' },
    on: { change: (event) => actions.addImages(event.target.files) },
  });

  const zone = h('div.dropzone', {
    role: 'button',
    tabindex: '0',
    on: {
      click: () => input.click(),
      keydown: (event) => { if (event.key === 'Enter' || event.key === ' ') input.click(); },
      dragover: (event) => { event.preventDefault(); zone.dataset.drag = 'true'; },
      dragleave: () => { zone.dataset.drag = 'false'; },
      drop: (event) => {
        event.preventDefault();
        zone.dataset.drag = 'false';
        actions.addImages(event.dataTransfer.files);
      },
    },
  },
  icon('camera', { size: 20 }),
  h('div', {}, 'Add a photo of the scene'),
  h('div', { style: { fontSize: 'var(--t-micro)', marginTop: '2px' } },
    'Optional. The model reports only what is genuinely visible.'));

  return h('div.stack.stack--tight', {},
    zone,
    input,
    draft.images.length
      ? h('div.thumb-row', {}, draft.images.map((image, index) =>
          h('div.thumb', {},
            h('img', { src: image.url, alt: `Scene photo ${index + 1}` }),
            h('button', {
              type: 'button',
              'aria-label': 'Remove photo',
              on: { click: () => actions.removeImage(index) },
            }, '×'))))
      : null);
}

/** The structured classification, with every field carrying its provenance. */
function analysisCard(draft, actions) {
  if (!draft.classification) {
    return h('section.card', {},
      h('div.empty', {},
        icon('spark', { size: 26 }),
        h('h3', {}, 'No assessment yet'),
        h('p', {}, 'Choose what is happening or describe it, then tap "Get help now". ' +
          'The system builds a structured emergency brief that every responder sees.')));
  }

  const result = draft.classification;
  const definition = getType(result.type);

  const row = (label, value, source) => h('div.analysis__row', {},
    h('span.analysis__key', {}, label),
    h('span.analysis__val', { style: { display: 'flex', gap: 'var(--s-2)', alignItems: 'center' } },
      h('span', {}, value),
      source ? provenanceBadge(source) : null));

  return h(
    'section.card',
    {},
    h('div.card__head', {},
      h('div', {},
        h('div.card__title', {}, 'Emergency assessment'),
        h('div.card__note', {}, isConfigured() ? 'Generated by Gemini' : 'Generated offline — no API key set')),
      priorityBadge(result.priority)),

    h('div.analysis', {},
      row('Type', definition.label, 'inferred'),
      row('Priority', `${getPriority(result.priority).id} — ${getPriority(result.priority).label}`, 'inferred'),
      row('Consciousness', result.consciousness || 'unknown', 'reported'),
      row('Breathing', result.breathing || 'unknown', 'reported'),
      row('Patients', String(result.patients || 1), 'reported'),
      result.image_findings ? row('From photo', result.image_findings, 'observed') : null,
      h('div.analysis__row', {},
        h('span.analysis__key', {}, 'Confidence'),
        h('span.confidence-bar', {},
          h('span.meter', {}, h('span.meter__fill', {
            style: {
              width: `${(result.confidence || 0) * 100}%`,
              background: result.confidence > 0.8 ? 'var(--pos)' : result.confidence > 0.6 ? 'var(--warn)' : 'var(--neg)',
            },
          })),
          h('span', {}, fmt.pct(result.confidence || 0))))),

    result.summary
      ? h('div.insight', { style: { marginTop: 'var(--s-4)' } }, h('div', {}, result.summary))
      : null,

    result.observations?.length
      ? h('div.stack.stack--tight', { style: { marginTop: 'var(--s-4)' } },
          h('div.eyebrow', {}, 'Observations'),
          h('ul', { style: { fontSize: 'var(--t-sm)', color: 'var(--text-mid)' } },
            result.observations.map((item) => h('li', { style: { paddingLeft: 'var(--s-4)', position: 'relative' } },
              h('span', { style: { position: 'absolute', left: '0', color: 'var(--text-faint)' } }, '—'), item))))
      : null,

    result.discrepancies?.length
      ? h('div.brief__missing', { style: { marginTop: 'var(--s-4)', borderColor: 'var(--neg)', background: 'var(--neg-soft)' } },
          h('div.eyebrow', { style: { marginBottom: 'var(--s-2)' } }, 'Conflicting information'),
          h('ul', {}, result.discrepancies.map((item) => h('li', {}, item))))
      : null,

    result.missing_information?.length
      ? h('div.brief__missing', { style: { marginTop: 'var(--s-4)' } },
          h('div.eyebrow', { style: { marginBottom: 'var(--s-2)' } }, 'The operator will ask'),
          h('ul', {}, result.missing_information.slice(0, 4).map((item) => h('li', {}, item))))
      : null,

    h('div.row', { style: { marginTop: 'var(--s-5)' } },
      h('button.btn.btn--primary', { type: 'button', on: { click: () => actions.dispatch() } },
        icon('send', { size: 14 }), 'Confirm and dispatch'),
      h('button.btn.btn--ghost', { type: 'button', on: { click: () => actions.speakGuidance() } },
        icon('mic', { size: 14 }), 'Read guidance aloud')),

    h('p.text-dim', { style: { fontSize: 'var(--t-micro)', marginTop: 'var(--s-3)' } },
      'This is a classification, not a diagnosis. A qualified clinician verifies every case before it is acted on.'),
  );
}

/** Immediate, bounded first-aid guidance drawn from the reviewed protocol table. */
function guidanceCard(draft) {
  if (!draft.classification) return null;

  const guidance = firstAidFor(draft.classification.type);

  return h(
    'section.card',
    {},
    h('div.card__head', {},
      h('div', {},
        h('div.card__title', {}, 'What to do right now'),
        h('div.card__note', {}, 'Published first-aid steps. Stay on the line — a doctor is joining.'))),

    h('p', { style: { fontSize: 'var(--t-sm)', fontWeight: '520', marginBottom: 'var(--s-3)' } }, guidance.headline),

    h('ol.stack.stack--tight', { style: { fontSize: 'var(--t-sm)', color: 'var(--text-mid)' } },
      guidance.steps.map((step, index) =>
        h('li', { style: { display: 'flex', gap: 'var(--s-3)' } },
          h('span.mono.text-faint', { style: { fontSize: 'var(--t-xs)' } }, String(index + 1).padStart(2, '0')),
          h('span', {}, step)))),

    h('div.brief__missing', {
      style: { marginTop: 'var(--s-4)', borderColor: 'var(--neg)', background: 'var(--neg-soft)' },
    },
    h('div.eyebrow', { style: { marginBottom: 'var(--s-2)' } }, 'Do not'),
    h('ul', {}, guidance.avoid.map((item) => h('li', {}, item)))),
  );
}

/* ── Classification ───────────────────────────────────────────────────────── */

async function analyseWithGemini(draft) {
  const imageParts = await Promise.all(draft.images.map((image) => fileToPart(image.file)));

  return callGemini({
    parts: buildTriageParts({
      text: draft.text,
      imageParts,
      scene: draft.scene,
      selectedType: draft.type ? getType(draft.type).label : null,
    }),
    system: TRIAGE_SYSTEM,
    schema: TRIAGE_SCHEMA,
    maxOutputTokens: 1200,
  });
}

/**
 * Offline classifier.
 *
 * Keyword matching over the same taxonomy. It exists so the interface is fully
 * demonstrable with no key and no network — and so the difference between it and
 * the model's reading is visible, which is itself a useful thing to show.
 */
function offlineClassification(draft) {
  const text = draft.text.toLowerCase();

  const CUES = {
    cardiac: ['chest', 'buke', 'heart', 'hridro'],
    unconscious: ['unconscious', 'ojnan', 'অজ্ঞান', 'collapse', 'pore gechen', 'sara dicche na', 'not waking'],
    trauma: ['accident', 'dhakka', 'collision', 'crash', 'durghotona', 'hit', 'bus', 'truck'],
    bleeding: ['bleed', 'rokto', 'রক্ত', 'blood'],
    breathing: ['breath', 'nishash', 'শ্বাস', 'asthma', 'choking'],
    stroke: ['stroke', 'face droop', 'slurred', 'beke gache', 'paralysis'],
    obstetric: ['pregnan', 'labour', 'prosob', 'delivery', 'baby'],
    burn: ['burn', 'pure', 'পুড়ে', 'scald', 'ag lege'],
    poisoning: ['poison', 'overdose', 'kitnashok', 'oshudh kheye'],
    fire: ['fire', 'ag legeche', 'আগুন', 'smoke'],
  };

  let type = draft.type || 'other';
  if (!draft.type) {
    for (const [candidate, cues] of Object.entries(CUES)) {
      if (cues.some((cue) => text.includes(cue))) {
        type = candidate;
        break;
      }
    }
  }

  const definition = getType(type);
  const unresponsive = /unconscious|ojnan|অজ্ঞান|sara dicche na|not respond|not waking/.test(text);
  const breathingTrouble = /nishash|শ্বাস|breath|blue|nila/.test(text);

  return {
    type,
    priority: unresponsive || breathingTrouble ? 'P1' : definition.basePriority,
    summary: `${definition.label} reported at ${draft.scene.label}.`,
    reasoning: unresponsive
      ? 'Unresponsive with unconfirmed breathing is treated as P1 until breathing is established.'
      : `Graded from the ${definition.label.toLowerCase()} classification.`,
    confidence: draft.text.trim() ? 0.64 : 0.48,
    language: /[ঀ-৿]/.test(draft.text) ? 'bn' : 'mixed',
    patients: 1,
    consciousness: unresponsive ? 'unresponsive' : 'unknown',
    breathing: breathingTrouble ? 'laboured' : 'unknown',
    observations: [
      draft.type ? `Caller selected "${getType(draft.type).label}"` : 'Type inferred from the description',
      draft.text.trim() ? 'Free-text description provided' : 'No description given',
      draft.images.length ? `${draft.images.length} scene photo(s) attached but not analysed offline` : 'No photo attached',
    ],
    discrepancies: [],
    missing_information: [
      'Is the patient breathing normally?',
      'Do they respond to voice or touch?',
      'Was there a fall or an accident?',
    ],
    image_findings: draft.images.length ? 'Offline mode cannot analyse images — add an API key.' : null,
  };
}
