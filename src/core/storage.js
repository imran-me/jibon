/**
 * Namespaced localStorage with JSON encoding.
 *
 * Every access is guarded: Safari private mode and some corporate policies
 * throw on read as well as write, and a dashboard should degrade to
 * "settings won't persist" rather than fail to boot.
 */

const PREFIX = 'nagorik.';

let available = null;

function isAvailable() {
  if (available !== null) return available;
  try {
    const probe = `${PREFIX}__probe`;
    localStorage.setItem(probe, '1');
    localStorage.removeItem(probe);
    available = true;
  } catch {
    available = false;
  }
  return available;
}

/** Read a value, falling back to `fallback` when missing or corrupt. */
export function read(key, fallback = null) {
  if (!isAvailable()) return fallback;
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

/** Persist a value. Returns false when storage is unavailable or full. */
export function write(key, value) {
  if (!isAvailable()) return false;
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function remove(key) {
  if (!isAvailable()) return;
  try {
    localStorage.removeItem(PREFIX + key);
  } catch {
    /* nothing useful to do */
  }
}

/** Wipe everything this app owns, leaving other origins' keys alone. */
export function clearAll() {
  if (!isAvailable()) return;
  try {
    Object.keys(localStorage)
      .filter((key) => key.startsWith(PREFIX))
      .forEach((key) => localStorage.removeItem(key));
  } catch {
    /* nothing useful to do */
  }
}

export const storageAvailable = isAvailable;
