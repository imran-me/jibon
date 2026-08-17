/**
 * Centred modal dialog.
 *
 * Shares the scrim pattern with the drawer but is created per call, since
 * modals here are short-lived (confirmations, the command palette) and each
 * wants its own DOM.
 */

import { h, qs, trapFocus } from '../core/dom.js';
import { icon } from '../core/dom.js';

const CLOSE_PATH = 'M18 6 6 18M6 6l12 12';

let active = null;

/**
 * @param {object} options
 * @param {string} [options.title]
 * @param {Node|Node[]} options.body
 * @param {Node[]} [options.footer]
 * @param {string} [options.variant] Extra class, e.g. "palette".
 * @param {Function} [options.onClose]
 * @returns {{ close: Function, node: HTMLElement }}
 */
export function openModal({ title, body, footer, variant, onClose, labelledBy } = {}) {
  closeModal();

  const scrim = qs('#modal-scrim');
  const lastFocused = document.activeElement;

  const node = h(
    `div.modal${variant ? `.modal--${variant}` : ''}`,
    {
      role: 'dialog',
      'aria-modal': 'true',
      'aria-label': labelledBy ? null : title || 'Dialog',
      'aria-labelledby': labelledBy || null,
    },
    title
      ? h(
          'header.drawer__head',
          {},
          h('h2.drawer__title', {}, title),
          h('button.btn.btn--ghost.icon-btn', {
            type: 'button',
            'aria-label': 'Close dialog',
            on: { click: () => closeModal() },
          }, icon(CLOSE_PATH, { size: 15 })),
        )
      : null,
    h('div.drawer__body', {}, [].concat(body)),
    footer?.length ? h('footer.drawer__foot', {}, footer) : null,
  );

  document.body.appendChild(node);
  if (scrim) scrim.hidden = false;

  requestAnimationFrame(() => {
    node.dataset.open = 'true';
    if (scrim) scrim.dataset.open = 'true';
  });

  document.body.style.overflow = 'hidden';

  const release = trapFocus(node);
  const onScrimClick = () => closeModal();
  const onKeydown = (event) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      closeModal();
    }
  };

  scrim?.addEventListener('click', onScrimClick);
  document.addEventListener('keydown', onKeydown);

  active = {
    node,
    teardown: () => {
      release();
      scrim?.removeEventListener('click', onScrimClick);
      document.removeEventListener('keydown', onKeydown);
      onClose?.();
      if (lastFocused instanceof HTMLElement) lastFocused.focus();
    },
  };

  // Focus the first interactive element, which for the palette is the input.
  node.querySelector('input, textarea, button, [tabindex]')?.focus();

  return { node, close: closeModal };
}

export function closeModal() {
  if (!active) return;

  const { node, teardown } = active;
  active = null;

  const scrim = qs('#modal-scrim');
  node.dataset.open = 'false';
  if (scrim) scrim.dataset.open = 'false';
  document.body.style.overflow = '';

  teardown();

  setTimeout(() => {
    node.remove();
    if (scrim && !document.querySelector('.modal')) scrim.hidden = true;
  }, 200);
}

export const isModalOpen = () => Boolean(active);

/**
 * Yes/no confirmation. Resolves true when the user confirms.
 * @returns {Promise<boolean>}
 */
export function confirmDialog({ title, message, confirmLabel = 'Confirm', danger = false }) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
      closeModal();
    };

    openModal({
      title,
      body: h('p', { style: { color: 'var(--text-mid)', lineHeight: '1.65' } }, message),
      footer: [
        h('button.btn.btn--ghost', { type: 'button', on: { click: () => finish(false) } }, 'Cancel'),
        h(
          `button.btn.${danger ? 'btn--danger' : 'btn--primary'}`,
          { type: 'button', on: { click: () => finish(true) } },
          confirmLabel,
        ),
      ],
      onClose: () => finish(false),
    });
  });
}
