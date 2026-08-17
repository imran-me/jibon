/**
 * Settings — keys, consent, and data controls.
 *
 * The privacy section is not decoration. A platform that listens to an emergency
 * and looks through a camera has to state plainly what it captures, where it
 * goes, and how to revoke it, and the controls have to actually do something.
 */

import { h } from '../../core/dom.js';
import { icon } from '../../ui/icons.js';
import { MODELS, testKey, isConfigured } from '../../services/gemini.js';
import { VOICES, hasElevenLabs, speak } from '../../services/voice.js';
import {
  getState, updateSettings, resetSettings, clearLiveIncidents, subscribe,
} from '../../core/store.js';
import { clearAll, storageAvailable } from '../../core/storage.js';
import { confirmDialog } from '../../ui/modal.js';
import { toast, toastOk, toastError } from '../../ui/toast.js';
import { PROFILE } from '../../domain/taxonomy.js';

export const meta = {
  path: '/settings',
  title: 'Settings',
  subtitle: 'Keys, consent and data controls',
  icon: 'gear',
};

export function render({ mount }) {
  const root = h('div.stack.stack--loose');
  mount.appendChild(root);

  const draw = () => root.replaceChildren(...sections());
  draw();

  const unsubscribe = subscribe((_, keys) => {
    if (keys.includes('settings')) draw();
  });

  return unsubscribe;
}

function sections() {
  const { settings } = getState();

  return [
    apiCard(settings),
    voiceCard(settings),
    privacyCard(settings),
    dataCard(),
    aboutCard(),
  ];
}

/* ── API keys ─────────────────────────────────────────────────────────────── */

function apiCard(settings) {
  const input = h('input.input', {
    type: 'password',
    value: settings.geminiKey,
    placeholder: 'AIza…',
    autocomplete: 'off',
    spellcheck: 'false',
    'aria-label': 'Gemini API key',
  });

  const test = h('button.btn.btn--ghost', { type: 'button' }, 'Test');

  test.addEventListener('click', async () => {
    updateSettings({ geminiKey: input.value.trim() });
    if (!input.value.trim()) {
      toastError('Enter a key first.');
      return;
    }

    test.disabled = true;
    test.replaceChildren(h('span.spinner'), 'Testing');

    try {
      const ms = await testKey();
      toastOk(`Key works — responded in ${ms} ms.`);
    } catch (error) {
      toastError(error.message || 'The key was rejected.');
    } finally {
      test.disabled = false;
      test.replaceChildren('Test');
    }
  });

  return h('section.card', {},
    h('div.card__head', {},
      h('div', {},
        h('div.card__title', {}, 'Gemini API'),
        h('div.card__note', {},
          'Get a free key from Google AI Studio. It is stored only in this browser\'s local storage ' +
          'and is sent directly to Google — it never reaches any server of ours, because there isn\'t one.')),
      h('span.badge', isConfigured() ? { class: 'badge badge--pos' } : {}, isConfigured() ? 'Connected' : 'Not set')),

    h('div.setting', {},
      h('div.setting__info', {},
        h('h3', {}, 'API key'),
        h('p', {}, 'Required for live classification, explanations and the assistant. ' +
          'Everything else in the console works without it.')),
      h('div.setting__control', {},
        h('div.key-row', {},
          input,
          test,
          h('button.btn.btn--primary', {
            type: 'button',
            on: {
              click: () => {
                updateSettings({ geminiKey: input.value.trim() });
                toastOk('Key saved.');
              },
            },
          }, 'Save')),
        h('a.field__hint', {
          href: 'https://aistudio.google.com/apikey',
          target: '_blank',
          rel: 'noopener noreferrer',
          style: { color: 'var(--accent)' },
        }, 'Get a key from Google AI Studio →'))),

    h('div.setting', {},
      h('div.setting__info', {},
        h('h3', {}, 'Model'),
        h('p', {}, 'Flash is the default: fast enough to classify a live call without the caller noticing.')),
      h('div.setting__control', {},
        h('select.select', {
          on: { change: (event) => { updateSettings({ model: event.target.value }); toastOk('Model updated.'); } },
        }, MODELS.map((model) =>
          h('option', { value: model.id, selected: model.id === settings.model }, `${model.label} — ${model.note}`))))),
  );
}

/* ── Voice ────────────────────────────────────────────────────────────────── */

function voiceCard(settings) {
  const input = h('input.input', {
    type: 'password',
    value: settings.elevenKey,
    placeholder: 'sk_…',
    autocomplete: 'off',
    'aria-label': 'ElevenLabs API key',
  });

  return h('section.card', {},
    h('div.card__head', {},
      h('div', {},
        h('div.card__title', {}, 'Voice output'),
        h('div.card__note', {},
          'ElevenLabs is used for spoken briefings and read-aloud guidance. ' +
          'Without a key the browser\'s built-in speech is used instead — lower fidelity, still functional.')),
      h('span.badge', hasElevenLabs() ? { class: 'badge badge--pos' } : {}, hasElevenLabs() ? 'ElevenLabs' : 'Browser speech')),

    h('div.setting', {},
      h('div.setting__info', {},
        h('h3', {}, 'ElevenLabs API key'),
        h('p', {}, 'Optional. Multilingual model, so Bangla guidance is spoken properly.')),
      h('div.setting__control', {},
        h('div.key-row', {},
          input,
          h('button.btn.btn--primary', {
            type: 'button',
            on: {
              click: () => {
                updateSettings({ elevenKey: input.value.trim() });
                toastOk('Voice key saved.');
              },
            },
          }, 'Save')))),

    h('div.setting', {},
      h('div.setting__info', {},
        h('h3', {}, 'Voice'),
        h('p', {}, 'Used for briefings read to an ambulance crew.')),
      h('div.setting__control', {},
        h('select.select', {
          on: { change: (event) => updateSettings({ voiceId: event.target.value }) },
        }, VOICES.map((voice) =>
          h('option', { value: voice.id, selected: voice.id === settings.voiceId }, `${voice.label} — ${voice.note}`))),
        h('button.btn.btn--ghost', {
          type: 'button',
          on: {
            click: () => speak(
              `This is a ${PROFILE.name} briefing test. Priority one, unconscious person, Kuakata beach road, one patient.`,
            ).catch(() => toastError('Playback failed.')),
          },
        }, icon('mic', { size: 13 }), 'Test voice'))),
  );
}

/* ── Privacy and consent ──────────────────────────────────────────────────── */

function privacyCard(settings) {
  const toggle = (key, label, description) =>
    h('div.setting', {},
      h('div.setting__info', {}, h('h3', {}, label), h('p', {}, description)),
      h('div.setting__control', { style: { alignItems: 'flex-start' } },
        h('button.switch', {
          type: 'button',
          role: 'switch',
          'aria-checked': String(Boolean(settings[key])),
          'aria-label': label,
          on: {
            click: () => {
              updateSettings({ [key]: !settings[key] });
              toast(`${label} ${!settings[key] ? 'enabled' : 'revoked'}.`);
            },
          },
        })));

  return h('section.card', {},
    h('div.card__head', {},
      h('div', {},
        h('div.card__title', {}, 'Privacy and consent'),
        h('div.card__note', {},
          'Emergency medical information is among the most sensitive data there is. ' +
          'These controls are real — revoking one stops the capability immediately.'))),

    toggle('consentMic', 'Microphone', 'Speech is captured only while the record control is held, and is used to classify the emergency. Nothing is recorded to disk.'),
    toggle('consentCamera', 'Camera', 'Photographs are sent to the model for visual assessment and are held in memory for the session only.'),
    toggle('redactPII', 'Mask reporter identity', 'Caller phone numbers are partially masked everywhere they appear in the console.'),

    h('div.insight', { style: { marginTop: 'var(--s-4)' } },
      h('div', {},
        h('strong', {}, 'What this prototype does not do. '),
        'It is not connected to 999, to any ambulance dispatch system, or to any hospital record. ' +
        'No data leaves this browser except the text and images you explicitly send to Gemini for ' +
        'classification. A production deployment would require role-based access, an audit log per case, ' +
        'a data retention schedule, and clinical governance sign-off on every protocol in the response tables.')),
  );
}

/* ── Data ─────────────────────────────────────────────────────────────────── */

function dataCard() {
  return h('section.card', {},
    h('div.card__head', {},
      h('div', {},
        h('div.card__title', {}, 'Data'),
        h('div.card__note', {},
          'The case history is generated locally from a fixed seed, so every reload and every machine ' +
          'shows identical figures. Nothing is fetched.'))),

    h('div.setting', {},
      h('div.setting__info', {},
        h('h3', {}, 'Clear cases raised this session'),
        h('p', {}, 'Removes reports filed through the citizen screen and any simulated scenarios, leaving the seeded history.')),
      h('div.setting__control', {},
        h('button.btn.btn--ghost', {
          type: 'button',
          on: {
            click: async () => {
              if (await confirmDialog({
                title: 'Clear session cases?',
                message: 'Cases you raised or simulated will be removed. The seeded history is untouched.',
                confirmLabel: 'Clear',
                danger: true,
              })) {
                clearLiveIncidents();
                toastOk('Session cases cleared. Reload to see the change.');
              }
            },
          },
        }, 'Clear'))),

    h('div.setting', {},
      h('div.setting__info', {},
        h('h3', {}, 'Reset everything'),
        h('p', {}, 'Removes API keys, consent settings and all locally stored cases from this browser.')),
      h('div.setting__control', {},
        h('button.btn.btn--danger', {
          type: 'button',
          on: {
            click: async () => {
              if (await confirmDialog({
                title: 'Reset all local data?',
                message: 'Your API keys, consent choices and session cases will be deleted from this browser. This cannot be undone.',
                confirmLabel: 'Reset everything',
                danger: true,
              })) {
                clearAll();
                resetSettings();
                toastOk('All local data cleared.');
              }
            },
          },
        }, 'Reset'))),

    storageAvailable()
      ? null
      : h('p', { style: { color: 'var(--warn)', fontSize: 'var(--t-xs)' } },
          'Local storage is unavailable in this browser, so settings will not persist across reloads.'),
  );
}

function aboutCard() {
  return h('section.card', {},
    h('div.card__head', {}, h('div', {},
      h('div.card__title', {}, `About ${PROFILE.name}`),
      h('div.card__note', {}, PROFILE.tagline))),

    h('p', { style: { fontSize: 'var(--t-sm)', color: 'var(--text-mid)', lineHeight: '1.7' } },
      PROFILE.mission),

    h('p', { style: { fontSize: 'var(--t-sm)', color: 'var(--text)', marginTop: 'var(--s-4)', fontWeight: '500' } },
      PROFILE.statement),

    h('div.row.row--wrap', { style: { marginTop: 'var(--s-4)' } },
      h('span.chip', {}, 'No build step'),
      h('span.chip', {}, 'No dependencies'),
      h('span.chip', {}, 'Static hosting'),
      h('span.chip', {}, `Emergency number ${PROFILE.emergencyNumber}`)));
}
