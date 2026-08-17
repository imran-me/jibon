/**
 * Minimal publish/subscribe.
 *
 * Used for cross-cutting events that are not state — "a signal was created",
 * "the model started streaming" — so views can react without importing one
 * another.
 */

const channels = new Map();

/** Subscribe to a topic. Returns an unsubscribe function. */
export function on(topic, handler) {
  if (!channels.has(topic)) channels.set(topic, new Set());
  channels.get(topic).add(handler);
  return () => off(topic, handler);
}

export function off(topic, handler) {
  channels.get(topic)?.delete(handler);
}

/** Fire a topic. A throwing subscriber must not stop the others. */
export function emit(topic, payload) {
  const subscribers = channels.get(topic);
  if (!subscribers) return;

  for (const handler of Array.from(subscribers)) {
    try {
      handler(payload);
    } catch (error) {
      console.error(`[bus] subscriber for "${topic}" threw`, error);
    }
  }
}

/** Topic names live here so typos surface as import errors, not silence. */
export const TOPICS = {
  SIGNAL_CREATED: 'signal:created',
  SIGNAL_UPDATED: 'signal:updated',
  DATA_RESET: 'data:reset',
  SETTINGS_CHANGED: 'settings:changed',
  ROUTE_CHANGED: 'route:changed',
};
