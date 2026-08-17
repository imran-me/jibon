/**
 * Gemini API client.
 *
 * Calls the Generative Language REST endpoint directly from the browser with a
 * user-supplied key. That is a deliberate architecture for this build:
 *
 *   - the site is a static bundle on GitHub Pages, so there is no server to
 *     proxy through and no place a shared secret could safely live;
 *   - each operator brings their own key from Google AI Studio, kept in
 *     localStorage on their own machine and never transmitted anywhere except
 *     to Google.
 *
 * For a production deployment the same module would point at a thin backend
 * proxy; `callGemini` is the single seam where that swap happens.
 */

import { getState } from '../core/store.js';

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

/** Models offered in Settings. Flash is the default: fast enough to demo live. */
export const MODELS = [
  { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', note: 'Fast, cheap, good at structured extraction' },
  { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', note: 'Strongest reasoning, slower' },
  { id: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite', note: 'Lowest latency, high volume' },
];

export class GeminiError extends Error {
  constructor(message, { status = 0, retryable = false } = {}) {
    super(message);
    this.name = 'GeminiError';
    this.status = status;
    this.retryable = retryable;
  }
}

export const isConfigured = () => Boolean(getState().settings.geminiKey.trim());

function requireKey() {
  const key = getState().settings.geminiKey.trim();
  if (!key) {
    throw new GeminiError('No Gemini API key set. Add one in Settings to enable live analysis.');
  }
  return key;
}

/** Translate an HTTP failure into something a user can act on. */
async function toError(response) {
  let detail = '';
  try {
    const body = await response.json();
    detail = body?.error?.message || '';
  } catch {
    /* Non-JSON error bodies are not worth surfacing verbatim. */
  }

  const messages = {
    400: detail || 'The request was rejected. Check the model name in Settings.',
    401: 'That API key was not accepted. Generate a fresh one in Google AI Studio.',
    403: 'This key cannot reach the Gemini API. Check that the Generative Language API is enabled.',
    404: 'That model is not available to this key. Try Gemini 2.5 Flash.',
    429: 'Rate limit reached. Waiting a moment and retrying usually clears it.',
    500: 'Gemini had an internal error.',
    503: 'Gemini is temporarily overloaded.',
  };

  return new GeminiError(messages[response.status] || detail || `Request failed (${response.status}).`, {
    status: response.status,
    retryable: [429, 500, 502, 503, 504].includes(response.status),
  });
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * One non-streaming generation.
 *
 * @param {object}   options
 * @param {Array}    options.parts        Content parts (text and/or inlineData).
 * @param {string}   [options.system]     System instruction.
 * @param {object}   [options.schema]     JSON schema; forces structured output.
 * @param {number}   [options.temperature]
 * @param {AbortSignal} [options.signal]
 * @returns {Promise<string|object>} Parsed object when a schema is supplied, else text.
 */
export async function callGemini({
  parts,
  system,
  schema,
  temperature = 0.4,
  maxOutputTokens = 2048,
  signal,
  retries = 2,
} = {}) {
  const key = requireKey();
  const model = getState().settings.model || 'gemini-2.5-flash';

  const body = {
    contents: [{ role: 'user', parts }],
    generationConfig: { temperature, maxOutputTokens },
  };

  if (system) body.systemInstruction = { parts: [{ text: system }] };

  if (schema) {
    body.generationConfig.responseMimeType = 'application/json';
    body.generationConfig.responseSchema = schema;
    // Structured extraction should be near-deterministic.
    body.generationConfig.temperature = Math.min(temperature, 0.2);
  }

  let lastError;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(`${ENDPOINT}/${model}:generateContent?key=${encodeURIComponent(key)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal,
      });

      if (!response.ok) throw await toError(response);

      const payload = await response.json();
      const text = extractText(payload);

      if (!text) {
        const reason = payload?.candidates?.[0]?.finishReason;
        throw new GeminiError(
          reason === 'SAFETY'
            ? 'The response was blocked by a safety filter. Try rewording the report.'
            : 'Gemini returned an empty response.',
        );
      }

      return schema ? parseJson(text) : text;
    } catch (error) {
      if (error?.name === 'AbortError') throw error;
      lastError = error;
      if (!(error instanceof GeminiError) || !error.retryable || attempt === retries) break;
      await wait(600 * 2 ** attempt); // 600ms, then 1.2s
    }
  }

  throw lastError;
}

/**
 * Streaming generation. Yields incremental text chunks so the assistant can
 * render as the model thinks rather than after it finishes.
 *
 * @returns {AsyncGenerator<string>}
 */
export async function* streamGemini({
  parts,
  system,
  history = [],
  temperature = 0.6,
  maxOutputTokens = 2048,
  signal,
} = {}) {
  const key = requireKey();
  const model = getState().settings.model || 'gemini-2.5-flash';

  const body = {
    contents: [...history, { role: 'user', parts }],
    generationConfig: { temperature, maxOutputTokens },
  };

  if (system) body.systemInstruction = { parts: [{ text: system }] };

  const response = await fetch(
    `${ENDPOINT}/${model}:streamGenerateContent?alt=sse&key=${encodeURIComponent(key)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    },
  );

  if (!response.ok) throw await toError(response);
  if (!response.body) throw new GeminiError('Streaming is not supported in this browser.');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    // SSE frames are separated by a blank line; keep any partial tail buffered.
    const frames = buffer.split('\n\n');
    buffer = frames.pop() ?? '';

    for (const frame of frames) {
      const line = frame.split('\n').find((l) => l.startsWith('data:'));
      if (!line) continue;

      const json = line.slice(5).trim();
      if (!json || json === '[DONE]') continue;

      try {
        const chunk = extractText(JSON.parse(json));
        if (chunk) yield chunk;
      } catch {
        /* A truncated frame will be completed by the next read. */
      }
    }
  }
}

function extractText(payload) {
  return (payload?.candidates?.[0]?.content?.parts || [])
    .map((part) => part.text || '')
    .join('')
    .trim();
}

/**
 * Parse structured output defensively. Even with a response schema, a model can
 * wrap JSON in a fence when it decides to be helpful.
 */
function parseJson(text) {
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start > -1 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1));
      } catch {
        /* fall through to the thrown error below */
      }
    }
    throw new GeminiError('Gemini returned malformed JSON.');
  }
}

/** Turn a File into the inlineData part shape the API expects. */
export function fileToPart(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new GeminiError('Could not read that file.'));
    reader.onload = () => {
      const result = String(reader.result);
      resolve({ inlineData: { mimeType: file.type || 'image/jpeg', data: result.split(',')[1] } });
    };
    reader.readAsDataURL(file);
  });
}

/** Cheap connectivity check used by Settings' "Test key" button. */
export async function testKey(signal) {
  const started = performance.now();
  await callGemini({
    parts: [{ text: 'Reply with the single word: ready' }],
    maxOutputTokens: 16,
    temperature: 0,
    retries: 0,
    signal,
  });
  return Math.round(performance.now() - started);
}
