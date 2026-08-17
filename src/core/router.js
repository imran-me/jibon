/**
 * Hash-based router.
 *
 * Hash routing is a deliberate choice: GitHub Pages serves this from a project
 * subpath with no rewrite rules, so any history-API route would 404 on refresh.
 * `#/signals?category=waterlogging` survives a hard reload anywhere.
 */

import { emit, TOPICS } from './bus.js';

const routes = new Map();
let notFound = null;
let current = null;
let disposeActive = null;

/**
 * Register a route.
 * @param {string} path   e.g. "/signals"
 * @param {object} config { title, subtitle, render(ctx) → Node|void }
 */
export function route(path, config) {
  routes.set(path, config);
}

export function setNotFound(config) {
  notFound = config;
}

/** Parse "#/signals?category=waste" into a path plus a params object. */
function parseHash() {
  const raw = window.location.hash.replace(/^#/, '') || '/overview';
  const [path, query = ''] = raw.split('?');
  const params = Object.fromEntries(new URLSearchParams(query));
  return { path: path || '/overview', params };
}

/** Navigate programmatically. `params` are serialised into the hash query. */
export function go(path, params = {}) {
  const query = new URLSearchParams(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== ''),
  ).toString();
  window.location.hash = query ? `#${path}?${query}` : `#${path}`;
}

export const currentRoute = () => current;

async function resolve(mount) {
  const { path, params } = parseHash();
  const config = routes.get(path) || notFound;
  if (!config) return;

  // Let the outgoing view detach timers and listeners before we swap the DOM.
  if (typeof disposeActive === 'function') {
    try {
      disposeActive();
    } catch (error) {
      console.error('[router] teardown failed', error);
    }
    disposeActive = null;
  }

  current = { path, params, config };

  mount.replaceChildren();
  const result = await config.render({ path, params, mount });

  // A view may either append to `mount` itself or return a node for us to mount.
  if (result instanceof Node) mount.appendChild(result);
  else if (result && typeof result.dispose === 'function') disposeActive = result.dispose;
  else if (typeof result === 'function') disposeActive = result;

  mount.scrollTop = 0;
  window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });

  emit(TOPICS.ROUTE_CHANGED, current);
}

/** Start listening. Call once, after all routes are registered. */
export function start(mount) {
  const handler = () => {
    resolve(mount).catch((error) => {
      console.error('[router] render failed', error);
    });
  };

  window.addEventListener('hashchange', handler);
  handler();

  return () => window.removeEventListener('hashchange', handler);
}
