/* The loop both shells share (the app, and the page Fenrir serves to a phone's browser): keeping the world on screen
   fresh, the polling rhythm, and drawing a screen only when what it shows changed. Each shell hands it its own views:
   shell.home() and shell.homeSig() for the list of worlds (the app only), shell.detail() for one world on its tabs. */
import { app, uiOf } from './app.js';
import { getJSON, urls } from './net.js';
import { el, svg, tap } from './ui.js';
import { HOST_TABS, consoleTick, hostPatch, hostSig } from './host.js';
import { FRIEND_TABS, friendPatch, friendSig } from './friend.js';

const POLL_HOME = 30000, POLL_DETAIL = 6000, POLL_CONSOLE = 2500;
let pollTimer = 0, consoleTimer = 0, consoleRun = 0, lastSig = '';
export const shell = { active: true, home: null, homeSig: null, detail: null };

/* ---------- refreshing ---------- */
export async function refresh(l) {
  const cur = app.live.get(l.id) || {};
  try {
    const d = await getJSON(urls.state(l));
    const next = { ...cur, d, at: Date.now(), err: null };
    if (l.kind === 'friend' && !d.gone && (!cur.names || Date.now() - (cur.namesAt || 0) > 600000)) {
      try { next.names = await getJSON(urls.names(l)); next.namesAt = Date.now(); } catch (_) { /* the names can wait */ }
    }
    app.live.set(l.id, next);
  } catch (_) {
    app.live.set(l.id, { ...cur, err: true, at: Date.now() });
  }
}
export async function refreshVisible() {
  if (app.view.name === 'detail') { const l = current(); if (l) await refresh(l); }
  else await Promise.all(app.links.map(refresh));
  render();
}
export function pause() { clearTimeout(pollTimer); clearTimeout(consoleTimer); }
export function schedule() {
  pause();
  if (!shell.active || document.hidden) return;
  pollTimer = setTimeout(async () => { await refreshVisible(); schedule(); }, app.view.name === 'detail' ? POLL_DETAIL : POLL_HOME);
  const l = current(), run = ++consoleRun;  // one console loop at a time: a tick still waiting for its answer ends with the run it belongs to
  if (l && l.kind === 'host' && app.view.tab === 'console') {
    const tick = async () => {
      await consoleTick(l);
      if (run === consoleRun && current() === l && app.view.tab === 'console' && shell.active && !document.hidden) consoleTimer = setTimeout(tick, POLL_CONSOLE);
    };
    tick();
  }
}
export const current = () => app.view.name === 'detail' ? app.links.find((x) => x.id === app.view.id) : null;
export const tabsOf = (l) => l.kind === 'host' ? HOST_TABS : FRIEND_TABS;

/* ---------- navigation ---------- */
export function go(name, id, tab) {
  const l = id ? app.links.find((x) => x.id === id) : null;
  const tabs = l ? tabsOf(l) : [];
  const want = tab || (l && uiOf(l.id).tab) || (tabs[0] || [])[0] || null;
  app.view = { name, id: id || null, tab: tabs.some((t) => t[0] === want) ? want : (tabs[0] || [])[0] || null };
  if (l) uiOf(l.id).tab = app.view.tab;
  render(true);
  window.scrollTo(0, 0);
  refreshVisible().then(schedule);
}
export function tabBar(l, tab) {
  return el('nav', { class: 'tabbar ' + l.kind, 'aria-label': 'Sections' }, el('div', { class: 'tabbar-in' },
    tabsOf(l).map(([id, label, icon]) => el('button', { class: 'tab', 'aria-current': id === tab ? 'page' : null, onclick: () => {
      if (id === tab) { window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
      tap(); uiOf(l.id).tab = id; app.view.tab = id; render(true); window.scrollTo(0, 0); schedule();
    } }, svg(icon), el('span', { text: label })))));
}

/* ---------- drawing ---------- */
function signature() {
  if (app.view.name !== 'detail') return JSON.stringify(['home', shell.homeSig ? shell.homeSig() : '']);
  const l = current();
  if (!l) return 'none';
  const s = app.live.get(l.id) || {};
  return JSON.stringify(['detail', l.id, app.view.tab, l.kind === 'host' ? hostSig(l, s, app.view.tab) : friendSig(l, s, app.view.tab)]);
}
/* what moves every few seconds is written into the drawn screen, also while someone types (render waits then) */
export function patch() {
  const l = current();
  if (!l) return;
  const s = app.live.get(l.id) || {};
  if (l.kind === 'host') hostPatch(l, s); else friendPatch(l, s);
}
export function render(fresh) {
  const root = document.getElementById('app');
  const a = document.activeElement;
  if (!fresh && a && /^(INPUT|TEXTAREA)$/.test(a.tagName) && root.contains(a)) { patch(); return; }  // never rebuild the page under someone typing
  const sig = signature();
  if (!fresh && sig === lastSig) { patch(); return; }
  lastSig = sig;
  const y = window.scrollY;
  const nodes = app.view.name === 'detail' ? shell.detail() : shell.home();
  root.classList.toggle('has-tabs', app.view.name === 'detail');
  const bars = nodes.filter((n) => n.classList && n.classList.contains('tabbar'));  // outside the entering wrapper: its transform would carry a fixed bar away
  root.replaceChildren(el('div', { class: fresh ? 'view' : '' }, nodes.filter((n) => !bars.includes(n))), ...bars);
  if (!fresh) window.scrollTo(0, y);
}

app.render = render;
app.refresh = refresh;
app.go = go;
