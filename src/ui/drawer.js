/**
 * The side drawer.
 *
 * One shared instance for the whole app, because only one drill-down should
 * ever be open. Content is supplied per call; the drawer owns the shell,
 * scrim, focus handling and Escape behaviour.
 */

import { h, qs, render, trapFocus } from '../core/dom.js';
import { icon } from '../core/dom.js';
import { hideTip } from './charts.js';

const CLOSE_PATH = 'M18 6 6 18M6 6l12 12';

let releaseTrap = null;
let lastFocused = null;
let onCloseHook = null;

const el = () => qs('#drawer');
const scrim = () => qs('#drawer-scrim');

/**
 * Open the drawer.
 *
 * @param {object} options
 * @param {string} options.title
 * @param {string} [options.eyebrow]  Small caps line above the title.
 * @param {string} [options.subtitle]
 * @param {Node|Node[]} options.body
 * @param {Node[]} [options.footer]
 * @param {Function} [options.onClose]
 */
export function openDrawer({ title, eyebrow, subtitle, body, footer, onClose }) {
  const drawer = el();
  const backdrop = scrim();
  if (!drawer || !backdrop) return;

  lastFocused = document.activeElement;
  onCloseHook = onClose || null;

  render(
    drawer,
    h(
      'header.drawer__head',
      {},
      h(
        'div',
        {},
        eyebrow ? h('div.drawer__eyebrow', {}, eyebrow) : null,
        h('h2.drawer__title#drawer-title', {}, title),
        subtitle ? h('p.drawer__sub', {}, subtitle) : null,
      ),
      h('button.btn.btn--ghost.icon-btn', {
        type: 'button',
        'aria-label': 'Close panel',
        on: { click: closeDrawer },
      }, icon(CLOSE_PATH, { size: 15 })),
    ),
    h('div.drawer__body', {}, [].concat(body)),
    footer?.length ? h('footer.drawer__foot', {}, footer) : null,
  );

  drawer.hidden = false;
  backdrop.hidden = false;

  // Force a frame so the transform transition actually runs.
  requestAnimationFrame(() => {
    drawer.dataset.open = 'true';
    backdrop.dataset.open = 'true';
  });

  document.body.style.overflow = 'hidden';
  releaseTrap = trapFocus(drawer);
  backdrop.addEventListener('click', closeDrawer, { once: true });
  document.addEventListener('keydown', onKeydown);

  // Focus the panel itself rather than the close button — less jarring, and
  // screen readers announce the title.
  drawer.querySelector('.drawer__title')?.setAttribute('tabindex', '-1');
  drawer.querySelector('.drawer__title')?.focus();
}

export function closeDrawer() {
  const drawer = el();
  const backdrop = scrim();
  if (!drawer || drawer.hidden) return;

  drawer.dataset.open = 'false';
  backdrop.dataset.open = 'false';
  hideTip();

  releaseTrap?.();
  releaseTrap = null;
  document.removeEventListener('keydown', onKeydown);
  document.body.style.overflow = '';

  setTimeout(() => {
    drawer.hidden = true;
    backdrop.hidden = true;
    drawer.replaceChildren();
  }, 280);

  onCloseHook?.();
  onCloseHook = null;

  if (lastFocused instanceof HTMLElement) lastFocused.focus();
  lastFocused = null;
}

export const isDrawerOpen = () => !el()?.hidden;

function onKeydown(event) {
  if (event.key === 'Escape') {
    event.stopPropagation();
    closeDrawer();
  }
}

/** Swap just the body of an open drawer — used when a panel loads async content. */
export function updateDrawerBody(body) {
  const target = el()?.querySelector('.drawer__body');
  if (target) render(target, [].concat(body));
}

/** Convenience builder for the titled sections used inside drill-downs. */
export function drawerSection(title, ...content) {
  return h(
    'section.drawer__section',
    {},
    title ? h('h3.drawer__section-title', {}, title) : null,
    ...content,
  );
}
