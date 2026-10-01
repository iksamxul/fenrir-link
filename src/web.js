/* Fenrir Link in a phone's browser: the page Fenrir serves at the address a code opens (your own server's /admin, a
   friend's /status). The same screens as the app, for one world. The address is the key, so there is nothing to scan or
   keep, and added to the home screen it opens full screen like an app: the direct install for an iPhone, with no store
   and no signing. Fenrir fills window.__fenrirLink with what the page is (host or friend) and the names it shows before
   the first answer. */
import { app, uiOf } from './app.js';
import { prefs } from './net.js';
import { closeLayer, el, layerOpen, openSheet, seg, svg, tap } from './ui.js';
import { hostScreen, hostSubtitle } from './host.js';
import { friendScreen, friendSubtitle } from './friend.js';
import { go, pause, refreshVisible, render, schedule, shell, tabBar, tabsOf } from './loop.js';

const boot = window.__fenrirLink || {};
const key = boot.key || location.pathname.split('/').filter(Boolean)[0] || '';
const kind = boot.kind === 'host' || boot.kind === 'friend' ? boot.kind : key.length === 32 ? 'host' : 'friend';
const link = { id: 'here', kind, base: boot.base || location.origin, key, name: boot.name || (kind === 'host' ? 'Your server' : 'Your friend’s world'),
  host: boot.host || '', friend: boot.friend || '' };

const ua = navigator.userAgent || '';
const IOS = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);  // iPadOS reports a Mac
const standalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
let installPrompt = null;  // Chrome on Android offers its own install sheet; it is kept for the Install button
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installPrompt = e; render(); });
window.addEventListener('appinstalled', () => { installPrompt = null; prefs.set('installed', 1); render(true); });

/* ---------- on the home screen ---------- */
const STEPS = IOS
  ? [['i-share', 'Tap Share', 'At the bottom of Safari; in Chrome, beside the address.'], ['i-plus', 'Choose Add to Home Screen', 'Scroll the list down if you do not see it.'], ['i-check', 'Tap Add', 'Fenrir Link sits on your home screen and opens straight to this world.']]
  : [['i-dots', 'Open the browser’s menu', 'The three dots beside the address.'], ['i-plus', 'Choose Install app', 'Or Add to Home screen.'], ['i-check', 'Confirm', 'Fenrir Link sits on your home screen and opens straight to this world.']];
async function install() {
  if (installPrompt) {  // Android: the browser's own sheet
    const p = installPrompt;
    installPrompt = null;
    try { await p.prompt(); } catch (_) { /* the sheet did not open: the steps below still work */ }
    render(true);
    return;
  }
  const tone = link.kind === 'host' ? 'ice' : 'teal';
  openSheet([el('h2', { text: 'Put it on your home screen' }),
    el('p', { text: 'Then it opens like an app: full screen and straight to this world. Nothing comes from a store and nothing needs installing.' }),
    el('ol', { class: 'steps' }, STEPS.map(([icon, t, s]) => el('li', null, el('span', { class: 'g-ic ' + tone, 'aria-hidden': 'true' }, svg(icon)), el('span', { class: 'g-tx' }, el('b', { text: t }), el('span', { text: s }))))),
    el('p', { class: 'hint', text: 'Keep this page to yourself: its address is your key.' }),
    el('div', { class: 'actions' }, el('button', { class: 'btn primary', onclick: () => closeLayer() }, 'Got it'))]);
}
function installCard() {
  if (standalone() || prefs.get('installed')) return null;
  const card = el('section', { class: 'card install-card ' + link.kind },
    el('span', { class: 'g-ic ' + (link.kind === 'host' ? 'ice' : 'teal'), 'aria-hidden': 'true' }, svg(IOS ? 'i-share' : 'i-plus')),
    el('div', { class: 'grow' }, el('b', { text: 'Keep it on your home screen' }),
      el('span', { text: IOS ? 'Share, then Add to Home Screen. No App Store.' : 'Install it from the browser. No store.' })),
    el('button', { class: 'btn small primary', onclick: () => { tap(); install(); } }, installPrompt ? 'Install' : 'How'),
    el('button', { class: 'icon-btn', 'aria-label': 'Not now', onclick: () => { prefs.set('installed', 1); card.remove(); } }, svg('i-x')));
  return card;
}

/* ---------- the one world on its tabs ---------- */
const more = {
  web: true,
  standalone,
  install,
  openUrl: (u) => { tap(); window.open(u, '_blank', 'noopener'); },
};
function displayName(s) {
  const hostName = (s.names || {}).hostName || (s.d || {}).host;
  if (!hostName) return link.name;
  return link.kind === 'host' ? hostName : `${hostName}’s world`;
}
function openPage() {
  const theme = prefs.get('theme') || 'system';
  openSheet([el('h2', { text: 'Fenrir Link' }),
    el('p', { text: link.kind === 'host' ? 'Your own server, through Fenrir’s phone remote, in this browser.' : `${link.host || 'Your host'}’s world, through your live page, in this browser.` }),
    el('div', { class: 'set-row' }, el('div', null, el('b', { text: 'Appearance' }), el('span', { text: 'Follow the phone, or always dark or light' })),
      seg('Appearance', [['system', 'Phone'], ['dark', 'Dark'], ['light', 'Light']], theme, (v) => { prefs.set('theme', v); applyTheme(); openPage(); })),
    el('div', { class: 'actions' },
      standalone() ? null : el('button', { class: 'btn primary', onclick: () => { closeLayer(); install(); } }, svg('i-plus'), 'Put it on your home screen'),
      el('button', { class: 'btn', onclick: () => { closeLayer(); more.openUrl('https://iksamxul.github.io/fenrir/link'); } }, svg('i-open'), 'Fenrir Link for Android'),
      el('button', { class: 'btn', onclick: () => closeLayer() }, 'Done'))]);
}
function renderDetail() {
  const s = app.live.get(link.id) || {};
  const tab = app.view.tab || tabsOf(link)[0][0];
  const name = displayName(s);
  if (document.title !== name) document.title = name;
  const sub = link.kind === 'host' ? 'Your server · ' + hostSubtitle(link, s) : (link.friend ? `Friend · as ${link.friend} · ` : 'Friend · ') + friendSubtitle(link, s);
  const top = el('header', { class: 'top' }, svg('mark', 'mark'),
    el('div', { class: 'grow' }, el('h1', { text: name }), el('p', { class: 'sub', text: sub })),
    el('button', { class: 'icon-btn', 'aria-label': 'More', onclick: () => { tap(); openPage(); } }, svg('i-dots')));
  const screen = link.kind === 'host' ? hostScreen(link, s, tab, more) : friendScreen(link, s, tab, more);
  prefs.set('tab', tab);
  return [el('div', { class: 'detail ' + link.kind }, top, installCard(), screen), tabBar(link, tab)];
}

/* ---------- the browser around the page ---------- */
const darkQ = window.matchMedia('(prefers-color-scheme: dark)');
function applyTheme() {
  const t = prefs.get('theme');
  if (t === 'dark' || t === 'light') document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme;
  const color = t === 'dark' ? '#0b0f17' : t === 'light' ? '#f3f6fb' : null;  // the browser's bar follows a chosen look
  for (const m of document.querySelectorAll('meta[name="theme-color"]')) {
    if (!m.dataset.content) m.dataset.content = m.content;
    m.content = color || m.dataset.content;
  }
}

shell.detail = renderDetail;
shell.home = renderDetail;  // never shown: this page is always one world
app.links = [link];

function start() {
  if (darkQ.addEventListener) darkQ.addEventListener('change', applyTheme);
  applyTheme();
  const asked = location.hash.slice(1), kept = prefs.get('tab');
  const tab = tabsOf(link).some((t) => t[0] === asked) ? asked : kept;  // a link like …/admin#console opens that tab
  uiOf(link.id).tab = tab;
  go('detail', link.id, tab);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshVisible().then(schedule); else pause(); });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const v = document.querySelector('.viewer.show');
    if (v) v.click(); else if (layerOpen()) closeLayer();
  });
}
start();
