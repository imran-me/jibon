/**
 * Operations assistant.
 *
 * A coordinator asking questions of the live case data in plain language. The
 * model is handed a computed evidence packet on every turn rather than raw
 * records — it reasons over statistics that were calculated deterministically,
 * which is what stops it inventing totals.
 */

import { h } from '../../core/dom.js';
import { icon } from '../../ui/icons.js';
import * as selectors from '../../domain/selectors.js';
import * as analytics from '../../domain/analytics.js';
import { getState } from '../../core/store.js';
import { streamGemini, isConfigured } from '../../services/gemini.js';
import { ASSISTANT_SYSTEM, buildAssistantParts, SUGGESTED_QUESTIONS } from '../../services/prompts.js';
import { speak, stop as stopSpeech, hasElevenLabs } from '../../services/voice.js';
import { toastError } from '../../ui/toast.js';
import { go } from '../../core/router.js';
import * as fmt from '../../core/format.js';

export const meta = {
  path: '/assistant',
  title: 'Operations Assistant',
  subtitle: 'Ask the live case data',
  icon: 'spark',
};

export function render({ mount }) {
  /** Gemini's multi-turn history format, kept so follow-up questions have context. */
  const history = [];
  let controller = null;

  const log = h('div.chat__log');
  const input = h('textarea', {
    placeholder: isConfigured()
      ? 'Ask about response times, pathways, hospitals, or ask for a draft message…'
      : 'Add a Gemini API key in Settings to enable the assistant.',
    rows: 1,
    'aria-label': 'Message',
    on: {
      input: (event) => {
        event.target.style.height = 'auto';
        event.target.style.height = `${Math.min(140, event.target.scrollHeight)}px`;
      },
      keydown: (event) => {
        if (event.key === 'Enter' && !event.shiftKey) {
          event.preventDefault();
          submit();
        }
      },
    },
  });

  const sendButton = h('button.btn.btn--primary', {
    type: 'button',
    'aria-label': 'Send',
    on: { click: () => submit() },
  }, icon('send', { size: 14 }));

  const chat = h('div.chat', {},
    log,
    h('div.chat__composer', {}, input, sendButton));

  const root = h('div.stack', {},
    introCard(),
    h('div.suggestions', {}, SUGGESTED_QUESTIONS.map((question) =>
      h('button.chip', { type: 'button', on: { click: () => submit(question) } }, question))),
    chat);

  mount.appendChild(root);
  greet(log);

  async function submit(preset) {
    const question = (preset ?? input.value).trim();
    if (!question) return;

    if (!isConfigured()) {
      toastError('Add a Gemini API key in Settings to use the assistant.');
      go('/settings');
      return;
    }

    input.value = '';
    input.style.height = 'auto';
    appendMessage(log, 'user', question);

    const bubble = appendMessage(log, 'model', '');
    const body = bubble.querySelector('.msg__body');
    body.appendChild(h('span.spinner'));

    controller?.abort();
    controller = new AbortController();

    let answer = '';

    try {
      const stream = streamGemini({
        parts: buildAssistantParts(selectors.currentEvidence(), question),
        system: ASSISTANT_SYSTEM,
        history,
        temperature: 0.55,
        maxOutputTokens: 1400,
        signal: controller.signal,
      });

      for await (const chunk of stream) {
        answer += chunk;
        renderMarkdown(body, answer);
        log.scrollTop = log.scrollHeight;
      }

      if (!answer) {
        body.replaceChildren(h('p.text-dim', {}, 'No answer was returned. Try rephrasing.'));
        return;
      }

      history.push({ role: 'user', parts: [{ text: question }] });
      history.push({ role: 'model', parts: [{ text: answer }] });
      // Keep the window short — the evidence packet carries the state, not the transcript.
      if (history.length > 8) history.splice(0, history.length - 8);

      body.appendChild(replayRow(answer));
    } catch (error) {
      if (error?.name === 'AbortError') return;
      body.replaceChildren(h('p', { style: { color: 'var(--neg)' } }, error.message || 'The request failed.'));
    } finally {
      log.scrollTop = log.scrollHeight;
    }
  }

  return () => {
    controller?.abort();
    stopSpeech();
  };
}

function introCard() {
  const evidence = selectors.currentEvidence();

  return h('section.card', {},
    h('div.card__head', {},
      h('div', {},
        h('div.card__title', {}, 'Grounded on the live case data'),
        h('div.card__note', {},
          'Every answer is computed from the current period, not recalled from training. ' +
          'The model receives pre-calculated statistics, so it cannot invent a total.')),
      h('span.badge', {}, isConfigured() ? 'Gemini connected' : 'No API key')),

    h('div.stats', {},
      h('div.stat', {},
        h('span.stat__label', {}, 'Cases in packet'),
        h('span.stat__value', {}, fmt.num(evidence.totals.incidents))),
      h('div.stat', {},
        h('span.stat__label', {}, 'Active'),
        h('span.stat__value', {}, fmt.num(evidence.totals.active))),
      h('div.stat', {},
        h('span.stat__label', {}, 'Window'),
        h('span.stat__value', {}, `${evidence.window_days}d`)),
      h('div.stat', {},
        h('span.stat__label', {}, 'Voice'),
        h('span.stat__value', {}, hasElevenLabs() ? 'ElevenLabs' : 'Browser'))));
}

function greet(log) {
  const comparison = selectors.currentComparison();

  appendMessage(log, 'model',
    `I have the current period loaded — ${fmt.num(selectors.filteredIncidents().length)} cases. ` +
    `Coordinated dispatch is reaching an ambulance assignment in ${fmt.minutes(comparison.jibon.decision)} ` +
    `against ${fmt.minutes(comparison.baseline.decision)} conventionally. Ask me anything about the board.`);
}

function appendMessage(log, role, text) {
  const bubble = h(`div.msg.msg--${role}`, {},
    h('div.msg__avatar', {}, role === 'user' ? 'You' : 'AI'),
    h('div.msg__body'));

  log.appendChild(bubble);
  if (text) renderMarkdown(bubble.querySelector('.msg__body'), text);
  log.scrollTop = log.scrollHeight;
  return bubble;
}

/**
 * Minimal markdown: paragraphs, bullets and bold.
 *
 * Built as DOM rather than innerHTML — model output is untrusted text and must
 * never be parsed as markup.
 */
function renderMarkdown(target, text) {
  target.replaceChildren();

  for (const block of text.split(/\n{2,}/)) {
    const lines = block.split('\n').filter(Boolean);
    const isList = lines.every((line) => /^\s*[-*•]\s+/.test(line));

    if (isList && lines.length) {
      target.appendChild(h('ul', {}, lines.map((line) =>
        h('li', {}, ...inline(line.replace(/^\s*[-*•]\s+/, ''))))));
    } else if (lines.length) {
      target.appendChild(h('p', {}, ...inline(lines.join(' '))));
    }
  }
}

/** Split on **bold** and return text nodes plus <strong> elements. */
function inline(text) {
  return text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean).map((part) =>
    part.startsWith('**') && part.endsWith('**')
      ? h('strong', {}, part.slice(2, -2))
      : document.createTextNode(part));
}

/** Read the answer aloud — the ElevenLabs path, with a browser fallback. */
function replayRow(text) {
  const button = h('button.btn.btn--bare.btn--sm', { type: 'button' },
    icon('mic', { size: 12 }),
    hasElevenLabs() ? 'Read aloud' : 'Read aloud (browser)');

  button.addEventListener('click', async () => {
    button.disabled = true;
    try {
      await speak(text);
    } catch {
      toastError('Could not play the audio.');
    } finally {
      button.disabled = false;
    }
  });

  return h('div.msg__cites', {}, button);
}
