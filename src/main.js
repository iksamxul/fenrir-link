/* Fenrir Link: Fenrir and Fenrir Connect on a phone.
   Scan the code on Fenrir's Dashboard (your own server's remote) or on Fenrir Connect's You page (your live page in a
   friend's world). The link works like a passkey: it is yours alone, and the phone keeps it in its keychain (Android
   Keystore, iOS Keychain). Home is a dashboard of every linked world; each world opens on four tabs: for your own server
   Dashboard, Players, Console and Tools, for a friend's world World, Chat, You and Tools. */
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { StatusBar, Style } from '@capacitor/status-bar';
import { CapacitorBarcodeScanner, CapacitorBarcodeScannerTypeHint } from '@capacitor/barcode-scanner';
import { SecureStorage } from '@aparajita/capacitor-secure-storage';
import { app, uiOf } from './app.js';
import { getJSON, parseLink, prefs, store, urls } from './net.js';
import { NATIVE, ago, busy, closeLayer, confirmSheet, el, initial, layerOpen, openSheet, plural, seg, svg, tap, toast } from './ui.js';
import { HOST_TABS, consoleTick, hostPatch, hostScreen, hostSig, hostStatus, hostSubtitle } from './host.js';
import { FRIEND_TABS, friendPatch, friendScreen, friendSig, friendStatus, friendSubtitle } from './friend.js';

const POLL_HOME = 30000, POLL_DETAIL = 6000, POLL_CONSOLE = 2500;
let active = true, pollTimer = 0, consoleTimer = 0, consoleRun = 0, lastSig = '';

/* ---------- refreshing ---------- */
async function refresh(l) {
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
async function refreshVisible() {
  if (app.view.name === 'detail') { const l = current(); if (l) await refresh(l); }
  else await Promise.all(app.links.map(refresh));
  render();
}
function schedule() {
  clearTimeout(pollTimer); clearTimeout(consoleTimer);
  if (!active || document.hidden) return;
  pollTimer = setTimeout(async () => { await refreshVisible(); schedule(); }, app.view.name === 'detail' ? POLL_DETAIL : POLL_HOME);
  const l = current(), run = ++consoleRun;  // one console loop at a time: a tick still waiting for its answer ends with the run it belongs to
  if (l && l.kind === 'host' && app.view.tab === 'console') {
    const tick = async () => {
      await consoleTick(l);
      if (run === consoleRun && current() === l && app.view.tab === 'console' && active && !document.hidden) consoleTimer = setTimeout(tick, POLL_CONSOLE);
    };
    tick();
  }
}
const current = () => app.view.name === 'detail' ? app.links.find((x) => x.id === app.view.id) : null;

/* ---------- navigation ---------- */
function go(name, id, tab) {
  const l = id ? app.links.find((x) => x.id === id) : null;
  const tabs = l ? (l.kind === 'host' ? HOST_TABS : FRIEND_TABS) : [];
  const want = tab || (l && uiOf(l.id).tab) || (tabs[0] || [])[0] || null;
  app.view = { name, id: id || null, tab: tabs.some((t) => t[0] === want) ? want : (tabs[0] || [])[0] || null };
  if (l) uiOf(l.id).tab = app.view.tab;
  render(true);
  window.scrollTo(0, 0);
  refreshVisible().then(schedule);
}

/* ---------- the home dashboard ---------- */
function topBar({ back, title, sub, right }) {
  return el('header', { class: 'top' },
    back ? el('button', { class: 'icon-btn', 'aria-label': 'Back to your worlds', onclick: () => { tap(); go('home'); } }, svg('i-back')) : svg('mark', 'mark'),
    el('div', { class: 'grow' }, el('h1', { text: title }), sub ? el('p', { class: 'sub', text: sub }) : null),
    right || null);
}
const statusOf = (l, s) => s.err ? { cls: 'bad', line: 'Out of reach' } : l.kind === 'host' ? hostStatus(s.d) : friendStatus(s.d);
function renderHome() {
  const right = el('div', { class: 'top-actions' },
    el('button', { class: 'icon-btn', 'aria-label': 'Settings', onclick: () => { tap(); openSettings(); } }, svg('i-gear')),
    el('button', { class: 'icon-btn accent', 'aria-label': 'Link a world', onclick: () => { tap(); openAdd(); } }, svg('i-plus')));
  const links = app.links;
  const sub = links.length ? `${plural(links.length, 'world', 'worlds')} linked` : 'Your worlds, in your pocket';
  const out = [topBar({ title: 'Fenrir Link', sub, right })];
  if (!links.length) {
    out.push(el('section', { class: 'card empty' },
      svg('mark', 'mark'),
      el('h2', { text: 'Link your first world' }),
      el('p', { text: 'Scan the code from Fenrir or Fenrir Connect. It works like a passkey: it is yours alone, and this phone keeps it in its keychain.' }),
      el('div', { class: 'actions' },
        el('button', { class: 'btn primary', onclick: () => { tap(); scan(); } }, svg('i-scan'), 'Scan a code'),
        el('button', { class: 'btn', onclick: () => { tap(); openAdd(true); } }, svg('i-link'), 'Paste a link')),
      el('div', { class: 'where' },
        el('div', null, svg('i-box'), el('span', null, el('b', { text: 'Your own server: ' }), 'open Fenrir on the PC. The code is on the Dashboard, in the Fenrir Link card.')),
        el('div', null, svg('i-users'), el('span', null, el('b', { text: 'A friend’s world: ' }), 'open Fenrir Connect. Your code is on the You page.')))));
    out.push(el('p', { class: 'foot' }, svg('i-shield'), 'Links stay in this phone’s keychain. Nothing goes anywhere else.'));
    return out;
  }
  /* the summary: how many worlds answer, how many are up, who is playing, and anything waiting on you */
  let up = 0, playing = 0, known = 0;
  const waiting = [];
  for (const l of links) {
    const s = app.live.get(l.id) || {}, d = s.d;
    if (!d || s.err || d.gone || d.insecure) continue;
    known++;
    if (l.kind === 'host') {
      if (d.status === 'running' && d.ready !== false) { up++; playing += (d.players || []).length; }
      const wake = (d.wake || []).map((w) => (typeof w === 'string' ? w : w.name)).filter(Boolean);
      if (wake.length) waiting.push({ l, icon: 'i-play', text: `${wake.join(', ')} ${wake.length === 1 ? 'wants' : 'want'} to play`, tab: 'dash' });
      if ((d.asks || []).length) waiting.push({ l, icon: 'i-hand', text: `${plural(d.asks.length, 'friend needs', 'friends need')} a hand`, tab: 'dash' });
    } else {
      const srv = (d.servers || [])[0] || {};
      if (srv.online && srv.ready !== false) { up++; playing += srv.players || 0; }
      const g = d.session;
      if (g && g.title && !g.mine && !g.live && g.t && g.t - Date.now() / 1000 < 3 * 86400) waiting.push({ l, icon: 'i-cal', text: `${g.title}: will you come?`, tab: 'world' });
    }
  }
  out.push(el('section', { class: 'summary', 'aria-label': 'All your worlds' },
    el('div', { class: 'sum' }, el('b', { text: String(links.length) }), el('small', { text: links.length === 1 ? 'world' : 'worlds' })),
    el('div', { class: 'sum on' }, el('b', { text: known ? String(up) : '–' }), el('small', { text: 'online' })),
    el('div', { class: 'sum' }, el('b', { text: known ? String(playing) : '–' }), el('small', { text: 'playing' }))));
  if (waiting.length) {
    out.push(el('section', { class: 'card attention list-card' }, el('p', { class: 'kicker', text: 'Waiting on you' }),
      waiting.map((w) => el('button', { class: 'wait-row', onclick: () => { tap(); go('detail', w.l.id, w.tab); } },
        el('span', { class: 'g-ic ' + (w.l.kind === 'host' ? 'ice' : 'teal'), 'aria-hidden': 'true' }, svg(w.icon)),
        el('span', { class: 'g-tx' }, el('b', { text: w.text }), el('span', { text: w.l.name })), svg('i-chevron', 'i chev')))));
  }
  out.push(el('div', { class: 'list' }, links.map((l) => {
    const s = app.live.get(l.id) || {}, d = s.d || {};
    const st = statusOf(l, s);
    const names = l.kind === 'host' ? (d.players || []) : (((d.servers || [])[0] || {}).names || []);
    return el('button', { class: 'row', onclick: () => { tap(); go('detail', l.id); } },
      el('span', { class: 'avatar ' + l.kind, 'aria-hidden': 'true', text: initial(l.name) }),
      el('span', { class: 'who' },
        el('span', { class: 'name-line' }, el('b', { text: l.name }), el('span', { class: 'role ' + l.kind, text: l.kind === 'host' ? 'Your server' : 'Friend' })),
        el('span', { class: 'line' }, el('span', { class: 'dot ' + st.cls }), el('span', { text: st.line })),
        names.length && !s.err ? el('span', { class: 'faces', 'aria-label': names.join(', ') }, names.slice(0, 5).map((n) => el('span', { class: 'mini-face', text: initial(n), style: { background: `hsl(${hue(n)} 55% 46%)` } })),
          names.length > 5 ? el('span', { class: 'more', text: '+' + (names.length - 5) }) : null) : null),
      svg('i-chevron', 'i chev'));
  })));
  out.push(el('p', { class: 'foot' }, svg('i-shield'), 'Links stay in this phone’s keychain. Nothing goes anywhere else.'));
  return out;
}
function hue(name) { let h = 0; for (const c of String(name || '')) h = (h * 31 + c.charCodeAt(0)) % 360; return h; }

/* ---------- a world, on its tabs ---------- */
const more = {
  rename: (l) => rename(l),
  remove: (l) => removeLink(l),
  open: (l) => openUrl(urls.page(l)),
  openUrl: (u) => openUrl(u),
};
function renderDetail() {
  const l = current();
  if (!l) { app.view = { name: 'home', id: null, tab: null }; return renderHome(); }
  const s = app.live.get(l.id) || {};
  const tabs = l.kind === 'host' ? HOST_TABS : FRIEND_TABS;
  const tab = app.view.tab || tabs[0][0];
  const dots = el('button', { class: 'icon-btn', 'aria-label': 'More', onclick: () => { tap(); openMore(l); } }, svg('i-dots'));
  const sub = (l.kind === 'host' ? 'Your server · ' + hostSubtitle(l, s) : (l.friend ? `Friend · as ${l.friend} · ` : 'Friend · ') + friendSubtitle(l, s));
  const screen = l.kind === 'host' ? hostScreen(l, s, tab, more) : friendScreen(l, s, tab, more);
  const bar = el('nav', { class: 'tabbar ' + l.kind, 'aria-label': 'Sections' }, el('div', { class: 'tabbar-in' },
    tabs.map(([id, label, icon]) => el('button', { class: 'tab', 'aria-current': id === tab ? 'page' : null, onclick: () => {
      if (id === tab) { window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
      tap(); uiOf(l.id).tab = id; app.view.tab = id; render(true); window.scrollTo(0, 0); schedule();
    } }, svg(icon), el('span', { text: label })))));
  return [el('div', { class: 'detail ' + l.kind }, topBar({ back: true, title: l.name, sub, right: dots }), screen), bar];
}

function signature() {
  if (app.view.name !== 'detail') {
    return JSON.stringify(['home', app.links.map((l) => [l.id, l.name, (() => { const s = app.live.get(l.id) || {}; const d = s.d || {};
      return [!!s.err, l.kind === 'host' ? [d.status, d.ready, d.players, d.wake, (d.asks || []).length, d.gone, d.insecure, !!d.frozen, !!d.crashLoop]
        : [(d.servers || []).map((x) => [x.online, x.ready, x.players, x.names]), d.session, d.gone, !!d.maintenance]]; })()])]);
  }
  const l = current();
  if (!l) return 'none';
  const s = app.live.get(l.id) || {};
  return JSON.stringify(['detail', l.id, app.view.tab, l.kind === 'host' ? hostSig(l, s, app.view.tab) : friendSig(l, s, app.view.tab)]);
}
/* what moves every few seconds is written into the drawn screen, also while someone types (render waits then) */
function patch() {
  const l = current();
  if (!l) return;
  const s = app.live.get(l.id) || {};
  if (l.kind === 'host') hostPatch(l, s); else friendPatch(l, s);
}
function render(fresh) {
  const root = document.getElementById('app');
  const a = document.activeElement;
  if (!fresh && a && /^(INPUT|TEXTAREA)$/.test(a.tagName) && root.contains(a)) { patch(); return; }  // never rebuild the page under someone typing
  const sig = signature();
  if (!fresh && sig === lastSig) { patch(); return; }
  lastSig = sig;
  const y = window.scrollY;
  const nodes = app.view.name === 'detail' ? renderDetail() : renderHome();
  root.classList.toggle('has-tabs', app.view.name === 'detail');
  const bars = nodes.filter((n) => n.classList && n.classList.contains('tabbar'));  // outside the entering wrapper: its transform would carry a fixed bar away
  root.replaceChildren(el('div', { class: fresh ? 'view' : '' }, nodes.filter((n) => !bars.includes(n))), ...bars);
  if (!fresh) window.scrollTo(0, y);
}

/* ---------- sheets: add, more, rename, settings ---------- */
function openAdd(pasteFirst) {
  const err = el('div', { class: 'err', role: 'alert' });
  const input = el('input', { placeholder: 'https://… or KEY@address', autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false', enterkeyhint: 'go', 'aria-label': 'Link or code' });
  const linkBtn = el('button', { class: 'btn primary', onclick: () => addFromText(input.value, err, linkBtn) }, 'Link it');
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') addFromText(input.value, err, linkBtn); });
  const paste = el('div', null, el('div', { class: 'field' }, input), el('div', { class: 'actions' }, linkBtn));
  if (!pasteFirst) paste.hidden = true;
  openSheet([
    el('h2', { text: 'Link a world' }),
    el('p', { text: 'Scan the code on Fenrir’s Dashboard for your own server, or the one on Fenrir Connect’s You page for a friend’s world. Keep it to yourself: it works like a passkey.' }),
    el('div', { class: 'actions' },
      el('button', { class: 'btn primary', onclick: () => scan(err) }, svg('i-scan'), 'Scan the code'),
      pasteFirst ? null : el('button', { class: 'btn', onclick: (e) => { paste.hidden = false; e.currentTarget.remove(); input.focus(); } }, svg('i-link'), 'Paste a link instead')),
    paste, err]);
  if (pasteFirst) setTimeout(() => input.focus(), 350);
}
async function scan(err) {
  if (!NATIVE) { openAdd(true); return; }
  try {
    const r = await CapacitorBarcodeScanner.scanBarcode({ hint: CapacitorBarcodeScannerTypeHint.QR_CODE, scanInstructions: 'Point at the code in Fenrir or Fenrir Connect', scanButton: false });
    const text = r && (r.ScanResult || r.scanResult);
    if (text) await addFromText(text, err);
  } catch (e) {
    const msg = String((e && e.message) || e || '');
    if (/cancel/i.test(msg)) return;
    toast(/permission|denied/i.test(msg) ? 'Fenrir Link needs the camera to read the code. Allow it in the phone’s settings, or paste the link instead.' : 'The camera did not open. Paste the link instead.', 'bad');
  }
}
async function saveLinks() {
  const r = await store.save(app.links);
  if (r !== true) toast('This phone did not keep the link. ' + r, 'bad');
  return r === true;
}
async function addFromText(text, errBox, btn) {
  const say = (m) => { if (errBox) errBox.textContent = m; else toast(m, 'bad'); tap('bad'); };
  const p = parseLink(text);
  if (!p) return say('That is not a Fenrir Link code. Scan the code on Fenrir’s Dashboard or on Fenrir Connect’s You page.');
  const same = app.links.find((x) => x.base === p.base && x.key === p.key);
  if (same) { closeLayer(); toast('That world is already linked', 'ok'); go('detail', same.id); return; }
  if (p.kind === 'host' && !p.base.startsWith('https://')) return say('This code is not on a secure address, and Fenrir only answers its remote over one. Turn on Cloudflare or Tailscale in Network & Cloud, then scan the new code.');
  if (errBox) errBox.textContent = '';
  const run = async () => {
    let d, names = null;
    try { d = await getJSON(urls.state(p)); } catch (_) { return say('Fenrir did not answer. Check that the PC is on and Fenrir is running, then try again.'); }
    if (d.gone) return say(p.kind === 'host' ? 'This code no longer works. Scan the new one on Fenrir’s Dashboard.' : 'This link no longer works. Ask your host for a new one.');
    if (d.insecure) return say('Fenrir only answers its remote over a secure address. Turn on Cloudflare or Tailscale in Network & Cloud, then scan the new code.');
    if (p.kind === 'friend') {
      if (d.fenrirConnect !== 1) return say('That address answered, but it is not a Fenrir.');
      try { names = await getJSON(urls.names(p)); } catch (_) { names = null; }
    } else if (!('status' in d)) return say('That address answered, but it is not a Fenrir.');
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    const hostName = names && names.hostName;
    const link = p.kind === 'host'
      ? { id, ...p, name: d.host ? `${d.host}` : 'Your server', added: Date.now() / 1000 }
      : { id, ...p, name: hostName ? `${hostName}’s world` : 'A friend’s world', host: hostName || '', friend: (names && names.friend) || '', added: Date.now() / 1000 };
    app.links.push(link);
    if (!(await saveLinks())) { app.links.pop(); return; }
    app.live.set(id, { d, names, namesAt: names ? Date.now() : 0, at: Date.now() });
    closeLayer(); tap('ok'); toast('Linked. It is saved in this phone’s keychain.', 'ok');
    go('detail', id);
  };
  if (btn) await busy(btn, run); else await run();
}
function openMore(l) {
  openSheet([
    el('h2', { text: l.name }),
    el('p', { text: l.kind === 'host' ? 'Your own server, through Fenrir’s phone remote.' : `${l.host || 'Your host'}’s world, through your live page.` }),
    el('div', { class: 'actions' },
      el('button', { class: 'btn', onclick: () => { closeLayer(); openUrl(urls.page(l)); } }, svg('i-open'), l.kind === 'host' ? 'Open the full remote' : 'Open your live page'),
      el('button', { class: 'btn', onclick: () => rename(l) }, svg('i-edit'), 'Rename'),
      el('button', { class: 'btn danger', onclick: () => removeLink(l) }, svg('i-trash'), 'Remove this link'))]);
}
function rename(l) {
  const input = el('input', { value: l.name, maxlength: 40, 'aria-label': 'Name' });
  const save = async () => { const v = input.value.trim(); if (!v) return; l.name = v; await saveLinks(); closeLayer(); render(true); };
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') save(); });
  openSheet([el('h2', { text: 'Rename' }), el('p', { text: 'Only this phone sees the name.' }), el('div', { class: 'field' }, input),
    el('div', { class: 'actions' }, el('button', { class: 'btn primary', onclick: save }, 'Save'), el('button', { class: 'btn', onclick: () => closeLayer() }, 'Cancel'))]);
}
async function removeLink(l) {
  if (!(await confirmSheet('Remove this link?', 'This phone forgets the key. You can scan the code again any time.', 'Remove', true))) return;
  app.links = app.links.filter((x) => x.id !== l.id); app.live.delete(l.id); app.ui.delete(l.id);
  await saveLinks();
  toast('Removed', 'ok');
  go('home');
}
async function openUrl(url) {
  tap();
  try { await Browser.open({ url, presentationStyle: 'fullscreen', toolbarColor: dark() ? '#0b0f17' : '#f3f6fb' }); }
  catch (_) { window.open(url, '_blank', 'noopener'); }
}
function openSettings() {
  const theme = prefs.get('theme') || 'system';
  const haptic = prefs.get('haptics') !== false;
  const hapticBox = el('input', { type: 'checkbox', role: 'switch', 'aria-label': 'Vibrate on taps' });
  hapticBox.checked = haptic;
  hapticBox.addEventListener('change', () => { prefs.set('haptics', hapticBox.checked); tap(); });
  openSheet([
    el('h2', { text: 'Settings' }),
    el('div', { class: 'set-row' }, el('div', null, el('b', { text: 'Appearance' }), el('span', { text: 'Follow the phone, or always dark or light' })),
      seg('Appearance', [['system', 'Phone'], ['dark', 'Dark'], ['light', 'Light']], theme, (v) => { prefs.set('theme', v); applyTheme(); openSettings(); })),
    el('label', { class: 'set-row' }, el('div', null, el('b', { text: 'Vibrate on taps' }), el('span', { text: 'A light tap when a button does something' })), el('span', { class: 'switch' }, hapticBox, el('i', { 'aria-hidden': 'true' }))),
    el('div', { class: 'set-row' }, el('div', null, el('b', { text: 'Your links' }), el('span', { text: `${plural(app.links.length, 'link', 'links')}, kept in this phone’s keychain and nowhere else` }))),
    el('div', { class: 'actions' },
      el('button', { class: 'btn', onclick: () => { closeLayer(); openUrl('https://iksamxul.github.io/fenrir/link'); } }, svg('i-open'), 'Fenrir Link on the web'),
      app.links.length ? el('button', { class: 'btn danger', onclick: forgetAll }, svg('i-trash'), 'Remove every link') : null,
      el('button', { class: 'btn', onclick: () => closeLayer() }, 'Done'))]);
}
async function forgetAll() {
  if (!(await confirmSheet('Remove every link?', 'This phone forgets every key. Scan the codes again to link the worlds back.', 'Remove all', true))) return;
  app.links = []; app.live.clear(); app.ui.clear();
  await saveLinks();
  toast('Every link is removed', 'ok');
  go('home');
}

/* ---------- the phone around the app ---------- */
const darkQ = window.matchMedia('(prefers-color-scheme: dark)');
const dark = () => { const t = prefs.get('theme'); return t === 'dark' || (t !== 'light' && darkQ.matches); };
function applyTheme() {
  const t = prefs.get('theme');
  if (t === 'dark' || t === 'light') document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme;
  if (!NATIVE) return;
  StatusBar.setStyle({ style: dark() ? Style.Dark : Style.Light }).catch(() => {});
  if (Capacitor.getPlatform() === 'android') StatusBar.setBackgroundColor({ color: dark() ? '#0b0f17' : '#f3f6fb' }).catch(() => {});
}

app.render = render;
app.refresh = refresh;
app.go = go;

async function start() {
  if (darkQ.addEventListener) darkQ.addEventListener('change', applyTheme);
  applyTheme();
  try { await SecureStorage.setKeyPrefix('fenrirlink_'); } catch (_) { /* the default prefix works too */ }
  app.links = await store.load();
  render(true);
  refreshVisible().then(schedule);
  if (NATIVE) {
    App.addListener('backButton', () => {
      const v = document.querySelector('.viewer.show');
      if (v) { v.click(); return; }
      if (closeLayer()) return;
      if (app.view.name !== 'home') { go('home'); return; }
      App.exitApp();
    });
    App.addListener('appStateChange', ({ isActive }) => { active = isActive; if (isActive) refreshVisible().then(schedule); else { clearTimeout(pollTimer); clearTimeout(consoleTimer); } });
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshVisible().then(schedule); else { clearTimeout(pollTimer); clearTimeout(consoleTimer); } });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const v = document.querySelector('.viewer.show');
    if (v) v.click(); else if (layerOpen()) closeLayer();
  });
}
start();
