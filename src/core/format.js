/**
 * Display formatting.
 *
 * All numbers in the console pass through here so that rounding, separators and
 * units stay consistent between a KPI tile, a chart tooltip and a CSV export.
 */

const LOCALE = 'en-GB';

const int = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 0 });
const oneDp = new Intl.NumberFormat(LOCALE, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const compact = new Intl.NumberFormat(LOCALE, { notation: 'compact', maximumFractionDigits: 1 });

/** 1234 → "1,234" */
export const num = (value) => (Number.isFinite(value) ? int.format(value) : '—');

/** 12345 → "12.3K". Used where horizontal space is tight (axes, chips). */
export const short = (value) => (Number.isFinite(value) ? compact.format(value) : '—');

/** 12.34 → "12.3" */
export const dec = (value) => (Number.isFinite(value) ? oneDp.format(value) : '—');

/** 0.4213 → "42%" (pass `fraction: false` when the value is already 0–100). */
export function pct(value, { fraction = true, decimals = 0 } = {}) {
  if (!Number.isFinite(value)) return '—';
  const scaled = fraction ? value * 100 : value;
  return `${scaled.toFixed(decimals)}%`;
}

/** Signed percentage for deltas: 0.082 → "+8.2%" */
export function signedPct(value, decimals = 1) {
  if (!Number.isFinite(value)) return '—';
  const scaled = value * 100;
  const sign = scaled > 0 ? '+' : '';
  return `${sign}${scaled.toFixed(decimals)}%`;
}

/**
 * Durations are stored in hours throughout the domain layer, because that is
 * the unit civic SLAs are written in.
 */
export function hours(value) {
  if (!Number.isFinite(value)) return '—';
  if (value < 1) return `${Math.round(value * 60)}m`;
  if (value < 48) return `${value < 10 ? dec(value) : Math.round(value)}h`;
  return `${dec(value / 24)}d`;
}

const dayFmt = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'short' });
const dayYearFmt = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'short', year: 'numeric' });
const timeFmt = new Intl.DateTimeFormat(LOCALE, { hour: '2-digit', minute: '2-digit', hour12: false });
const weekdayFmt = new Intl.DateTimeFormat(LOCALE, { weekday: 'short' });

export const asDate = (ts) => dayFmt.format(new Date(ts));
export const asFullDate = (ts) => dayYearFmt.format(new Date(ts));
export const asTime = (ts) => timeFmt.format(new Date(ts));
export const asWeekday = (ts) => weekdayFmt.format(new Date(ts));
export const asDateTime = (ts) => `${dayFmt.format(new Date(ts))}, ${timeFmt.format(new Date(ts))}`;

/** "3h ago" / "in 2d". Coarse on purpose — a feed does not need seconds. */
export function relative(ts, now = Date.now()) {
  const diff = now - new Date(ts).getTime();
  const abs = Math.abs(diff);
  const past = diff >= 0;

  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;

  let text;
  if (abs < minute) text = 'just now';
  else if (abs < hour) text = `${Math.round(abs / minute)}m`;
  else if (abs < day) text = `${Math.round(abs / hour)}h`;
  else if (abs < 30 * day) text = `${Math.round(abs / day)}d`;
  else text = asDate(ts);

  if (text === 'just now' || text === asDate(ts)) return text;
  return past ? `${text} ago` : `in ${text}`;
}

/** Title Case for taxonomy keys that arrive as slugs. */
export const titleCase = (value) =>
  String(value)
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());

/** Truncate on a word boundary so table cells and cards stay tidy. */
export function clamp(text, max = 96) {
  const value = String(text ?? '');
  if (value.length <= max) return value;
  const cut = value.slice(0, max);
  const space = cut.lastIndexOf(' ');
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

/** RFC 4180-ish escaping for the CSV export. */
export function csvCell(value) {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
