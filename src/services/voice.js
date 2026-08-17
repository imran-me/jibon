/**
 * Voice I/O — the ElevenLabs side track.
 *
 * Two capabilities, each with a graceful fallback so the feature never simply
 * disappears:
 *
 *   speak()   ElevenLabs text-to-speech when a key is present, otherwise the
 *             browser's built-in SpeechSynthesis. Lower fidelity, still usable.
 *   listen()  Web Speech recognition for hotline-style dictation, with Bangla
 *             locale support where the browser offers it.
 */

import { getState } from '../core/store.js';

const TTS_ENDPOINT = 'https://api.elevenlabs.io/v1/text-to-speech';

/** A small, deliberately curated voice list — the full API list is noise in a demo. */
export const VOICES = [
  { id: '21m00Tcm4TlvDq8ikWAM', label: 'Rachel', note: 'Calm, neutral narration' },
  { id: 'AZnzlk1XvdvUeBnXmlld', label: 'Domi', note: 'Crisp, urgent briefings' },
  { id: 'EXAVITQu4vr4xnSDxMaL', label: 'Sarah', note: 'Warm, citizen-facing' },
  { id: 'onwK4e9ZLuTAKqWW03F9', label: 'Daniel', note: 'Authoritative, official' },
];

export class VoiceError extends Error {
  constructor(message) {
    super(message);
    this.name = 'VoiceError';
  }
}

let currentAudio = null;

/** True when ElevenLabs is configured; the UI uses this to label the fallback. */
export const hasElevenLabs = () => Boolean(getState().settings.elevenKey.trim());

/**
 * Speak `text`. Resolves when playback finishes.
 * @returns {Promise<{engine: 'elevenlabs'|'browser'}>}
 */
export async function speak(text, { signal } = {}) {
  stop();

  const clean = String(text || '').replace(/[*_#`>]/g, '').trim();
  if (!clean) return { engine: 'browser' };

  if (hasElevenLabs()) {
    try {
      await speakWithElevenLabs(clean, signal);
      return { engine: 'elevenlabs' };
    } catch (error) {
      // A failed key should not lose the user their audio; drop to the browser.
      if (error?.name === 'AbortError') throw error;
      console.warn('[voice] ElevenLabs failed, falling back to browser speech', error);
    }
  }

  await speakWithBrowser(clean);
  return { engine: 'browser' };
}

async function speakWithElevenLabs(text, signal) {
  const { elevenKey, voiceId } = getState().settings;

  const response = await fetch(`${TTS_ENDPOINT}/${voiceId}`, {
    method: 'POST',
    headers: {
      'xi-api-key': elevenKey.trim(),
      'Content-Type': 'application/json',
      Accept: 'audio/mpeg',
    },
    body: JSON.stringify({
      text,
      model_id: 'eleven_multilingual_v2', // handles Bangla and code-switched text
      voice_settings: { stability: 0.45, similarity_boost: 0.75, style: 0.1, use_speaker_boost: true },
    }),
    signal,
  });

  if (!response.ok) {
    const detail = response.status === 401
      ? 'ElevenLabs rejected that key.'
      : `ElevenLabs request failed (${response.status}).`;
    throw new VoiceError(detail);
  }

  const url = URL.createObjectURL(await response.blob());

  await new Promise((resolve, reject) => {
    const audio = new Audio(url);
    currentAudio = audio;

    const cleanup = () => {
      URL.revokeObjectURL(url);
      if (currentAudio === audio) currentAudio = null;
    };

    audio.onended = () => { cleanup(); resolve(); };
    audio.onerror = () => { cleanup(); reject(new VoiceError('Could not play the generated audio.')); };
    audio.play().catch((error) => { cleanup(); reject(error); });
  });
}

function speakWithBrowser(text) {
  return new Promise((resolve) => {
    if (!('speechSynthesis' in window)) {
      resolve();
      return;
    }

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.02;
    utterance.pitch = 1;
    utterance.onend = resolve;
    utterance.onerror = resolve;

    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  });
}

/** Halt any in-flight playback from either engine. */
export function stop() {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
}

/* ── Dictation ────────────────────────────────────────────────────────────── */

const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;

export const canListen = () => Boolean(Recognition);

/**
 * Start dictation. Calls `onResult` with `{ transcript, isFinal }` as speech
 * arrives, and returns a handle with `stop()`.
 *
 * @param {object} options
 * @param {string} [options.lang] BCP-47 tag; 'bn-BD' for Bangla.
 */
export function listen({ lang = 'en-US', onResult, onError, onEnd } = {}) {
  if (!Recognition) throw new VoiceError('This browser does not support speech input. Chrome or Edge does.');

  const recognition = new Recognition();
  recognition.lang = lang;
  recognition.continuous = true;
  recognition.interimResults = true;

  recognition.onresult = (event) => {
    let interim = '';
    let final = '';

    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      const result = event.results[i];
      if (result.isFinal) final += result[0].transcript;
      else interim += result[0].transcript;
    }

    if (final) onResult?.({ transcript: final, isFinal: true });
    else if (interim) onResult?.({ transcript: interim, isFinal: false });
  };

  recognition.onerror = (event) => {
    const messages = {
      'not-allowed': 'Microphone permission was denied.',
      'no-speech': 'No speech detected. Try again closer to the microphone.',
      network: 'Speech recognition needs a network connection.',
    };
    onError?.(new VoiceError(messages[event.error] || `Speech input failed (${event.error}).`));
  };

  recognition.onend = () => onEnd?.();
  recognition.start();

  return { stop: () => recognition.stop() };
}
