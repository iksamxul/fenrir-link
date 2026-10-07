/* A friend's world, through your live page's key: the world, its chat, what is yours, and tools. The same small routes
   Fenrir Connect uses (status.json, manifest.json?lite=1, wake, rsvp, chat, ask, photo), behind the same key.
   As on your own server's screens, a screen is drawn again only when what it shows changes (friendSig), and what moves
   (the TPS, the chat's lines, "ago" times) is written into it in place (friendPatch): the chat keeps up while you type. */
import { app, uiOf } from './app.js';
import { postJSON, urls } from './net.js';
import { askText, ago, busy, clearDraft, copy, el, face, field, hhmm, hours, plural, size, svg, tap, toast, viewer } from './ui.js';
import { group, linkRows, row, testConnection } from './host.js';

export const FRIEND_TABS = [['world', 'World', 'i-globe'], ['chat', 'Chat', 'i-chat'], ['you', 'You', 'i-user'], ['tools', 'Tools', 'i-tools']];

export function friendStatus(d) {
  if (!d) return { cls: '', title: 'Checking…', line: 'Checking…' };
  if (d.gone) return { cls: 'bad', title: 'This link no longer works', line: 'This link no longer works' };
  const s = (d.servers || [])[0] || {};
  const mt = d.maintenance;
  if (mt) return { cls: 'wait', title: mt.what === 'rehearsal' ? 'Checking the pack' : 'Updating the pack', line: 'Pack update' };
  if (s.online && s.ready !== false) return { cls: 'on', title: 'The world is online', line: s.players ? `Online · ${s.players} playing` : 'Online · nobody on' };
  if (s.online) return { cls: 'wait', title: 'Starting up', line: 'Starting up' };
  return { cls: '', title: 'The world is off', line: 'Off' };
}
const hostOf = (l, s) => (s.names || {}).hostName || l.host || 'your host';
const worldOf = (s) => { const d = s.d || {}, names = s.names || {}, srv = (d.servers || [])[0] || {}; return ((names.servers || []).find((x) => x.id === srv.id) || (names.servers || [])[0] || {}).name; };

/* ---------- actions ---------- */
async function friendAct(l, route, body, btn) {
  tap();
  const r = await busy(btn, () => postJSON(urls.act(l, route), body));
  if (!r || !r.ok) { tap('bad'); toast((r && (r.error || r.message)) || 'That did not go through.', 'bad'); } else tap('ok');
  return r;
}
async function wake(l, srv, btn) {
  const r = await friendAct(l, 'wake', { id: srv.id }, btn);
  if (r && r.ok) toast(r.state === 'starting' ? 'The world is starting' : 'Your host knows you want to play', 'ok');
  app.refresh(l).then(() => app.render());
}
async function rsvp(l, answer, btn) { await friendAct(l, 'rsvp', { answer }, btn); app.refresh(l).then(() => app.render()); }
const ASK = [['death', 'I died and lost my things', 'i-skull'], ['login', 'I can’t get in', 'i-key'], ['other', 'Something else', 'i-hand']];
async function askHand(l, s, kind) {
  const host = hostOf(l, s), label = (ASK.find((a) => a[0] === kind) || [])[1];
  const note = await askText({ title: label, text: `${host} sees it in Fenrir and answers here and in Fenrir Connect.`, placeholder: kind === 'other' ? 'Say in a line what you need' : 'Anything to add? (optional)',
    okText: `Send to ${host}`, maxlength: 300, allowEmpty: kind !== 'other' });
  if (note == null) return;
  const r = await friendAct(l, 'ask', { kind, note });
  if (r && r.ok) toast(`Sent. ${host} sees it in Fenrir.`, 'ok');
  app.refresh(l).then(() => app.render());
}
/* a picture from the phone into the world's gallery: made smaller here first, so it crosses the host's tunnel quickly */
async function shrink(file) {
  const src = URL.createObjectURL(file);
  try {
    const img = await new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = src; });
    const k = Math.min(1, 1920 / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.86).split(',')[1];
  } finally { URL.revokeObjectURL(src); }
}
function sharePicture(l, s) {
  const pick = el('input', { type: 'file', accept: 'image/png,image/jpeg', class: 'sr' });
  pick.addEventListener('change', async () => {
    const f = pick.files && pick.files[0];
    pick.remove();
    if (!f) return;
    let data;
    try { data = await shrink(f); } catch (_) { toast('That picture could not be read.', 'bad'); return; }
    const caption = await askText({ title: 'Share with the world', text: `Everyone in ${hostOf(l, s)}’s world sees it in Fenrir Connect and Fenrir Link.`, placeholder: 'A word about it (optional)', okText: 'Share', maxlength: 140, allowEmpty: true });
    if (caption == null) return;
    const r = await friendAct(l, 'photo', { data, caption, name: f.name.replace(/\.[^.]+$/, '') + '.jpg' });
    if (r && r.ok) toast('Shared with the world', 'ok');
    app.refresh(l).then(() => app.render());
  });
  document.body.append(pick);
  pick.click();
}

/* ---------- the world ---------- */
function hero(l, s) {
  const d = s.d || {};
  const srv = (d.servers || [])[0] || {};
  const st = s.err ? { cls: 'bad', title: 'Out of reach' } : friendStatus(s.d);
  const host = hostOf(l, s);
  const sub = s.err ? `${host}’s Fenrir is not answering. Their PC may be off, asleep or restarting.`
    : d.gone ? `This link no longer works. Ask ${host} for a new one, then scan it.`
    : d.maintenance ? `${host} is ${d.maintenance.what === 'rehearsal' ? 'checking' : 'updating'} the pack. Back in a few minutes.`
    : srv.online && srv.ready !== false ? (srv.players ? `${plural(srv.players, 'player', 'players')} in the world` : 'Nobody is on yet. Be the first.')
    : srv.online ? 'A few minutes, then you can join.' : (d.wake && d.wake.asked ? `${host} knows you want to play.` : 'Nobody is on right now.');
  const w = d.wake || {};
  const canWake = s.d && !d.gone && !s.err && !srv.online && w.mode && w.mode !== 'off' && !d.maintenance && srv.id;
  const live = srv.online && srv.ready !== false;
  return el('section', { class: 'card hero' },
    el('p', { class: 'kicker', text: worldOf(s) || 'Your friend’s world' }),
    el('div', { class: 'state' }, el('span', { class: 'dot ' + st.cls }), el('h2', { text: st.title })),
    el('p', { class: 'sub', text: sub }),
    s.d && !d.gone && !s.err ? el('div', { class: 'stats' },
      el('div', { class: 'stat' }, el('small', { text: 'Playing' }), el('b', { text: live ? String(srv.players || 0) : '–' })),
      el('div', { class: tpsClass(srv), 'data-live': 'ftps' }, el('small', { text: 'TPS' }), el('b', { text: tpsText(srv) })),
      el('div', { class: 'stat' }, el('small', { text: 'Host' }), el('b', { class: 'ell', text: host }))) : null,
    canWake ? el('div', { class: 'actions' }, el('button', { class: 'btn teal grow', disabled: !!w.asked, onclick: (e) => wake(l, srv, e.currentTarget) },
      svg('i-play', 'i fill'), w.asked ? 'Asked' : w.mode === 'auto' ? 'Start the world' : `Ask ${host} to start it`)) : null,
    w.declined && !w.asked ? el('p', { class: 'hint', text: `${host} can’t start it right now.` }) : null);
}
const isLive = (srv) => srv.online && srv.ready !== false;
const tpsText = (srv) => isLive(srv) && srv.tps != null ? Number(srv.tps).toFixed(1) : '–';
const tpsClass = (srv) => 'stat' + (isLive(srv) && srv.tps != null && srv.tps < 15 ? ' warn' : '');
function card(kicker, ...kids) { return el('section', { class: 'card' }, kicker ? el('p', { class: 'kicker', text: kicker }) : null, ...kids); }
function worldTab(l, s) {
  const d = s.d || {};
  const out = [hero(l, s)];
  if (!s.d || d.gone || s.err) return out;
  const host = hostOf(l, s);
  if (d.note) {
    const sounded = d.horn && d.horn.text === d.note;
    out.push(el('section', { class: 'card note-card' + (sounded ? ' sounded' : '') },
      el('p', { class: 'kicker', text: sounded ? `From ${host} · sent as a notification` : `From ${host}` }), el('p', { class: 'quote', text: d.note })));
  }
  const g = d.session;
  if (g && g.title) {
    const a = g.answers || {};
    const pick = (v, label) => el('button', { class: 'btn grow ' + (g.mine === v ? 'teal' : ''), 'aria-pressed': String(g.mine === v), onclick: (e) => rsvp(l, g.mine === v ? '' : v, e.currentTarget) }, label);
    out.push(card('Next game night', el('h2', { text: g.game ? `${g.title} on ${g.game}` : g.title }),
      el('p', { class: 'muted small', text: g.live ? `On now: the ${g.game ? g.game + ' server' : 'world'} is starting or up.` : new Date(g.t * 1000).toLocaleString([], { weekday: 'long', hour: 'numeric', minute: '2-digit' }) + (g.weekly ? ', every week' : '') }),
      el('p', { class: 'hint', text: (a.in && a.in.length ? 'Coming: ' + a.in.join(', ') : 'Nobody has answered yet.') + (a.out && a.out.length ? ' · Not coming: ' + a.out.join(', ') : '') }),
      el('div', { class: 'actions' }, pick('in', 'I’m in'), pick('out', 'Can’t make it'))));
  }
  const srv = (d.servers || [])[0] || {};
  if ((srv.names || []).length) {
    out.push(card(`In the world · ${srv.names.length}`, el('div', { class: 'people' }, srv.names.map((n) => el('div', { class: 'person' }, face(n), el('div', { class: 'grow' }, el('b', { text: n })))))));
  }
  if ((d.around || []).length) {
    out.push(card('Getting ready', el('div', { class: 'items' }, d.around.map((x) => el('div', { class: 'item' }, face(x.name), el('div', { class: 'grow' }, el('div', { class: 't', text: x.name }), el('div', { class: 's', text: x.doing })))))));
  }
  if (d.week && d.week.text) out.push(card('This week in the world', el('p', { class: 'quote small', text: d.week.text })));
  if ((d.records || []).length) {
    out.push(card('Hall of records', el('div', { class: 'items' }, d.records.map((r) => el('div', { class: 'item' },
      el('span', { class: 'g-ic amber', 'aria-hidden': 'true' }, svg('i-trophy')),
      el('div', { class: 'grow' }, el('div', { class: 't', text: r.label }), el('div', { class: 's', text: r.name })), el('b', { class: 'num', text: r.value }))))));
  }
  return out;
}

/* ---------- chat ---------- */
function chatTab(l, s) {
  const d = s.d || {};
  if (!s.d || d.gone || s.err) return [hero(l, s)];
  const c = d.chat || {};
  if (!c.on) return [card('World chat', el('p', { class: 'muted', text: `${hostOf(l, s)} turned chat from Fenrir Connect off.` }))];
  const srv = (d.servers || [])[0] || {};
  const live = isLive(srv);
  const u = uiOf(l.id);
  const box = chatBox(l, s);
  requestAnimationFrame(() => { box.scrollTop = u.chatEnd === false && u.chatTop != null ? u.chatTop : box.scrollHeight; });
  const input = field('chat-' + l.id, { placeholder: live ? 'Say something to everyone' : 'The world is off', maxlength: 200, enterkeyhint: 'send', disabled: !live, 'aria-label': 'Chat message' });
  const btn = el('button', { class: 'icon-btn accent', 'aria-label': 'Send', disabled: !live }, svg('i-send'));
  const send = async () => {
    const text = input.value.trim(); if (!text) return;
    const r = await friendAct(l, 'chat', { text }, btn);
    if (r && r.ok) { input.value = ''; clearDraft('chat-' + l.id); u.chatEnd = true; app.refresh(l).then(() => app.render()); }  // render() writes the new line in, focus or not
  };
  btn.addEventListener('click', send); input.addEventListener('keydown', (e) => { if (e.key === 'Enter') send(); });
  return [el('section', { class: 'card chat-card' },
    el('div', { class: 'chat-head' }, el('p', { class: 'kicker', text: 'World chat' }),
      el('span', { class: 'pill ' + (live ? 'on' : ''), 'data-live': 'chatpill', text: chatPill(srv) })),
    box, el('div', { class: 'field' }, input, btn),
    el('p', { class: 'hint', text: 'Everyone in the game sees your lines, with the [Fenrir Connect] tag before your name.' }))];
}
function hueOf(name) { let h = 0; for (const ch of String(name || '')) h = (h * 31 + ch.charCodeAt(0)) % 360; return h; }
const chatPill = (srv) => isLive(srv) ? `${plural(srv.players || 0, 'player', 'players')} in the world` : 'the world is off';
function chatLine(x, me) {
  return el('div', { class: 'ln' + (x.event ? ' ev' + (x.event === 'died' ? ' death' : '') : '') + (!x.event && x.who && x.who.toLowerCase() === me ? ' me' : '') },
    el('time', { text: hhmm(x.t) }),
    x.event ? el('span', { text: `${x.who} ${x.event === 'joined' ? 'joined the world' : x.event === 'left' ? 'left the world' : x.event === 'advancement' ? 'made the advancement ' + (x.text || '') : x.text || x.event}` })
            : el('span', null, el('b', { class: 'who-name', text: x.who, style: { '--h': String(hueOf(x.who)) } }), ' ', el('span', { text: x.text })));
}
function chatBox(l, s) {
  const u = uiOf(l.id);
  if (!u.chatBox) {
    const box = el('div', { class: 'chat', role: 'log', 'aria-label': 'World chat' });
    box.addEventListener('scroll', () => { u.chatEnd = box.scrollHeight - box.scrollTop - box.clientHeight < 30; u.chatTop = box.scrollTop; }, { passive: true });
    u.chatBox = box;
  }
  fillChat(l, s);
  return u.chatBox;
}
function fillChat(l, s) {
  const u = uiOf(l.id), box = u.chatBox;
  if (!box) return;
  const lines = (((s.d || {}).chat || {}).lines || []).slice(-60);
  const sig = JSON.stringify(lines.map((x) => [x.t, x.who, x.text, x.event]));
  if (sig === u.chatSig) return;
  u.chatSig = sig;
  const atEnd = u.chatEnd !== false, me = (l.friend || '').toLowerCase();
  box.replaceChildren(...(lines.length ? lines.map((x) => chatLine(x, me)) : [el('div', { class: 'ln ev', text: 'Nothing said yet.' })]));
  if (atEnd && box.isConnected) box.scrollTop = box.scrollHeight;
}

/* ---------- you ---------- */
function youTab(l, s) {
  const d = s.d || {};
  if (!s.d || d.gone || s.err) return [hero(l, s)];
  const host = hostOf(l, s);
  const y = d.you || null;
  const name = (y && y.name) || l.friend || 'You';
  const out = [el('section', { class: 'card profile' },
    face(name, 'big'),
    el('div', { class: 'grow' }, el('h2', { text: name }), el('p', { class: 'muted small', text: y ? 'Your name in the game' : `Your key in ${host}’s world` })),
    y ? el('div', { class: 'stats' },
      el('div', { class: 'stat' }, el('small', { text: 'This week' }), y.seconds ? el('b', null, hours(y.seconds)[0], el('span', { class: 'u', text: hours(y.seconds)[1] })) : el('b', { text: '–' })),
      el('div', { class: 'stat' }, el('small', { text: 'Sessions' }), el('b', { text: String(y.sessions || 0) })),
      el('div', { class: 'stat' }, el('small', { text: 'Deaths' }), el('b', { text: String(y.deaths || 0) }))) : null,
    y && y.last ? el('p', { class: 'hint', text: `Last time in the world: ${new Date(y.last.end * 1000).toLocaleString([], { weekday: 'long', hour: 'numeric', minute: '2-digit' })}.` }) : null)];
  const asks = (d.asks || []).slice(-3).reverse();
  out.push(card(`Need a hand from ${host}?`,
    el('div', { class: 'hand' }, ASK.map(([kind, label, icon]) => el('button', { class: 'btn hand-btn', onclick: () => askHand(l, s, kind) }, svg(icon), label))),
    asks.length ? el('div', { class: 'items' }, asks.map((a) => el('div', { class: 'item' },
      el('span', { class: 'tick ' + (a.done ? 'ok' : 'warn'), 'aria-hidden': 'true' }),
      el('div', { class: 'grow' }, el('div', { class: 't plain', text: a.done ? `${host} answered: ${a.reply || 'done.'}` : `Waiting for ${host}` }),
        el('div', { class: 's' }, `${(ASK.find((x) => x[0] === a.kind) || [0, a.kind])[1]}${a.note ? ` · “${a.note}”` : ''} · `, el('time', { 'data-t': String(a.t), text: ago(a.t) })))))) : null));
  const gal = d.gallery || [];
  out.push(card(gal.length ? `Screenshots · ${gal.length}` : 'Screenshots',
    gal.length ? el('div', { class: 'shots' }, gal.map((g) => {
      const src = urls.gallery(l, g.file), cap = `${g.friend}${g.caption ? ' · ' + g.caption : ''}`;
      return el('button', { class: 'shot', 'aria-label': `Open ${g.friend}’s picture${g.caption ? ': ' + g.caption : ''}`, onclick: () => viewer(src, cap) },
        el('img', { src, alt: '', loading: 'lazy', decoding: 'async' }), el('span', { text: cap }));
    })) : el('p', { class: 'muted small', text: 'Pictures everyone shares from the game show here.' }),
    el('div', { class: 'actions' }, el('button', { class: 'btn grow', onclick: () => sharePicture(l, s) }, svg('i-image'), 'Share a picture'))));
  return out;
}

/* ---------- tools ---------- */
function toolsTab(l, s, more) {
  const d = s.d || {};
  if (!s.d || d.gone || s.err) return [hero(l, s), linkRows(l, more)];
  const srv = (d.servers || [])[0] || {};
  const conn = el('p', { class: 'g-out', role: 'status' });
  const pack = ((s.names || {}).servers || []).find((x) => x.id === srv.id) || ((s.names || {}).servers || [])[0];
  return [
    group('Playing', [
      pack ? row({ icon: 'i-box', tone: 'ice', title: 'The pack', sub: [pack.name, [pack.loader, pack.mc].filter(Boolean).join(' '), pack.mods ? `${pack.mods} mods` : '', pack.totalBytes ? size(pack.totalBytes / 1048576) : ''].filter(Boolean).join(' · ') }) : null,
      row({ icon: 'i-pin', tone: 'teal', title: 'Address to join', sub: srv.address || 'Your host has not shared one yet', trail: srv.address ? el('button', { class: 'btn small', onclick: (e) => copy(srv.address, e.currentTarget) }, 'Copy') : null }),
      d.map ? row({ icon: 'i-map', tone: 'green', title: 'World map', sub: 'The world from above, live', onclick: () => more.openUrl(urls.map(l)) }) : null,
      row({ icon: 'i-image', tone: 'violet', title: 'Share a picture', sub: 'Into the world’s screenshots', onclick: () => sharePicture(l, s) }),
    ]),
    group('Connection', [
      row({ icon: 'i-bolt', tone: 'amber', title: 'Test the connection', sub: `How fast ${hostOf(l, s)}’s Fenrir answers this phone`, trail: el('button', { class: 'btn small', onclick: (e) => testConnection(l, e.currentTarget, conn) }, 'Test') }),
      conn,
    ]),
    linkRows(l, more),
  ];
}

export function friendScreen(l, s, tab, more) {
  if (tab === 'chat') return chatTab(l, s);
  if (tab === 'you') return youTab(l, s);
  if (tab === 'tools') return toolsTab(l, s, more);
  return worldTab(l, s);
}
export function friendSig(l, s, tab) {
  const d = s.d || {}, names = s.names || {};
  const worlds = (d.servers || []).map((x) => [x.id, x.online, x.ready, x.players, x.names, x.address]);  // not the TPS: it is written in place
  const base = [!!s.err, !!d.gone, worlds, d.maintenance, d.wake, names.hostName, l.name];
  const pick = { chat: [(d.chat || {}).on], you: [d.you, d.asks, d.gallery], tools: [d.map, (names.servers || []).map((x) => [x.id, x.name, x.mods])] }[tab]
    || [d.note, d.horn, d.session, d.around, d.week, d.records, (names.servers || []).map((x) => x.name)];
  return JSON.stringify([base, pick]);
}
export function friendPatch(l, s) {
  const root = document.querySelector('.detail.friend');
  if (!root || !s.d || s.d.gone || s.err) return;
  const srv = (s.d.servers || [])[0] || {};
  const tps = root.querySelector('[data-live="ftps"]');
  if (tps) { tps.className = tpsClass(srv); tps.querySelector('b').textContent = tpsText(srv); }
  const pill = root.querySelector('[data-live="chatpill"]');
  if (pill) { pill.textContent = chatPill(srv); pill.className = 'pill ' + (isLive(srv) ? 'on' : ''); }
  fillChat(l, s);
  for (const e of root.querySelectorAll('time[data-t]')) e.textContent = ago(Number(e.dataset.t));
}
export function friendSubtitle(l, s) {
  return s.err ? 'Out of reach' : friendStatus(s.d).line;
}
