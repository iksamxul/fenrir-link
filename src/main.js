/* Fenrir Link: Fenrir and Fenrir Connect on a phone.
   Scan the code on Fenrir's Dashboard (your own server's remote) or on Fenrir Connect's You card (your live page in a
   friend's world). The link works like a passkey: it is yours alone, and the phone keeps it in its keychain (Android
   Keystore, iOS Keychain). The app talks to the same small JSON routes the phone pages use, through the native HTTP
   stack (no browser rules about other sites), and opens the full page in an in-app browser when you want everything.
   Text from a server only ever reaches the screen as text, never as markup. */
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { StatusBar, Style } from '@capacitor/status-bar';
import { CapacitorBarcodeScanner, CapacitorBarcodeScannerTypeHint } from '@capacitor/barcode-scanner';
import { SecureStorage } from '@aparajita/capacitor-secure-storage';

const NATIVE = Capacitor.isNativePlatform();
const HOST_KEY = /^[A-Za-z0-9]{32}$/;
const FRIEND_KEY = /^[A-Za-z0-9]{6,16}$/;
const POLL_HOME = 30000, POLL_DETAIL = 6000;

/* ---------- small helpers ---------- */
function el(tag, props, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'text') e.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? '' : String(v));
  }
  for (const k of kids.flat(Infinity)) if (k != null && k !== false) e.append(k.nodeType ? k : document.createTextNode(String(k)));
  return e;
}
function svg(id, cls) {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('class', cls || 'i'); s.setAttribute('aria-hidden', 'true');
  const u = document.createElementNS('http://www.w3.org/2000/svg', 'use'); u.setAttribute('href', '#' + id);
  s.append(u); return s;
}
const hhmm = (t) => new Date(t * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const ago = (t) => { const s = Math.max(0, Date.now() / 1000 - t); return s < 90 ? 'just now' : s < 3600 ? Math.round(s / 60) + ' min ago' : s < 86400 ? Math.round(s / 3600) + ' h ago' : Math.round(s / 86400) + ' d ago'; };
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const initial = (s) => (String(s || '?').trim()[0] || '?').toUpperCase();
function tap(kind) {
  if (!NATIVE) return;
  if (kind === 'ok') Haptics.notification({ type: NotificationType.Success }).catch(() => {});
  else if (kind === 'bad') Haptics.notification({ type: NotificationType.Warning }).catch(() => {});
  else Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
}
function toast(text, kind) {
  const t = el('div', { class: 'toast' + (kind ? ' ' + kind : ''), text });
  document.getElementById('toasts').append(t);
  setTimeout(() => t.remove(), 3600);
}
function withTimeout(p, ms) { return Promise.race([p, new Promise((_, no) => setTimeout(() => no(new Error('timeout')), ms))]); }

/* ---------- the network: native HTTP on a phone (CapacitorHttp), plain fetch in a desktop browser ---------- */
async function getJSON(url) {
  const r = await withTimeout(fetch(url, { cache: 'no-store', headers: { Accept: 'application/json' } }), 10000);
  let d = null;
  try { d = await r.json(); } catch (_) { d = null; }
  if (r.status === 404 || (d && d.gone)) return { gone: true };
  if (r.status === 403) return { insecure: true };
  if (!r.ok || !d) throw new Error('HTTP ' + r.status);
  return d;
}
async function postJSON(url, body, headers) {
  try {
    const r = await withTimeout(fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(headers || {}) }, body: JSON.stringify(body || {}) }), 15000);
    let d = null;
    try { d = await r.json(); } catch (_) { d = null; }
    if (d && typeof d === 'object') return d;
    return { ok: false, error: r.status === 404 ? 'This link no longer works. Scan the new code.' : 'Fenrir answered in a way this app does not understand.' };
  } catch (_) {
    return { ok: false, error: 'Fenrir is not answering. Its PC may be off, or its address changed.' };
  }
}

/* ---------- links: what a code means, and where they are kept ---------- */
function parseLink(text) {
  const t = String(text || '').trim();
  const code = t.match(/^([A-Za-z0-9]{6,16})@([A-Za-z0-9.-]+(?::\d{1,5})?)$/);  // a Fenrir Connect code: KEY@address
  if (code) {
    const secure = /(\.trycloudflare\.com|\.ts\.net)(:\d+)?$/i.test(code[2]);
    return { kind: 'friend', base: (secure ? 'https://' : 'http://') + code[2], key: code[1].toUpperCase() };
  }
  let u;
  try { u = new URL(t); } catch (_) { return null; }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  const parts = u.pathname.split('/').filter(Boolean);
  if (!parts.length) return null;
  if (HOST_KEY.test(parts[0]) && (parts.length === 1 || parts[1] === 'admin')) return { kind: 'host', base: u.origin, key: parts[0] };
  if (FRIEND_KEY.test(parts[0])) return { kind: 'friend', base: u.origin, key: parts[0].toUpperCase() };
  return null;
}
const urls = {
  state: (l) => l.kind === 'host' ? `${l.base}/${l.key}/admin.json` : `${l.base}/${l.key}/status.json`,
  names: (l) => `${l.base}/${l.key}/manifest.json?lite=1`,
  page: (l) => l.kind === 'host' ? `${l.base}/${l.key}/admin` : `${l.base}/${l.key}/status`,
  act: (l, route) => l.kind === 'host' ? `${l.base}/${l.key}/admin/${route}` : `${l.base}/${l.key}/${route}`,
};
const store = {
  async load() {
    try {
      const v = await SecureStorage.get('links');
      if (Array.isArray(v)) return v;
      if (typeof v === 'string' && v) return JSON.parse(v);
    } catch (_) { /* nothing kept yet, or the keychain is locked */ }
    return [];
  },
  async save(list) {
    try { await SecureStorage.set('links', list); return true; } catch (e) { toast('This phone did not keep the link. ' + (e && e.message ? e.message : ''), 'bad'); return false; }
  },
};

/* ---------- state ---------- */
let links = [];
const live = new Map();  // id -> { d, names, at, err }
let view = { name: 'home', id: null };
let active = true, pollTimer = 0, layer = null;

/* ---------- what a state means in words ---------- */
function hostStatus(d) {
  if (!d) return { cls: '', title: 'Checking…', line: 'Checking…' };
  if (d.gone) return { cls: 'bad', title: 'This code no longer works', line: 'This code no longer works' };
  if (d.insecure) return { cls: 'bad', title: 'Needs a secure address', line: 'Needs a secure address' };
  const n = (d.players || []).length;
  if (d.crashLoop) return { cls: 'bad', title: 'Stopped after repeated crashes', line: 'Stopped after repeated crashes' };
  if (d.frozen) return { cls: 'bad', title: 'Not responding', line: 'Not responding' };
  if (d.status === 'running' && d.ready !== false) return { cls: 'on', title: 'Server online', line: n ? `Online · ${n} playing` : 'Online · nobody on' };
  if (d.status === 'starting' || (d.status === 'running' && d.ready === false)) return { cls: 'wait', title: 'Starting up', line: 'Starting up' };
  if (d.status === 'stopping') return { cls: 'wait', title: 'Shutting down', line: 'Shutting down' };
  return { cls: '', title: 'Server stopped', line: 'Off' };
}
function friendStatus(d) {
  if (!d) return { cls: '', title: 'Checking…', line: 'Checking…' };
  if (d.gone) return { cls: 'bad', title: 'This link no longer works', line: 'This link no longer works' };
  const s = (d.servers || [])[0] || {};
  const mt = d.maintenance;
  if (mt) return { cls: 'wait', title: mt.what === 'rehearsal' ? 'Checking the pack' : 'Updating the pack', line: 'Pack update' };
  if (s.online && s.ready !== false) return { cls: 'on', title: 'The world is online', line: s.players ? `Online · ${s.players} playing` : 'Online · nobody on' };
  if (s.online) return { cls: 'wait', title: 'Starting up', line: 'Starting up' };
  return { cls: '', title: 'The world is off', line: 'Off' };
}
const statusOf = (l, d) => l.kind === 'host' ? hostStatus(d) : friendStatus(d);

/* ---------- refreshing ---------- */
async function refresh(l) {
  const cur = live.get(l.id) || {};
  try {
    const d = await getJSON(urls.state(l));
    const next = { ...cur, d, at: Date.now(), err: null };
    if (l.kind === 'friend' && !d.gone && (!cur.names || Date.now() - (cur.namesAt || 0) > 600000)) {
      try { next.names = await getJSON(urls.names(l)); next.namesAt = Date.now(); } catch (_) { /* the names can wait */ }
    }
    live.set(l.id, next);
  } catch (_) {
    live.set(l.id, { ...cur, err: true, at: Date.now() });
  }
}
async function refreshVisible() {
  if (view.name === 'detail') { const l = links.find((x) => x.id === view.id); if (l) await refresh(l); }
  else await Promise.all(links.map(refresh));
  render();
}
function schedule() {
  clearTimeout(pollTimer);
  if (!active || document.hidden) return;
  pollTimer = setTimeout(async () => { await refreshVisible(); schedule(); }, view.name === 'detail' ? POLL_DETAIL : POLL_HOME);
}

/* ---------- navigation ---------- */
function go(name, id) {
  view = { name, id: id || null };
  render(true);
  window.scrollTo(0, 0);
  refreshVisible().then(schedule);
}

/* ---------- the views ---------- */
function topBar({ back, title, sub, right }) {
  return el('header', { class: 'top' },
    back ? el('button', { class: 'icon-btn', 'aria-label': 'Back', onclick: () => { tap(); go('home'); } }, svg('i-back')) : svg('mark', 'mark'),
    el('div', { class: 'grow' }, el('h1', { text: title }), sub ? el('p', { class: 'sub', text: sub }) : null),
    right || null);
}

function renderHome() {
  const addBtn = el('button', { class: 'icon-btn accent', 'aria-label': 'Link a world', onclick: () => { tap(); openAdd(); } }, svg('i-plus'));
  const sub = links.length ? `${plural(links.length, 'world', 'worlds')} linked` : 'Your worlds, in your pocket';
  const out = [topBar({ title: 'Fenrir Link', sub, right: addBtn })];
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
        el('div', null, svg('i-users'), el('span', null, el('b', { text: 'A friend’s world: ' }), 'open Fenrir Connect. Your code is on the You card.')))));
  } else {
    out.push(el('div', { class: 'list' }, links.map((l) => {
      const s = live.get(l.id) || {};
      const st = s.err ? { cls: 'bad', line: 'Out of reach' } : statusOf(l, s.d);
      return el('button', { class: 'row', onclick: () => { tap(); go('detail', l.id); } },
        el('span', { class: 'avatar ' + l.kind, 'aria-hidden': 'true', text: initial(l.name) }),
        el('span', { class: 'who' },
          el('b', { text: l.name }),
          el('span', { class: 'line' }, el('span', { class: 'dot ' + st.cls }), el('span', { text: st.line }))),
        el('span', { class: 'role ' + l.kind, text: l.kind === 'host' ? 'Your server' : 'Friend' }),
        svg('i-chevron', 'i chev'));
    })));
  }
  out.push(el('p', { class: 'foot' }, svg('i-shield'), 'Links stay in this phone’s keychain. Nothing goes anywhere else.'));
  return out;
}

function hostDetail(l, s) {
  const d = s.d || {};
  const st = s.err ? { cls: 'bad', title: 'Out of reach' } : hostStatus(s.d);
  const players = d.players || [];
  const out = [];
  const running = d.status === 'running' || d.status === 'starting';
  const sub = s.err ? 'Fenrir is not answering. The PC may be off, asleep or restarting.'
    : d.gone ? 'The remote was turned off or given a new key. Scan the new code from Fenrir’s Dashboard.'
    : d.insecure ? 'Fenrir only answers its remote over a secure address. Turn on Cloudflare or Tailscale in Network & Cloud, then scan the new code.'
    : d.status === 'running' && d.startedAt ? `${d.pack || 'Your world'} · up since ${hhmm(d.startedAt)}` : (d.pack || '');
  out.push(el('section', { class: 'card hero' },
    el('div', { class: 'state' }, el('span', { class: 'dot ' + st.cls }), el('h2', { text: st.title })),
    sub ? el('p', { class: 'sub', text: sub }) : null,
    s.d && !d.gone && !d.insecure ? el('div', { class: 'stats' },
      el('div', { class: 'stat' }, el('small', { text: 'Players' }), el('b', { text: String(players.length) })),
      el('div', { class: 'stat' }, el('small', { text: 'TPS' }), el('b', { text: d.tps != null ? Number(d.tps).toFixed(1) : '–' })),
      el('div', { class: 'stat' }, el('small', { text: 'Tick' }), el('b', { text: d.mspt != null ? Math.round(d.mspt) + ' ms' : '–' }))) : null,
    d.crashLoop ? el('div', { class: 'note bad' }, svg('i-warn'), el('span', { text: 'It crashed several times in a row, so Fenrir stopped restarting it. Check the console on the PC, then start it again.' })) : null,
    d.frozen ? el('div', { class: 'note bad' }, svg('i-warn'), el('span', { text: 'The world stopped answering. Fenrir restarts it on its own if you allowed that; otherwise restart it here.' })) : null,
    d.doctor ? el('div', { class: 'note ' + (d.doctor.severity === 'error' ? 'bad' : 'warn') }, svg('i-warn'), el('span', { text: `The Doctor found: ${d.doctor.title}${d.doctor.more ? ` (and ${d.doctor.more} more)` : ''}. Open Fenrir on the PC to fix it.` })) : null,
    s.d && !d.gone && !d.insecure ? el('div', { class: 'actions' },
      running ? [el('button', { class: 'btn grow', onclick: (e) => hostPower(l, 'restart', e.currentTarget) }, svg('i-restart'), 'Restart'),
                 el('button', { class: 'btn grow danger', onclick: (e) => hostPower(l, 'stop', e.currentTarget) }, svg('i-stop'), 'Stop')]
              : el('button', { class: 'btn primary grow', onclick: (e) => hostPower(l, 'start', e.currentTarget) }, svg('i-play', 'i fill'), 'Start the world')) : null));
  if (!s.d || d.gone || d.insecure) return out;
  const wake = d.wake || [];
  if (wake.length) {
    const names = wake.map((w) => w.name || w.friend || w.who).filter(Boolean);
    out.push(el('section', { class: 'card' },
      el('p', { class: 'kicker', text: 'Asking to play' }),
      el('h2', { text: names.length ? `${names.join(', ')} ${names.length === 1 ? 'wants' : 'want'} to play` : 'A friend wants to play' }),
      el('div', { class: 'actions' },
        el('button', { class: 'btn primary grow', onclick: (e) => hostAct(l, 'wake-start', {}, e.currentTarget, 'Starting the world') }, 'Start the world'),
        el('button', { class: 'btn grow', onclick: (e) => hostAct(l, 'wake-dismiss', {}, e.currentTarget, 'They were told not now') }, 'Not now'))));
  }
  out.push(el('section', { class: 'card' },
    el('p', { class: 'kicker', text: 'In the world' }),
    players.length ? el('div', { class: 'chips' }, players.map((p) => el('span', { class: 'chip' }, el('span', { text: p }),
      el('button', { 'aria-label': 'Kick ' + p, onclick: (e) => kick(l, p, e.currentTarget), text: 'Kick' }))))
      : el('p', { class: 'muted small', text: running ? 'Nobody is on right now.' : 'The world is off.' })));
  const say = el('input', { placeholder: 'Say something to everyone', maxlength: 200, enterkeyhint: 'send', 'aria-label': 'Message everyone' });
  const sayBtn = el('button', { class: 'icon-btn accent', 'aria-label': 'Send' }, svg('i-send'));
  const send = async () => { const text = say.value.trim(); if (!text) return; const r = await hostAct(l, 'say', { text }, sayBtn, 'Sent to everyone'); if (r && r.ok) say.value = ''; };
  sayBtn.addEventListener('click', send); say.addEventListener('keydown', (e) => { if (e.key === 'Enter') send(); });
  out.push(el('section', { class: 'card' }, el('p', { class: 'kicker', text: 'Message everyone' }),
    d.status === 'running' && d.ready !== false ? el('div', { class: 'field' }, say, sayBtn) : el('p', { class: 'muted small', text: 'Messages reach the world while it runs.' })));
  const friends = d.friends || [];
  if (friends.length) {
    out.push(el('section', { class: 'card' }, el('p', { class: 'kicker', text: 'Friends' }),
      el('div', { class: 'items' }, friends.map((f) => {
        const state = f.inGame ? ['playing', 'on'] : f.state === 'installing' || f.state === 'updating' ? [`${f.state === 'updating' ? 'updating' : 'installing'}${f.progress != null ? ' ' + Math.round(f.progress) + '%' : ''}`, 'wait'] : f.appOpen ? ['in Fenrir Connect', ''] : [f.lastSeen ? 'seen ' + ago(f.lastSeen) : 'not seen yet', ''];
        return el('div', { class: 'item' }, el('span', { class: 'avatar friend', 'aria-hidden': 'true', text: initial(f.username || f.name) }),
          el('div', { class: 'grow' }, el('div', { class: 't', text: f.username || f.name }), f.username && f.name && f.username !== f.name ? el('div', { class: 's', text: 'key for ' + f.name }) : null),
          el('span', { class: 'pill ' + state[1], text: state[0] }));
      }))));
  }
  if (d.session && d.session.title) {
    out.push(el('section', { class: 'card' }, el('p', { class: 'kicker', text: 'Next game night' }),
      el('h2', { text: d.session.title }), el('p', { class: 'muted small', text: [d.session.when, d.session.weekly ? 'every week' : '', d.session.live ? 'on now' : ''].filter(Boolean).join(' · ') })));
  }
  const acts = d.activity || [];
  if (acts.length) {
    out.push(el('section', { class: 'card' }, el('p', { class: 'kicker', text: 'Recently' }),
      el('div', { class: 'items' }, acts.slice(0, 8).map((a) => el('div', { class: 'item' }, el('div', { class: 'grow' }, el('div', { class: 't', text: a.text })), el('time', { text: ago(a.t) }))))));
  }
  const con = (d.console || []).slice(-14);
  if (con.length) out.push(el('section', { class: 'card' }, el('p', { class: 'kicker', text: 'Console' }), el('div', { class: 'console' }, con.map((c) => el('div', { text: c.line })))));
  out.push(el('section', { class: 'card' },
    el('div', { class: 'actions' },
      el('button', { class: 'btn grow', onclick: (e) => hostAct(l, 'backup', {}, e.currentTarget, 'Backup started') }, svg('i-box'), 'Back up now'),
      el('button', { class: 'btn grow', onclick: () => openPage(l) }, svg('i-open'), 'Full remote'))));
  return out;
}

function friendDetail(l, s) {
  const d = s.d || {}, names = s.names || {};
  const srv = (d.servers || [])[0] || {};
  const st = s.err ? { cls: 'bad', title: 'Out of reach' } : friendStatus(s.d);
  const world = ((names.servers || []).find((x) => x.id === srv.id) || (names.servers || [])[0] || {}).name;
  const host = names.hostName || l.host || 'your host';
  const out = [];
  const sub = s.err ? `${host}’s Fenrir is not answering. Their PC may be off, asleep or restarting.`
    : d.gone ? `This link no longer works. Ask ${host} for a new one, then scan it.`
    : srv.online && srv.ready !== false ? (srv.names && srv.names.length ? srv.names.join(', ') : 'Nobody is on yet. Be the first.')
    : srv.online ? 'A few minutes, then you can join.' : (d.wake && d.wake.asked ? `${host} knows you want to play.` : 'Nobody is on right now.');
  const w = d.wake || {};
  const canWake = s.d && !d.gone && !srv.online && w.mode && w.mode !== 'off' && !d.maintenance;
  out.push(el('section', { class: 'card hero' },
    el('p', { class: 'kicker', text: world || 'Your friend’s world' }),
    el('div', { class: 'state' }, el('span', { class: 'dot ' + st.cls }), el('h2', { text: st.title })),
    el('p', { class: 'sub', text: sub }),
    canWake ? el('div', { class: 'actions' }, el('button', { class: 'btn teal grow', disabled: !!w.asked, onclick: (e) => friendWake(l, srv, e.currentTarget) },
      svg('i-play', 'i fill'), w.asked ? 'Asked' : w.mode === 'auto' ? 'Start the world' : `Ask ${host} to start it`)) : null));
  if (!s.d || d.gone) return out;
  const g = d.session;
  if (g && g.title) {
    const a = g.answers || {};
    const rsvp = (v, label) => el('button', { class: 'btn grow ' + (g.mine === v ? 'teal' : ''), 'aria-pressed': String(g.mine === v), onclick: (e) => friendRsvp(l, g.mine === v ? '' : v, e.currentTarget) }, label);
    out.push(el('section', { class: 'card' }, el('p', { class: 'kicker', text: 'Next game night' }),
      el('h2', { text: g.title }),
      el('p', { class: 'muted small', text: g.live ? 'On now: the world is starting or up.' : new Date(g.t * 1000).toLocaleString([], { weekday: 'long', hour: '2-digit', minute: '2-digit' }) + (g.weekly ? ', every week' : '') }),
      el('p', { class: 'hint', text: (a.in && a.in.length ? 'Coming: ' + a.in.join(', ') : 'Nobody has answered yet.') + (a.out && a.out.length ? ' · Not coming: ' + a.out.join(', ') : '') }),
      el('div', { class: 'actions' }, rsvp('in', 'I’m in'), rsvp('out', 'Can’t make it'))));
  }
  const c = d.chat || {};
  if (c.on) {
    const lines = (c.lines || []).slice(-30);
    const box = el('div', { class: 'chat', role: 'log', 'aria-label': 'World chat' },
      lines.length ? lines.map((x) => el('div', { class: 'ln' + (x.event ? ' ev' : '') }, el('time', { text: hhmm(x.t) }),
        x.event ? el('span', { text: `${x.who} ${x.event === 'joined' ? 'joined the world' : x.event === 'left' ? 'left the world' : x.text || x.event}` })
                : [el('b', { text: x.who }), ' ', el('span', { text: x.text })]))
        : el('div', { class: 'ln ev', text: 'Nothing said yet.' }));
    const online = srv.online && srv.ready !== false;
    const input = el('input', { placeholder: online ? 'Say something to everyone' : 'The world is off', maxlength: 200, enterkeyhint: 'send', disabled: !online, 'aria-label': 'Chat message' });
    const btn = el('button', { class: 'icon-btn accent', 'aria-label': 'Send', disabled: !online }, svg('i-send'));
    const send = async () => { const text = input.value.trim(); if (!text) return; const r = await friendAct(l, 'chat', { text }, btn); if (r && r.ok) { input.value = ''; refresh(l).then(render); } };
    btn.addEventListener('click', send); input.addEventListener('keydown', (e) => { if (e.key === 'Enter') send(); });
    out.push(el('section', { class: 'card' }, el('p', { class: 'kicker', text: 'World chat' }), box, el('div', { class: 'field' }, input, btn)));
    requestAnimationFrame(() => { box.scrollTop = box.scrollHeight; });
  }
  out.push(el('section', { class: 'card' }, el('div', { class: 'actions' },
    el('button', { class: 'btn grow', onclick: () => openPage(l) }, svg('i-open'), 'Your live page'))));
  return out;
}

function renderDetail() {
  const l = links.find((x) => x.id === view.id);
  if (!l) { view = { name: 'home', id: null }; return renderHome(); }
  const s = live.get(l.id) || {};
  const more = el('button', { class: 'icon-btn', 'aria-label': 'More', onclick: () => { tap(); openMore(l); } }, svg('i-dots'));
  const sub = l.kind === 'host' ? 'Your server' : (l.friend ? `Friend · as ${l.friend}` : 'Friend');
  return [topBar({ back: true, title: l.name, sub, right: more }), ...(l.kind === 'host' ? hostDetail(l, s) : friendDetail(l, s))];
}

function render(fresh) {
  const app = document.getElementById('app');
  const keep = document.activeElement && document.activeElement.tagName === 'INPUT' ? document.activeElement : null;
  if (keep && !fresh) return;  // never rebuild the page under someone typing; the next tick catches up
  const nodes = view.name === 'detail' ? renderDetail() : renderHome();
  const wrap = el('div', { class: fresh ? 'view' : '' }, nodes);
  app.replaceChildren(wrap);
}

/* ---------- actions ---------- */
async function busy(btn, fn) {
  if (btn) { btn.classList.add('busy'); btn.disabled = true; }
  try { return await fn(); } finally { if (btn && btn.isConnected) { btn.classList.remove('busy'); btn.disabled = false; } }
}
async function hostAct(l, action, body, btn, okText) {
  tap();
  const r = await busy(btn, () => postJSON(urls.act(l, action), body, { 'X-Fenrir-Remote': '1' }));
  if (r && r.ok) { tap('ok'); if (okText) toast(okText, 'ok'); } else { tap('bad'); toast((r && r.error) || 'That did not go through.', 'bad'); }
  refresh(l).then(render);
  return r;
}
async function hostPower(l, action, btn) {
  const words = { start: ['Start the world?', 'Fenrir starts the server on the PC.', 'Start'], stop: ['Stop the server?', 'Everyone in the world is disconnected and the world is saved.', 'Stop'], restart: ['Restart the server?', 'Everyone is disconnected for a minute or two while it comes back.', 'Restart'] }[action];
  if (!(await confirmSheet(words[0], words[1], words[2], action !== 'start'))) return;
  tap();
  let r = await busy(btn, () => postJSON(urls.act(l, action), {}, { 'X-Fenrir-Remote': '1' }));
  if (r && !r.ok && r.playersOnline && r.playersOnline.length) {
    const who = r.playersOnline.join(', ');
    if (await confirmSheet(`${plural(r.playersOnline.length, 'friend is', 'friends are')} playing`, `${who} ${r.playersOnline.length === 1 ? 'is' : 'are'} in the world. ${action === 'stop' ? 'Stop' : 'Restart'} anyway?`, `${action === 'stop' ? 'Stop' : 'Restart'} anyway`, true)) {
      r = await busy(btn, () => postJSON(urls.act(l, action), { force: true }, { 'X-Fenrir-Remote': '1' }));
    } else { refresh(l).then(render); return; }
  }
  if (r && r.ok) { tap('ok'); toast(action === 'start' ? 'Starting the world' : action === 'stop' ? 'Stopping the server' : 'Restarting the server', 'ok'); }
  else { tap('bad'); toast((r && r.error) || 'That did not go through.', 'bad'); }
  refresh(l).then(render);
}
async function kick(l, name, btn) {
  if (await confirmSheet(`Kick ${name}?`, `${name} leaves the world now and can join again.`, 'Kick', true)) await hostAct(l, 'kick', { name }, btn, `${name} was kicked`);
}
async function friendAct(l, route, body, btn) {
  tap();
  const r = await busy(btn, () => postJSON(urls.act(l, route), body));
  if (!r || !r.ok) { tap('bad'); toast((r && r.error) || 'That did not go through.', 'bad'); } else tap('ok');
  return r;
}
async function friendWake(l, srv, btn) { const r = await friendAct(l, 'wake', { id: srv.id }, btn); if (r && r.ok) toast(r.message || 'Your host knows you want to play', 'ok'); refresh(l).then(render); }
async function friendRsvp(l, answer, btn) { await friendAct(l, 'rsvp', { answer }, btn); refresh(l).then(render); }
async function openPage(l) {
  tap();
  try { await Browser.open({ url: urls.page(l), presentationStyle: 'fullscreen', toolbarColor: matchMedia('(prefers-color-scheme: dark)').matches ? '#0b0f17' : '#f3f6fb' }); }
  catch (_) { window.open(urls.page(l), '_blank'); }
}

/* ---------- sheets: add, more, confirm, rename ---------- */
function closeLayer() {
  if (!layer) return false;
  const { scrim, sheet, done } = layer;
  layer = null;
  scrim.classList.remove('show'); sheet.classList.remove('show');
  setTimeout(() => { scrim.remove(); sheet.remove(); }, 320);
  if (done) done();
  return true;
}
function openSheet(children, onClose) {
  closeLayer();
  const scrim = el('div', { class: 'scrim', onclick: () => closeLayer() });
  const sheet = el('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true' }, el('div', { class: 'grab', 'aria-hidden': 'true' }), children);
  document.getElementById('layer').append(scrim, sheet);
  layer = { scrim, sheet, done: onClose };
  requestAnimationFrame(() => { scrim.classList.add('show'); sheet.classList.add('show'); const f = sheet.querySelector('input, button.primary, button.teal, button'); if (f) f.focus({ preventScroll: true }); });
  return sheet;
}
function confirmSheet(title, text, okText, danger) {
  return new Promise((resolve) => {
    let answered = false;
    const answer = (v) => { if (answered) return; answered = true; closeLayer(); resolve(v); };
    openSheet([el('h2', { text: title }), el('p', { text }),
      el('div', { class: 'actions' },
        el('button', { class: 'btn ' + (danger ? 'solid-danger' : 'primary'), onclick: () => answer(true) }, okText),
        el('button', { class: 'btn', onclick: () => answer(false) }, 'Cancel'))], () => { if (!answered) { answered = true; resolve(false); } });
  });
}
function openAdd(pasteFirst) {
  const err = el('div', { class: 'err', role: 'alert' });
  const input = el('input', { placeholder: 'https://… or KEY@address', autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false', enterkeyhint: 'go', 'aria-label': 'Link or code' });
  const linkBtn = el('button', { class: 'btn primary', onclick: () => addFromText(input.value, err, linkBtn) }, 'Link it');
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') addFromText(input.value, err, linkBtn); });
  const paste = el('div', { class: pasteFirst ? '' : 'hidden-paste' }, el('div', { class: 'field' }, input), el('div', { class: 'actions' }, linkBtn));
  if (!pasteFirst) paste.style.display = 'none';
  openSheet([
    el('h2', { text: 'Link a world' }),
    el('p', { text: 'Scan the code on Fenrir’s Dashboard for your own server, or the one on Fenrir Connect’s You card for a friend’s world. Keep it to yourself: it works like a passkey.' }),
    el('div', { class: 'actions' },
      el('button', { class: 'btn primary', onclick: () => scan(err) }, svg('i-scan'), 'Scan the code'),
      pasteFirst ? null : el('button', { class: 'btn', onclick: (e) => { paste.style.display = ''; e.currentTarget.remove(); input.focus(); } }, svg('i-link'), 'Paste a link instead')),
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
async function addFromText(text, errBox, btn) {
  const say = (m) => { if (errBox) errBox.textContent = m; else toast(m, 'bad'); tap('bad'); };
  const p = parseLink(text);
  if (!p) return say('That is not a Fenrir Link code. Scan the code on Fenrir’s Dashboard or on Fenrir Connect’s You card.');
  const same = links.find((x) => x.base === p.base && x.key === p.key);
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
    links.push(link);
    if (!(await store.save(links))) { links.pop(); return; }
    live.set(id, { d, names, namesAt: names ? Date.now() : 0, at: Date.now() });
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
      el('button', { class: 'btn', onclick: () => { closeLayer(); openPage(l); } }, svg('i-open'), l.kind === 'host' ? 'Open the full remote' : 'Open your live page'),
      el('button', { class: 'btn', onclick: () => rename(l) }, svg('i-edit'), 'Rename'),
      el('button', { class: 'btn danger', onclick: () => removeLink(l) }, svg('i-trash'), 'Remove this link'))]);
}
function rename(l) {
  const input = el('input', { value: l.name, maxlength: 40, 'aria-label': 'Name' });
  const save = async () => { const v = input.value.trim(); if (!v) return; l.name = v; await store.save(links); closeLayer(); render(); };
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') save(); });
  openSheet([el('h2', { text: 'Rename' }), el('div', { class: 'field' }, input), el('div', { class: 'actions' }, el('button', { class: 'btn primary', onclick: save }, 'Save'))]);
}
async function removeLink(l) {
  if (!(await confirmSheet('Remove this link?', 'This phone forgets the key. You can scan the code again any time.', 'Remove', true))) return;
  links = links.filter((x) => x.id !== l.id); live.delete(l.id);
  await store.save(links);
  toast('Removed', 'ok');
  go('home');
}

/* ---------- the phone around the app ---------- */
const darkQ = window.matchMedia('(prefers-color-scheme: dark)');
function syncBars() {
  if (!NATIVE) return;
  StatusBar.setStyle({ style: darkQ.matches ? Style.Dark : Style.Light }).catch(() => {});
  if (Capacitor.getPlatform() === 'android') StatusBar.setBackgroundColor({ color: darkQ.matches ? '#0b0f17' : '#f3f6fb' }).catch(() => {});
}

async function start() {
  if (darkQ.addEventListener) darkQ.addEventListener('change', syncBars);
  syncBars();
  try { await SecureStorage.setKeyPrefix('fenrirlink_'); } catch (_) { /* the default prefix works too */ }
  links = await store.load();
  render(true);
  refreshVisible().then(schedule);
  if (NATIVE) {
    App.addListener('backButton', () => { if (closeLayer()) return; if (view.name !== 'home') { go('home'); return; } App.exitApp(); });
    App.addListener('appStateChange', ({ isActive }) => { active = isActive; if (isActive) refreshVisible().then(schedule); else clearTimeout(pollTimer); });
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshVisible().then(schedule); else clearTimeout(pollTimer); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeLayer(); });
}
start();
