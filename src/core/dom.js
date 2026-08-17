/**
 * A very small hyperscript layer.
 *
 * We build DOM rather than string-concatenating HTML: it keeps user-supplied
 * text (citizen reports, model output) from ever being parsed as markup, and it
 * lets event handlers be attached at construction time instead of via a second
 * query pass.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Tags that must be created in the SVG namespace to render at all. */
const SVG_TAGS = new Set([
  'svg', 'g', 'path', 'rect', 'circle', 'line', 'polyline', 'polygon',
  'text', 'tspan', 'defs', 'linearGradient', 'stop', 'clipPath', 'title', 'ellipse',
]);

/**
 * Create an element.
 *
 * @param {string} tag        Tag name, optionally with `.class` and `#id` suffixes ("div.card#main").
 * @param {object} [props]    Attributes. `class`, `style` (object or string), `dataset`,
 *                            `on` (event map), `html` (trusted markup) get special handling.
 * @param {...any} children   Nodes, strings, numbers, arrays, or null/false (skipped).
 * @returns {Element}
 */
export function h(tag, props, ...children) {
  const { name, classes, id } = parseTag(tag);
  const isSvg = SVG_TAGS.has(name);
  const node = isSvg
    ? document.createElementNS(SVG_NS, name)
    : document.createElement(name);

  if (classes.length) node.classList.add(...classes);
  if (id) node.id = id;

  if (props) applyProps(node, props, isSvg);
  append(node, children);

  return node;
}

/** Split "div.card.is-open#main" into its name, classes and id. */
function parseTag(tag) {
  const classes = [];
  let id = '';
  let name = 'div';

  // Each token carries its own prefix: none = tag, "." = class, "#" = id.
  for (const [, prefix, value] of tag.matchAll(/([.#]?)([^.#]+)/g)) {
    if (prefix === '.') classes.push(value);
    else if (prefix === '#') id = value;
    else name = value;
  }

  return { name, classes, id };
}

function applyProps(node, props, isSvg) {
  for (const [key, value] of Object.entries(props)) {
    if (value === null || value === undefined || value === false) continue;

    if (key === 'class' || key === 'className') {
      node.setAttribute('class', [node.getAttribute('class'), value].filter(Boolean).join(' '));
    } else if (key === 'style') {
      if (typeof value === 'string') node.setAttribute('style', value);
      else Object.assign(node.style, value);
    } else if (key === 'dataset') {
      for (const [dk, dv] of Object.entries(value)) {
        if (dv !== null && dv !== undefined) node.dataset[dk] = dv;
      }
    } else if (key === 'on') {
      for (const [evt, fn] of Object.entries(value)) {
        if (typeof fn === 'function') node.addEventListener(evt, fn);
      }
    } else if (key === 'html') {
      node.innerHTML = value;
    } else if (key === 'text') {
      node.textContent = String(value);
    } else if (key === 'ref' && typeof value === 'function') {
      value(node);
    } else if (!isSvg && key in node && key !== 'list' && key !== 'form') {
      // Prefer the property for things like `value`, `checked`, `disabled`.
      node[key] = value;
    } else {
      node.setAttribute(key, value === true ? '' : String(value));
    }
  }
}

function append(node, children) {
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false || child === true) continue;
    node.appendChild(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

/** Build an SVG icon from a path spec. Keeps view code free of markup blobs. */
export function icon(paths, { size = 16, stroke = 1.4, fill = 'none' } = {}) {
  const svg = h('svg', {
    viewBox: '0 0 24 24',
    width: size,
    height: size,
    fill,
    stroke: 'currentColor',
    'stroke-width': stroke,
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    'aria-hidden': 'true',
    focusable: 'false',
  });

  for (const d of [].concat(paths)) {
    svg.appendChild(document.createElementNS(SVG_NS, 'path')).setAttribute('d', d);
  }
  return svg;
}

/** Replace all children of `node` with `content`. */
export function render(node, ...content) {
  node.replaceChildren();
  append(node, content);
  return node;
}

export const qs = (sel, root = document) => root.querySelector(sel);
export const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/**
 * Delegated listener. Returns an unsubscribe function so views can clean up.
 */
export function delegate(root, eventName, selector, handler) {
  const listener = (event) => {
    const match = event.target instanceof Element ? event.target.closest(selector) : null;
    if (match && root.contains(match)) handler(event, match);
  };
  root.addEventListener(eventName, listener);
  return () => root.removeEventListener(eventName, listener);
}

/** Focus trap for drawers and modals — Tab must not escape an open overlay. */
export function trapFocus(container) {
  const SELECTOR = 'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';

  const onKeydown = (event) => {
    if (event.key !== 'Tab') return;
    const items = qsa(SELECTOR, container).filter((el) => el.offsetParent !== null);
    if (!items.length) return;

    const first = items[0];
    const last = items[items.length - 1];

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  container.addEventListener('keydown', onKeydown);
  return () => container.removeEventListener('keydown', onKeydown);
}
