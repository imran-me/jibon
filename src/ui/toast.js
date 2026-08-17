/**
 * Transient notifications.
 *
 * Deliberately quiet: bottom-right, auto-dismissing, never blocking. Errors get
 * a longer life than confirmations because they usually carry an instruction.
 */

import { h, qs } from '../core/dom.js';

const HOST_ID = 'toasts';
const MAX_VISIBLE = 3;

function host() {
  return qs(`#${HOST_ID}`) || document.body.appendChild(h('div.toasts', { id: HOST_ID }));
}

/**
 * @param {string} message
 * @param {object} [options]
 * @param {'info'|'ok'|'err'} [options.tone]
 * @param {number} [options.duration] ms; 0 keeps it until dismissed
 * @param {{label:string,onClick:Function}} [options.action]
 */
export function toast(message, { tone = 'info', duration, action } = {}) {
  const container = host();
  const life = duration ?? (tone === 'err' ? 7000 : 3800);

  const node = h(
    `div.toast.toast--${tone}`,
    { role: tone === 'err' ? 'alert' : 'status' },
    h('span.toast__dot'),
    h('span.toast__msg', {}, message),
    action
      ? h('button.btn.btn--bare.btn--sm', {
          type: 'button',
          on: { click: () => { action.onClick(); dismiss(node); } },
        }, action.label)
      : null,
    h('button.btn.btn--bare.btn--sm', {
      type: 'button',
      'aria-label': 'Dismiss',
      on: { click: () => dismiss(node) },
    }, '×'),
  );

  container.appendChild(node);

  // Keep the stack short; the oldest goes first.
  while (container.children.length > MAX_VISIBLE) dismiss(container.firstElementChild);

  if (life > 0) setTimeout(() => dismiss(node), life);
  return () => dismiss(node);
}

function dismiss(node) {
  if (!node || node.dataset.leaving === 'true') return;
  node.dataset.leaving = 'true';
  setTimeout(() => node.remove(), 200);
}

export const toastOk = (message, options) => toast(message, { ...options, tone: 'ok' });
export const toastError = (message, options) => toast(message, { ...options, tone: 'err' });
