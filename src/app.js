/**
 * Application bootstrap.
 *
 * Registers the feature modules as routes, seeds the incident set, wires the
 * shell chrome, and starts the router. Every screen lives in its own folder
 * under `features/` and exports `meta` plus `render` — nothing else is special.
 */

import { h, qs, render } from './core/dom.js';
import { icon } from './ui/icons.js';
import * as router from './core/router.js';
import { getState, subscribe, setRange, updateSettings, loadIncidents } from './core/store.js';
import { invalidate } from './domain/selectors.js';
import { generateIncidents } from './domain/incidents.js';
import { PROFILE } from './domain/taxonomy.js';
import * as selectors from './domain/selectors.js';
import { openModal, closeModal, isModalOpen } from './ui/modal.js';
import { closeDrawer, isDrawerOpen } from './ui/drawer.js';
import { openKpiDrill, openIncident } from './ui/drilldown.js';
import { isRunning, SCENARIOS, runScenario } from './domain/simulation.js';
import { toast } from './ui/toast.js';
import * as fmt from './core/format.js';

import * as commandCenter from './features/command-center/index.js';
import * as citizen from './features/citizen/index.js';
import * as incidents from './features/incidents/index.js';
import * as hospitals from './features/hospitals/index.js';
import * as analyticsView from './features/analytics/index.js';
import * as assistant from './features/assistant/index.js';
import * as settings from './features/settings/index.js';

/** Feature modules, in navigation order. */
const FEATURES = [commandCenter, citizen, incidents, hospitals, analyticsView, assistant, settings];

const RANGES = [
  { days: 1, label: '24h' },
  { days: 7, label: '7d' },
  { days: 30, label: '30d' },
];

boot();

function boot() {
  loadIncidents(generateIncidents());

  // Selector memoisation must be dropped whenever the case set changes.
  subscribe((_, keys) => {
    if (keys.includes('incidents')) invalidate();
  });

  registerRoutes();
  buildNav();
  buildRangePicker();
  wireChrome();
  updateStatus();

  subscribe((_, keys) => {
    if (keys.includes('incidents') || keys.includes('settings')) updateStatus();
  });

  router.start(qs('#view-root'));
  window.addEventListener('hashchange', syncChrome);
  syncChrome();
}

/* ── Routes ───────────────────────────────────────────────────────────────── */

function registerRoutes() {
  for (const feature of FEATURES) {
    router.route(feature.meta.path, {
      title: feature.meta.title,
      subtitle: feature.meta.subtitle,
      render: feature.render,
    });
  }

  // The old default path and anything unknown land on the command board.
  router.route('/overview', {
    title: commandCenter.meta.title,
    subtitle: commandCenter.meta.subtitle,
    render: commandCenter.render,
  });

  router.setNotFound({
    title: 'Not found',
    subtitle: 'That screen does not exist',
    render: ({ mount }) => {
      mount.appendChild(h('div.card', {},
        h('div.empty', {},
          icon('alert', { size: 26 }),
          h('h3', {}, 'Nothing here'),
          h('p', {}, 'That address does not match a screen in this console.'),
          h('a.btn.btn--primary', { href: '#/command', style: { marginTop: 'var(--s-4)' } }, 'Go to Command Center'))));
    },
  });
}

/* ── Shell chrome ─────────────────────────────────────────────────────────── */

function buildNav() {
  const nav = qs('#rail-nav');
  if (!nav) return;

  render(nav,
    h('div.rail__group', {}, 'Operations'),
    ...FEATURES.slice(0, 4).map(navItem),
    h('div.rail__group', {}, 'Intelligence'),
    ...FEATURES.slice(4).map(navItem));
}

function navItem(feature) {
  return h('a.nav-item', {
    href: `#${feature.meta.path}`,
    dataset: { path: feature.meta.path },
  },
  icon(feature.meta.icon, { size: 16 }),
  h('span', {}, feature.meta.title),
  feature.meta.path === '/incidents'
    ? h('span.nav-item__badge', { dataset: { count: 'active' } }, '0')
    : null);
}

function buildRangePicker() {
  const picker = qs('#range-picker');
  if (!picker) return;

  render(picker, ...RANGES.map((range) =>
    h('button', {
      type: 'button',
      'aria-pressed': String(getState().range === range.days),
      on: {
        click: () => {
          setRange(range.days);
          picker.querySelectorAll('button').forEach((node, index) =>
            node.setAttribute('aria-pressed', String(RANGES[index].days === range.days)));
        },
      },
    }, range.label)));
}

function wireChrome() {
  qs('#btn-theme')?.addEventListener('click', toggleTheme);
  qs('#btn-command')?.addEventListener('click', openCommandPalette);

  const report = qs('#btn-report');
  if (report) report.setAttribute('href', '#/report');

  document.addEventListener('keydown', (event) => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(event.target?.tagName);

    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      openCommandPalette();
      return;
    }

    if (typing) return;

    if (event.key === 'Escape') {
      if (isModalOpen()) closeModal();
      else if (isDrawerOpen()) closeDrawer();
      return;
    }

    // Single-key jumps, the way an operations console usually works.
    const jumps = { c: '/command', r: '/report', i: '/incidents', h: '/hospitals', a: '/analytics', s: '/settings' };
    if (jumps[event.key.toLowerCase()]) router.go(jumps[event.key.toLowerCase()]);
  });
}

/** Reflect the current route in the title bar and rail. */
function syncChrome() {
  const current = router.currentRoute();
  const title = qs('#view-title');
  const subtitle = qs('#view-sub');

  if (current?.config) {
    if (title) title.textContent = current.config.title;
    if (subtitle) subtitle.textContent = current.config.subtitle || '';
    document.title = `${current.config.title} · ${PROFILE.name}`;
  }

  const path = current?.path || '/command';
  document.querySelectorAll('.nav-item').forEach((node) => {
    if (node.dataset.path === path) node.setAttribute('aria-current', 'page');
    else node.removeAttribute('aria-current');
  });
}

/** Live figures in the rail footer — the board's pulse, always visible. */
function updateStatus() {
  const status = qs('#rail-status');
  if (!status) return;

  const active = selectors.activeIncidents();
  const critical = active.filter((incident) => incident.priority === 'P1').length;

  render(status,
    h('div.rail__status-row', {},
      h('span', {}, isRunning() ? 'Scenario running' : 'System nominal'),
      h('span', { class: isRunning() ? 'pulse' : 'dot', style: isRunning() ? {} : { background: 'var(--pos)' } })),
    h('div.rail__status-row', {},
      h('span', {}, 'Active'),
      h('span', { style: { color: 'var(--text)' } }, fmt.num(active.length))),
    h('div.rail__status-row', {},
      h('span', {}, 'Critical'),
      h('span', { style: { color: critical ? 'var(--neg)' : 'var(--text)' } }, fmt.num(critical))),
    h('div.rail__status-row', {},
      h('span', {}, 'Gemini'),
      h('span', { style: { color: getState().settings.geminiKey ? 'var(--pos)' : 'var(--text-dim)' } },
        getState().settings.geminiKey ? 'connected' : 'offline')));

  const badge = document.querySelector('[data-count="active"]');
  if (badge) badge.textContent = fmt.num(active.length);
}

function toggleTheme() {
  const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  try {
    localStorage.setItem('jibon.theme', next);
  } catch {
    /* Theme simply will not persist; not worth interrupting the user. */
  }
}

/* ── Command palette ──────────────────────────────────────────────────────── */

/**
 * Ctrl/Cmd-K. Screens, scenarios, KPIs and the most urgent open cases, all
 * reachable without the mouse.
 */
function openCommandPalette() {
  const commands = buildCommands();
  let active = 0;

  const list = h('div.palette__list');
  const input = h('input.palette__input', {
    type: 'text',
    placeholder: 'Jump to a screen, run a scenario, open a case…',
    'aria-label': 'Command',
  });

  const paint = (query = '') => {
    const term = query.trim().toLowerCase();
    const matches = commands.filter((command) =>
      !term || `${command.group} ${command.label}`.toLowerCase().includes(term));

    active = Math.min(active, Math.max(0, matches.length - 1));
    list.replaceChildren();

    let group = null;
    matches.forEach((command, index) => {
      if (command.group !== group) {
        group = command.group;
        list.appendChild(h('div.palette__group', {}, group));
      }

      list.appendChild(h('button.palette__item', {
        type: 'button',
        dataset: { active: String(index === active) },
        on: {
          click: () => { closeModal(); command.run(); },
          mouseenter: () => {
            active = index;
            list.querySelectorAll('.palette__item').forEach((node, i) =>
              node.setAttribute('data-active', String(i === index)));
          },
        },
      },
      icon(command.icon || 'chevron', { size: 15 }),
      h('span', {}, command.label),
      command.hint ? h('span.palette__hint', {}, command.hint) : null));
    });

    if (!matches.length) {
      list.appendChild(h('div.empty', { style: { padding: 'var(--s-5)' } }, h('p', {}, 'No matches.')));
    }

    return matches;
  };

  let current = paint();

  input.addEventListener('input', () => { active = 0; current = paint(input.value); });

  input.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      active = Math.max(0, Math.min(current.length - 1, active + (event.key === 'ArrowDown' ? 1 : -1)));
      paint(input.value);
      list.querySelectorAll('.palette__item')[active]?.scrollIntoView({ block: 'nearest' });
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const command = current[active];
      if (command) {
        closeModal();
        command.run();
      }
    }
  });

  openModal({ variant: 'palette', body: [input, list], title: null });
  input.focus();
}

function buildCommands() {
  const commands = FEATURES.map((feature) => ({
    group: 'Screens',
    label: feature.meta.title,
    icon: feature.meta.icon,
    hint: feature.meta.path,
    run: () => router.go(feature.meta.path),
  }));

  for (const scenario of SCENARIOS) {
    commands.push({
      group: 'Scenarios',
      label: `Run — ${scenario.label}`,
      icon: 'play',
      run: () => {
        const incident = runScenario(scenario.id);
        router.go('/command');
        toast(`Scenario started — ${scenario.label}`, {
          action: { label: 'Open case', onClick: () => openIncident(incident) },
        });
      },
    });
  }

  for (const kpi of selectors.currentKpis()) {
    commands.push({
      group: 'Metrics',
      label: kpi.label,
      icon: 'chart',
      hint: kpi.display,
      run: () => openKpiDrill(kpi),
    });
  }

  for (const incident of selectors.activeIncidents().slice(0, 8)) {
    commands.push({
      group: 'Active cases',
      label: `${incident.id} — ${incident.origin.label}`,
      icon: 'alert',
      hint: incident.priority,
      run: () => openIncident(incident),
    });
  }

  commands.push({
    group: 'Display',
    label: 'Toggle light / dark theme',
    icon: 'eye',
    run: toggleTheme,
  });

  return commands;
}
