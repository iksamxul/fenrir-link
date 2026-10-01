/* Your own server, through Fenrir's phone remote: a dashboard, the players, the live console and the tools.
   Everything here is one of the remote's actions (core/remote.py ACTIONS) and lands on Fenrir's timeline as "Phone: …".
   A screen is drawn again only when what it shows changes (hostSig); the numbers that move every few seconds (TPS, tick,
   memory, the chart, uptime, task progress, "ago" times) are written into the drawn screen in place (hostPatch), so a
   poll never takes a button's busy state or a reader's focus away. */
import { app, uiOf } from './app.js';
import { getJSON, postJSON, urls } from './net.js';
import { askText, ago, busy, chart, clearDraft, confirmSheet, copy, el, face, field, gb, hhmm, hhmmss, plural, seg, size, span, svg, tap, toast, when } from './ui.js';

export const HOST_TABS = [['dash', 'Dashboard', 'i-gauge'], ['players', 'Players', 'i-users'], ['console', 'Console', 'i-term'], ['tools', 'Tools', 'i-tools']];
const now = () => Date.now() / 1000;

export function hostStatus(d) {
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
const online = (d) => d.status === 'running' && d.ready !== false;
const newer = (d) => 'perf' in d;  // a Fenrir from before the dashboard sends no history, lists, backups or console tail
const usable = (s) => s.d && !s.d.gone && !s.d.insecure && !s.err;
function updateNote(what) {
  return el('section', { class: 'card update-note' }, svg('i-warn'), el('p', { text: `Update Fenrir on the PC to see ${what} here. Everything else works as it is.` }));
}

/* ---------- actions ---------- */
export async function hostAct(l, action, body, btn, okText) {
  tap();
  const r = await busy(btn, () => postJSON(urls.act(l, action), body, { 'X-Fenrir-Remote': '1' }));
  if (r && r.ok) { tap('ok'); if (okText) toast(okText, 'ok'); } else { tap('bad'); toast((r && r.error) || 'That did not go through.', 'bad'); }
  app.refresh(l).then(() => app.render());
  return r;
}
async function power(l, action, btn) {
  const words = { start: ['Start the world?', 'Fenrir starts the server on the PC.', 'Start'], stop: ['Stop the server?', 'Everyone in the world is disconnected and the world is saved.', 'Stop'], restart: ['Restart the server?', 'Everyone is disconnected for a minute or two while it comes back.', 'Restart'] }[action];
  if (!(await confirmSheet(words[0], words[1], words[2], action !== 'start'))) return;
  tap();
  let r = await busy(btn, () => postJSON(urls.act(l, action), {}, { 'X-Fenrir-Remote': '1' }));
  if (r && !r.ok && r.playersOnline && r.playersOnline.length) {
    const who = r.playersOnline.join(', ');
    if (!(await confirmSheet(`${plural(r.playersOnline.length, 'friend is', 'friends are')} playing`, `${who} ${r.playersOnline.length === 1 ? 'is' : 'are'} in the world. ${action === 'stop' ? 'Stop' : 'Restart'} anyway?`, `${action === 'stop' ? 'Stop' : 'Restart'} anyway`, true))) { app.refresh(l).then(() => app.render()); return; }
    r = await busy(btn, () => postJSON(urls.act(l, action), { force: true }, { 'X-Fenrir-Remote': '1' }));
  }
  if (r && r.ok) { tap('ok'); toast(action === 'start' ? 'Starting the world' : action === 'stop' ? 'Stopping the server' : 'Restarting the server', 'ok'); }
  else { tap('bad'); toast((r && r.error) || 'That did not go through.', 'bad'); }
  app.refresh(l).then(() => app.render());
}
async function kick(l, name, btn) {
  if (await confirmSheet(`Kick ${name}?`, `${name} leaves the world now and can join again.`, 'Kick', true)) await hostAct(l, 'kick', { name }, btn, `${name} was kicked`);
}
async function whisper(l, name) {
  const text = await askText({ title: `Message ${name}`, text: 'Only they see it, in the game’s chat.', placeholder: 'Say something', okText: 'Send', maxlength: 200 });
  if (text) await hostAct(l, 'command', { text: `tell ${name} ${text}` }, null, `Sent to ${name}`);
}
async function command(l, text, btn) {
  const r = await hostAct(l, 'command', { text }, btn);
  consoleTick(l);
  return r;
}
async function editNote(l, d) {
  const r = await askText({ title: 'Note to friends', text: 'One line every friend sees in Fenrir Connect and Fenrir Link. Leave it empty to take it down.', value: d.note || '',
    placeholder: 'Boss fight at 9!', okText: 'Save', maxlength: 500, allowEmpty: true, extra: [{ id: 'horn', label: 'Save and notify everyone' }] });
  if (r == null) return;
  const text = typeof r === 'object' ? r.text : r;
  const res = await hostAct(l, 'note', { text }, null, typeof r === 'object' ? null : text ? 'Note saved' : 'Note taken down');
  if (typeof r === 'object' && res && res.ok) {
    if (text) await hostAct(l, 'horn', {}, null, 'Saved, and every friend gets a notification');
    else toast('Note taken down', 'ok');
  }
}
async function answerAsk(l, a) {
  const reply = await askText({ title: `Answer ${a.name}`, text: 'A line for their Fenrir Connect, or leave it empty to mark it done.', placeholder: 'Your things are back. Have a look.', okText: 'Mark done', maxlength: 200, allowEmpty: true });
  if (reply != null) await hostAct(l, 'ask-done', { id: a.id, reply }, null, `${a.name} hears back in Fenrir Connect`);
}

/* ---------- what moves every few seconds, worked out the same way for drawing and for writing in place ---------- */
function heroSub(s) {
  const d = s.d || {};
  return s.err ? 'Fenrir is not answering. The PC may be off, asleep or restarting.'
    : d.gone ? 'The remote was turned off or given a new key. Scan the new code from Fenrir’s Dashboard.'
    : d.insecure ? 'Fenrir only answers its remote over a secure address. Turn on Cloudflare or Tailscale in Network & Cloud, then scan the new code.'
    : d.status === 'running' && d.startedAt ? `${d.pack || 'Your world'} · up ${span(now() - d.startedAt)}` : (d.pack || '');
}
function stats(d) {
  const running = d.status === 'running' || d.status === 'starting', perf = d.perf || {};
  const tps = d.tps != null ? Number(d.tps) : null;
  const mem = perf.rssMB != null && running;
  return {
    tps: [tps != null ? tps.toFixed(1) : '–', tps != null && running ? (tps < 10 ? 'bad' : tps < 15 ? 'warn' : '') : '', ''],
    mspt: [d.mspt != null ? String(Math.round(d.mspt)) : '–', d.mspt > 50 ? 'warn' : '', d.mspt != null ? 'ms' : ''],
    mem: [mem ? gb(perf.rssMB).replace(' GB', '') : '–', '', mem ? 'GB' : ''],
  };
}
function stat(label, value, tone, unit, live) {
  return el('div', { class: 'stat' + (tone ? ' ' + tone : ''), 'data-live': live || null }, el('small', { text: label }), el('b', null, value, unit ? el('span', { class: 'u', text: unit }) : null));
}
function setStat(e, [value, tone, unit]) {
  e.className = 'stat' + (tone ? ' ' + tone : '');
  e.querySelector('b').replaceChildren(value, ...(unit ? [el('span', { class: 'u', text: unit })] : []));
}
const METRICS = {
  tps: { label: 'TPS', of: (p) => p.tps, opts: { min: 0, max: 20, digits: 1, warnBelow: 15 }, what: 'Ticks per second: 20 is a smooth world, under 15 players feel lag.' },
  mspt: { label: 'Tick', of: (p) => p.mspt, opts: { min: 0, max: 60, unit: ' ms', warnAbove: 50 }, what: 'Time each tick takes: under 50 ms keeps up.' },
  mem: { label: 'Memory', of: (p) => (p.rssMB != null ? p.rssMB / 1024 : null), opts: { min: 0, unit: ' GB', digits: 1 }, what: 'What the server uses on the PC.' },
  players: { label: 'Players', of: (p) => p.players, opts: { min: 0, max: 4 }, what: 'Players in the world.' },
};
function chartOf(l, d) {
  const u = uiOf(l.id), key = METRICS[u.metric] ? u.metric : 'tps', m = METRICS[key];
  const opts = { ...m.opts, label: `${m.label} over the last half hour` };
  if (key === 'mem' && d.perf && d.perf.heapGB) opts.max = Number(d.perf.heapGB);
  return chart(((d.perf || {}).points || []).map((p) => ({ t: p.t, v: m.of(p) })), opts);
}
const pct = (t) => Math.round(t.pct || 0);

/* ---------- dashboard ---------- */
function hero(l, s) {
  const d = s.d || {};
  const st = s.err ? { cls: 'bad', title: 'Out of reach' } : hostStatus(s.d);
  const ok = usable(s);
  const running = d.status === 'running' || d.status === 'starting';
  const sub = heroSub(s), v = stats(d);
  const soon = d.restartAt && d.restartAt > now() ? d.restartAt : null;  // the automatic restart a few seconds after a crash or a Restart
  const planned = d.nextRestart && d.nextRestart - now() < 7200 && d.nextRestart > now() ? d.nextRestart : null;
  return el('section', { class: 'card hero' },
    el('div', { class: 'state' }, el('span', { class: 'dot ' + st.cls }), el('h2', { text: st.title })),
    sub ? el('p', { class: 'sub', text: sub, 'data-live': 'sub' }) : null,
    ok ? el('div', { class: 'stats four' },
      stat('Playing', String((d.players || []).length)),
      stat('TPS', ...v.tps, 'tps'), stat('Tick', ...v.mspt, 'mspt'), stat('Memory', ...v.mem, 'mem')) : null,
    d.crashLoop ? note('bad', 'It crashed several times in a row, so Fenrir stopped restarting it. Check the console, then start it again.') : null,
    d.frozen ? note('bad', 'The world stopped answering. Fenrir restarts it on its own if you allowed that; otherwise restart it here.') : null,
    soon ? note('info', 'It starts again in a few seconds.') : planned ? note('info', `It restarts at ${hhmm(planned)}, as planned.`) : null,
    d.doctor ? note(d.doctor.severity === 'error' ? 'bad' : 'warn', `The Doctor found: ${d.doctor.title}${d.doctor.more ? ` (and ${d.doctor.more} more)` : ''}. Open Fenrir on the PC to fix it.`) : null,
    ok ? el('div', { class: 'actions' },
      running ? [el('button', { class: 'btn grow', onclick: (e) => power(l, 'restart', e.currentTarget) }, svg('i-restart'), 'Restart'),
                 el('button', { class: 'btn grow danger', onclick: (e) => power(l, 'stop', e.currentTarget) }, svg('i-stop'), 'Stop')]
              : el('button', { class: 'btn primary grow', onclick: (e) => power(l, 'start', e.currentTarget) }, svg('i-play', 'i fill'), 'Start the world')) : null);
}
function note(tone, text) {
  return el('div', { class: 'note ' + tone }, svg(tone === 'info' ? 'i-clock' : 'i-warn'), el('span', { text }));
}
function card(kicker, ...kids) {
  return el('section', { class: 'card' }, kicker ? el('p', { class: 'kicker', text: kicker }) : null, ...kids);
}
function perfCard(l, d) {
  const u = uiOf(l.id), key = METRICS[u.metric] ? u.metric : 'tps';
  return card('Last half hour',
    seg('Chart', Object.entries(METRICS).map(([k, x]) => [k, x.label]), key, (v) => { u.metric = v; app.render(); }),
    el('div', { class: 'chart-wrap ' + key, 'data-live': 'chart' }, chartOf(l, d)),
    el('p', { class: 'hint', text: METRICS[key].what }));
}
function dash(l, s) {
  const d = s.d || {};
  const out = [hero(l, s)];
  if (!usable(s)) return out;
  const wake = d.wake || [];
  if (wake.length) {
    const names = wake.map((w) => (typeof w === 'string' ? w : w.name || w.friend)).filter(Boolean);
    out.push(el('section', { class: 'card attention' },
      el('p', { class: 'kicker', text: 'Asking to play' }),
      el('h2', { text: names.length ? `${names.join(', ')} ${names.length === 1 ? 'wants' : 'want'} to play` : 'A friend wants to play' }),
      el('div', { class: 'actions' },
        el('button', { class: 'btn primary grow', onclick: (e) => hostAct(l, 'wake-start', {}, e.currentTarget, 'Starting the world') }, svg('i-play', 'i fill'), 'Start the world'),
        el('button', { class: 'btn grow', onclick: (e) => hostAct(l, 'wake-dismiss', {}, e.currentTarget, 'They were told not now') }, 'Not now'))));
  }
  const asks = d.asks || [];
  if (asks.length) {
    out.push(card(`Needs a hand · ${asks.length}`, el('div', { class: 'items' }, asks.map((a) => el('div', { class: 'item ask' },
      face(a.username || a.name),
      el('div', { class: 'grow' }, el('div', { class: 't', text: `${a.name} ${a.what || a.kind}` }),
        el('div', { class: 's' }, a.note ? `“${a.note}” · ` : '', el('time', { 'data-t': String(a.t), text: ago(a.t) }))),
      el('div', { class: 'ask-actions' },
        a.kind === 'login' && a.username ? el('button', { class: 'btn small primary', onclick: (e) => hostAct(l, 'ask-whitelist', { id: a.id }, e.currentTarget, `${a.username} is on the whitelist`) }, 'Put on the whitelist') : null,
        el('button', { class: 'btn small', onclick: () => answerAsk(l, a) }, a.kind === 'login' && a.username ? 'Answer' : 'Answer and mark done')))))));
  }
  if (newer(d) && (d.status === 'running' || ((d.perf || {}).points || []).length)) out.push(perfCard(l, d));
  const players = d.players || [], playing = d.playing || {};
  out.push(card(players.length ? `In the world · ${players.length}` : 'In the world',
    players.length ? el('div', { class: 'people' }, players.map((p) => el('div', { class: 'person' }, face(p),
      el('div', { class: 'grow' }, el('b', { text: p }), playing[p] ? el('span', { 'data-since': String(playing[p]), 'data-fmt': 'for ', text: 'for ' + span(now() - playing[p]) }) : null))))
      : el('p', { class: 'muted small', text: online(d) ? 'Nobody is on right now.' : 'The world is off.' }),
    el('button', { class: 'link-btn', onclick: () => app.go('detail', l.id, 'players') }, 'Players and the whitelist', svg('i-chevron'))));
  const tasks = d.tasks || [];  // the last quarter hour's: running ones with their progress, finished ones with how they ended
  if (tasks.length) {
    out.push(card('Working on', el('div', { class: 'items' }, tasks.map((t, i) => el('div', { class: 'item task', 'data-live': 'task-' + i },
      el('div', { class: 'grow' }, el('div', { class: 't', text: t.label }), el('div', { class: 's', text: t.error || t.detail || (t.status === 'running' ? 'Running' : 'Done') }),
        t.status === 'running' ? el('div', { class: 'bar', role: 'progressbar', 'aria-label': t.label, 'aria-valuenow': String(pct(t)), 'aria-valuemin': '0', 'aria-valuemax': '100' }, el('i', { style: { transform: `scaleX(${Math.min(1, pct(t) / 100)})` } })) : null),
      el('span', { class: 'pill ' + (t.status === 'running' ? 'wait' : t.error ? 'bad' : 'on'), text: t.status === 'running' ? `${pct(t)}%` : t.error ? 'failed' : 'done' }))))));
  }
  if (d.session && d.session.title) {
    const a = d.session.answers || {};
    out.push(card('Next game night', el('h2', { text: d.session.title }),
      el('p', { class: 'muted small', text: [d.session.when, d.session.weekly ? 'every week' : '', d.session.live ? 'on now' : ''].filter(Boolean).join(' · ') }),
      (a.in || []).length || (a.out || []).length ? el('p', { class: 'hint', text: ((a.in || []).length ? 'Coming: ' + a.in.join(', ') : 'Nobody has said yes yet.') + ((a.out || []).length ? ' · Not coming: ' + a.out.join(', ') : '') }) : null));
  }
  const acts = d.activity || [];
  if (acts.length) {
    const u = uiOf(l.id), shown = u.more ? acts : acts.slice(0, 5);
    out.push(card('Recently', el('div', { class: 'items' }, shown.map((a) => el('div', { class: 'item' },
      el('span', { class: 'tick ' + (a.level || 'info'), 'aria-hidden': 'true' }), el('div', { class: 'grow' }, el('div', { class: 't plain', text: a.text })), el('time', { 'data-t': String(a.t), text: ago(a.t) })))),
      acts.length > 5 ? el('button', { class: 'link-btn', onclick: () => { u.more = !u.more; app.render(); } }, u.more ? 'Show less' : `Show all ${acts.length}`) : null));
  }
  return out;
}

/* ---------- players ---------- */
function players(l, s) {
  const d = s.d || {};
  if (!usable(s)) return [hero(l, s)];
  const list = d.players || [], playing = d.playing || {}, ops = new Set((d.ops || []).map((x) => x.toLowerCase()));
  const wl = d.whitelist || { on: false, names: [] };
  const out = [card(list.length ? `In the world · ${list.length}` : 'In the world',
    list.length ? el('div', { class: 'items' }, list.map((p) => el('div', { class: 'item' }, face(p),
      el('div', { class: 'grow' }, el('div', { class: 't' }, el('span', { text: p }), ops.has(p.toLowerCase()) ? el('span', { class: 'tag', text: 'operator' }) : null),
        el('div', { class: 's', 'data-since': playing[p] ? String(playing[p]) : null, 'data-fmt': 'playing for ', text: playing[p] ? `playing for ${span(now() - playing[p])}` : 'playing' })),
      el('button', { class: 'icon-btn', 'aria-label': `Message ${p}`, title: 'Message', onclick: () => whisper(l, p) }, svg('i-chat')),
      el('button', { class: 'icon-btn danger', 'aria-label': `Kick ${p}`, title: 'Kick', onclick: (e) => kick(l, p, e.currentTarget) }, svg('i-exit')))))
      : el('p', { class: 'muted small', text: online(d) ? 'Nobody is on right now.' : 'The world is off.' }))];
  const add = field('wl-' + l.id, { placeholder: 'Minecraft name', maxlength: 16, autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false', enterkeyhint: 'done', 'aria-label': 'Name to put on the whitelist' });
  const addBtn = el('button', { class: 'btn small primary' }, 'Add');
  const doAdd = async () => {
    const name = add.value.trim();
    if (!/^[A-Za-z0-9_]{3,16}$/.test(name)) { toast('Minecraft names are 3 to 16 letters, digits or _.', 'bad'); tap('bad'); return; }
    const r = await hostAct(l, 'whitelist-add', { name }, addBtn, `${name} can join`);
    if (r && r.ok) { add.value = ''; clearDraft('wl-' + l.id); add.blur(); }  // done: let the list show the new name (the screen waits while a field has focus)
  };
  addBtn.addEventListener('click', doAdd); add.addEventListener('keydown', (e) => { if (e.key === 'Enter') doAdd(); });
  if (!d.whitelist) out.push(updateNote('the whitelist'));
  else {
    out.push(card(`Whitelist · ${wl.names.length}`,
      el('p', { class: 'muted small', text: wl.on ? 'On: only these names can join.' : 'Off: anyone with the address can join. Turn it on in Fenrir on the PC if you want a guest list.' }),
      wl.names.length ? el('div', { class: 'chips' }, wl.names.map((n) => el('span', { class: 'chip' }, face(n, 'mini'), el('span', { text: n }),
        el('button', { 'aria-label': `Take ${n} off the whitelist`, onclick: async (e) => {
          const btn = e.currentTarget;  // read before the sheet: the event's target is gone once it has been awaited
          if (await confirmSheet(`Take ${n} off the whitelist?`, wl.on ? `${n} can no longer join. Put them back any time.` : 'The whitelist is off, so this matters once it is on.', 'Take off', true)) hostAct(l, 'whitelist-remove', { name: n }, btn, `${n} is off the whitelist`);
        } }, svg('i-x', 'i sm'))))) : null,
      el('div', { class: 'field' }, add, addBtn)));
  }
  const friends = d.friends || [];
  if (friends.length) {
    out.push(card('Friends with a key', el('div', { class: 'items' }, friends.map((f) => {
      const state = f.inGame ? ['playing', 'on'] : f.state === 'installing' || f.state === 'updating' ? [`${f.state === 'updating' ? 'updating' : 'installing'}${f.progress != null ? ' ' + Math.round(f.progress) + '%' : ''}`, 'wait'] : f.appOpen ? ['in Fenrir Connect', ''] : [f.lastSeen ? 'seen ' + ago(f.lastSeen) : 'not seen yet', ''];
      return el('div', { class: 'item' }, face(f.username || f.name),
        el('div', { class: 'grow' }, el('div', { class: 't', text: f.username || f.name }), f.username && f.name && f.username !== f.name ? el('div', { class: 's', text: 'key for ' + f.name }) : null),
        el('span', { class: 'pill ' + state[1], text: state[0] }));
    }))));
  }
  if ((d.ops || []).length) out.push(card('Operators', el('p', { class: 'muted small', text: 'They can run every command in the game. Change this in Fenrir on the PC.' }), el('div', { class: 'chips' }, d.ops.map((n) => el('span', { class: 'chip plain' }, face(n, 'mini'), el('span', { text: n }))))));
  return out;
}

/* ---------- console ---------- */
const LINE = /^\[(\d\d:\d\d:\d\d)\]\s*\[([^\]]*?)\/(INFO|WARN|ERROR|FATAL|DEBUG)\](?:\s*\[[^\]]*\])?:\s?(.*)$/;
function sortLine(e) {
  let text = e.line, level = '';
  const m = LINE.exec(text);
  if (m) { level = m[3]; text = m[4]; }
  text = text.replace(/^\[Not Secure\] /, '');  // chat that is not signed: true of every offline-mode server, so it says nothing here
  const chat = /^<[^>]{1,32}> /.test(text) || /^\[Connect\] /.test(text);
  const type = e.kind === 'input' ? 'input' : chat ? 'chat' : e.kind === 'system' ? 'fenrir' : level === 'WARN' ? 'warn' : (level === 'ERROR' || level === 'FATAL') ? 'error' : 'info';
  return { text, type };
}
function lineRow(e) {
  const { text, type } = sortLine(e);
  // Fenrir logs what was typed as "> cmd"; the phone shows it as the command it was: "› /cmd"
  return el('div', { class: 'ln t-' + type }, el('time', { text: hhmmss(e.t) }), el('span', { text: type === 'input' ? '› ' + text.replace(/^>\s?/, '').replace(/^\/?/, '/') : text }));
}
function term(l) {
  const u = uiOf(l.id);
  if (!u.term) {
    u.term = el('div', { class: 'term', role: 'log', 'aria-label': 'Server console', tabindex: '0' });
    u.term.addEventListener('scroll', () => {
      u.atEnd = u.term.scrollHeight - u.term.scrollTop - u.term.clientHeight < 40;
      u.top = u.term.scrollTop;
      if (u.atEnd && u.newer) { u.newer.hidden = true; }
    }, { passive: true });
    for (const e of (u.lines || [])) u.term.append(lineRow(e));
    if (!(u.lines || []).length) u.term.append(el('div', { class: 'ln t-info empty', text: 'Waiting for the console…' }));
  }
  u.term.dataset.filter = u.filter || 'all';
  return u.term;
}
export async function consoleTick(l) {
  const u = uiOf(l.id);
  if (u.legacy) { legacyLines(l); return; }  // asked once: an older Fenrir has no tail to ask for
  if (u.asking) return;  // one question at a time: two answers to the same "after" would show their lines twice
  u.asking = true;
  let r;
  try { r = await getJSON(urls.log(l, u.last || 0), 8000); } catch (_) { return; } finally { u.asking = false; }
  if (r && r.gone) { u.legacy = true; legacyLines(l); app.render(); return; }  // an older Fenrir: no tail route, only the lines its state carries
  if (!r || r.insecure || !Array.isArray(r.lines)) return;
  if (u.last && r.top != null && r.top < u.last) { u.last = 0; u.lines = []; if (u.term) u.term.replaceChildren(); return; }  // Fenrir restarted: its lines start again from one
  const fresh = r.lines.filter((e) => e.n > (u.last || 0));
  if (!fresh.length) return;
  u.lines = (u.lines || []).concat(fresh).slice(-1500);
  u.last = Math.max(u.last || 0, r.last || 0);
  if (!u.term) return;
  const t = u.term, atEnd = u.atEnd !== false;
  const empty = t.querySelector('.empty'); if (empty) empty.remove();
  for (const e of fresh) t.append(lineRow(e));
  while (t.childElementCount > 1500) t.firstElementChild.remove();
  if (atEnd) t.scrollTop = t.scrollHeight;
  else if (u.newer) u.newer.hidden = false;
}
function legacyLines(l) {
  const u = uiOf(l.id), s = app.live.get(l.id) || {}, rows = ((s.d || {}).console || []);
  if (!u.term) return;
  const sig = JSON.stringify(rows.map((e) => [e.t, e.line]));
  if (sig === u.legacySig) return;
  u.legacySig = sig;
  u.term.replaceChildren(...rows.map(lineRow));
  u.term.scrollTop = u.term.scrollHeight;
}
const QUICK = [['List players', 'list'], ['Save the world', 'save-all'], ['Make it day', 'time set day'], ['Clear the weather', 'weather clear']];
function consoleTab(l, s) {
  const d = s.d || {};
  if (!usable(s)) return [hero(l, s)];
  const u = uiOf(l.id);
  const t = term(l);
  u.newer = el('button', { class: 'newer', hidden: true, onclick: () => { t.scrollTop = t.scrollHeight; u.newer.hidden = true; } }, 'Newer lines', svg('i-down'));
  requestAnimationFrame(() => { t.scrollTop = u.atEnd === false && u.top != null ? u.top : t.scrollHeight; });
  const input = field('cmd-' + l.id, { placeholder: online(d) ? 'Type a command' : 'The server is off', maxlength: 300, autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false', enterkeyhint: 'send', 'aria-label': 'Console command' });
  const send = el('button', { class: 'icon-btn accent', 'aria-label': 'Run the command' }, svg('i-send'));
  const run = async () => {
    const text = input.value.trim().replace(/^\//, '');
    if (!text) return;
    const r = await command(l, text, send);
    if (r && r.ok) { input.value = ''; clearDraft('cmd-' + l.id); u.atEnd = true; }
  };
  send.addEventListener('click', run); input.addEventListener('keydown', (e) => { if (e.key === 'Enter') run(); });
  return [el('section', { class: 'card console-card' },
    el('div', { class: 'console-head' }, el('p', { class: 'kicker', text: 'Console' }),
      seg('Show', [['all', 'All'], ['chat', 'Chat'], ['problems', 'Issues'], ['fenrir', 'Fenrir']], u.filter || 'all', (v) => { u.filter = v; t.dataset.filter = v; app.render(); })),
    el('div', { class: 'term-wrap' }, t, u.newer),
    el('div', { class: 'quick', role: 'group', 'aria-label': 'Quick commands' }, QUICK.map(([label, cmd]) => el('button', { class: 'chip-btn', disabled: !online(d), onclick: (e) => command(l, cmd, e.currentTarget) }, label))),
    el('div', { class: 'field cmd' }, el('span', { class: 'slash', 'aria-hidden': 'true', text: '/' }), input, send),
    online(d) ? null : el('p', { class: 'hint', text: 'Commands reach the server once it runs.' }),
    u.legacy ? el('p', { class: 'hint', text: 'Update Fenrir on the PC for the whole console, live. Until then this shows the important lines.' }) : null)];
}

/* ---------- tools ---------- */
export function row({ icon, tone, title, sub, trail, onclick, label }) {
  const inner = [el('span', { class: 'g-ic ' + (tone || 'ice'), 'aria-hidden': 'true' }, svg(icon)), el('span', { class: 'g-tx' }, el('b', { text: title }), sub ? el('span', { text: sub }) : null)];
  if (onclick && !trail) return el('button', { class: 'g-row tap', onclick, 'aria-label': label || null }, inner, svg('i-chevron', 'i chev'));
  return el('div', { class: 'g-row' }, inner, trail || null);
}
export function group(title, rows, extra) {
  return el('section', { class: 'group' }, el('p', { class: 'kicker', text: title }), el('div', { class: 'g-list' }, rows.filter(Boolean)), extra || null);
}
export async function testConnection(l, btn, out) {
  const times = [];
  await busy(btn, async () => {
    for (let i = 0; i < 3; i++) {
      const t0 = performance.now();
      try { const d = await getJSON(urls.state(l), 8000); if (!d.gone && !d.insecure) times.push(performance.now() - t0); } catch (_) { /* counted as a miss */ }
    }
  });
  times.sort((a, b) => a - b);
  const ms = times.length ? Math.round(times[Math.floor(times.length / 2)]) : null;
  out.textContent = ms == null ? 'No answer. The PC may be off, asleep, or its address changed.' : `Answers in ${ms} ms${times.length < 3 ? `, ${3 - times.length} of 3 tries missed` : ''}.${ms > 900 ? ' That is slow: the PC or its connection is busy.' : ''}`;
  out.className = 'g-out ' + (ms == null ? 'bad' : ms > 900 ? 'warn' : 'on');
  tap(ms == null ? 'bad' : 'ok');
}
export function linkRows(l, more) {
  if (more.web) {  // the page Fenrir serves: nothing to rename or forget, its address is the key
    return group('This page', [
      more.standalone() ? null : row({ icon: 'i-plus', tone: l.kind === 'host' ? 'ice' : 'teal', title: 'Put it on your home screen', sub: 'It opens like an app, with no store and no download', onclick: () => more.install() }),
      row({ icon: 'i-open', tone: 'gray', title: 'Fenrir Link for Android', sub: 'The app keeps every world you link in one place', onclick: () => more.openUrl('https://iksamxul.github.io/fenrir/link') }),
    ]);
  }
  return group('This link', [
    row({ icon: 'i-edit', tone: 'gray', title: 'Rename', sub: l.name, onclick: () => more.rename(l) }),
    row({ icon: 'i-open', tone: 'gray', title: l.kind === 'host' ? 'Open the full remote' : 'Open your live page', sub: 'The phone page, in the browser', onclick: () => more.open(l) }),
    row({ icon: 'i-trash', tone: 'red', title: 'Remove this link', sub: 'This phone forgets the key', onclick: () => more.remove(l) }),
  ]);
}
const WAKE = { off: 'Friends cannot start it from Fenrir Connect: you start it yourself.', ask: 'Friends ask, you get a notice and start it.', auto: 'Friends start it themselves when the PC has room.' };
function tools(l, s, more) {
  const d = s.d || {};
  if (!usable(s)) return [hero(l, s), linkRows(l, more)];
  const u = uiOf(l.id);
  const b = d.backups || { count: 0, recent: [] }, last = (b.recent || [])[0];
  const run = online(d);
  const cmdBtn = (label, cmd, ok) => el('button', { class: 'btn small', disabled: !run, onclick: (e) => hostAct(l, 'command', { text: cmd }, e.currentTarget, ok) }, label);
  const conn = el('p', { class: 'g-out', role: 'status' });
  const say = field('say-' + l.id, { placeholder: run ? 'Say something to everyone' : 'Messages reach the world while it runs', maxlength: 200, enterkeyhint: 'send', disabled: !run, 'aria-label': 'Message everyone' });
  const sayBtn = el('button', { class: 'icon-btn accent', 'aria-label': 'Send to everyone', disabled: !run }, svg('i-send'));
  const sendSay = async () => { const text = say.value.trim(); if (!text) return; const r = await hostAct(l, 'say', { text }, sayBtn, 'Sent to everyone'); if (r && r.ok) { say.value = ''; clearDraft('say-' + l.id); } };
  sayBtn.addEventListener('click', sendSay); say.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendSay(); });
  const tier = { recent: 'recent', daily: 'daily', weekly: 'weekly' };
  if (!newer(d)) {
    return [group('The world', [row({ icon: 'i-box', title: 'Back up now', sub: 'Fenrir writes a backup of the world', trail: el('button', { class: 'btn small primary', onclick: (e) => hostAct(l, 'backup', {}, e.currentTarget, 'Backup started') }, 'Back up') }),
      row({ icon: 'i-save', tone: 'teal', title: 'Save the world', sub: 'Writes everything to disk now', trail: cmdBtn('Save', 'save-all', 'Saving the world') })]),
      updateNote('backups, the note to friends, who can start the world and the address'), linkRows(l, more)];
  }
  return [
    group('The world', [
      row({ icon: 'i-box', title: 'Back up now', sub: b.running ? 'A backup is being written…' : last ? `Last one ${ago(last.modified)} · ${size(last.sizeMB)} · ${b.count} kept` : 'No backups yet',
        trail: el('button', { class: 'btn small primary', disabled: b.running, onclick: (e) => hostAct(l, 'backup', {}, e.currentTarget, 'Backup started') }, b.running ? 'Running' : 'Back up') }),
      (b.recent || []).length ? el('button', { class: 'g-row tap', 'aria-expanded': String(!!u.showBackups), onclick: () => { u.showBackups = !u.showBackups; app.render(); } },
        el('span', { class: 'g-ic gray', 'aria-hidden': 'true' }, svg('i-clock')), el('span', { class: 'g-tx' }, el('b', { text: 'Recent backups' }), el('span', { text: u.showBackups ? 'Restore one in Fenrir on the PC' : `The newest ${b.recent.length}` })), svg(u.showBackups ? 'i-up' : 'i-down', 'i chev')) : null,
      u.showBackups ? el('div', { class: 'g-sub' }, (b.recent || []).map((x) => el('div', { class: 'item' },
        el('div', { class: 'grow' }, el('div', { class: 't plain', text: when(x.modified) }), x.note ? el('div', { class: 's', text: x.note }) : null),
        el('span', { class: 'muted small num', text: size(x.sizeMB) }), x.tier ? el('span', { class: 'pill', text: tier[x.tier] || x.tier }) : null))) : null,
      row({ icon: 'i-save', tone: 'teal', title: 'Save the world', sub: 'Writes everything to disk now', trail: cmdBtn('Save', 'save-all', 'Saving the world') }),
      row({ icon: 'i-sun', tone: 'amber', title: 'Make it day', sub: 'Sets the time in every world', trail: cmdBtn('Day', 'time set day', 'It is day') }),
      row({ icon: 'i-cloud', tone: 'sky', title: 'Clear the weather', sub: 'No rain or thunder for a while', trail: cmdBtn('Clear', 'weather clear', 'The sky is clear') }),
    ]),
    group('Friends', [
      row({ icon: 'i-note', tone: 'teal', title: 'Note to friends', sub: d.note ? `“${d.note}”` : 'No note. Friends see it in Fenrir Connect and Fenrir Link.', onclick: () => editNote(l, d) }),
      d.horn && d.note && d.horn.text === d.note ? el('p', { class: 'g-out on', text: `Sent as a notification ${ago(d.horn.t)}.` }) : null,
      el('div', { class: 'g-row col' },
        el('div', { class: 'g-head' }, el('span', { class: 'g-ic violet', 'aria-hidden': 'true' }, svg('i-key')), el('span', { class: 'g-tx' }, el('b', { text: 'Who can start the world' }), el('span', { text: WAKE[d.wakeMode] || WAKE.ask }))),
        seg('Who can start the world', [['off', 'Only me'], ['ask', 'They ask'], ['auto', 'Anyone']], d.wakeMode || 'ask', (v) => hostAct(l, 'wake-mode', { mode: v }, null, 'Saved'))),
      el('div', { class: 'g-row col' },
        el('div', { class: 'g-head' }, el('span', { class: 'g-ic ice', 'aria-hidden': 'true' }, svg('i-chat')), el('span', { class: 'g-tx' }, el('b', { text: 'Message everyone' }), el('span', { text: 'A line in the game’s chat, from the server' }))),
        el('div', { class: 'field' }, say, sayBtn)),
    ]),
    group('Server', [
      row({ icon: 'i-pin', tone: 'ice', title: 'Address to join', sub: d.address || 'Not known yet', trail: d.address ? el('button', { class: 'btn small', onclick: (e) => copy(d.address, e.currentTarget) }, 'Copy') : null }),
      d.nextRestart ? row({ icon: 'i-restart', tone: 'violet', title: 'Daily restart', sub: `Next at ${when(d.nextRestart)}. Change it in Fenrir on the PC.` }) : null,
      row({ icon: 'i-bolt', tone: 'amber', title: 'Test the connection', sub: 'How fast Fenrir answers this phone', trail: el('button', { class: 'btn small', onclick: (e) => testConnection(l, e.currentTarget, conn) }, 'Test') }),
      conn,
      row({ icon: 'i-heart', tone: d.doctor ? (d.doctor.severity === 'error' ? 'red' : 'amber') : 'green', title: 'The Doctor', sub: d.doctor ? `${d.doctor.title}${d.doctor.more ? ` (and ${d.doctor.more} more)` : ''}` : 'Nothing to fix right now' }),
    ]),
    linkRows(l, more),
  ];
}

/* ---------- the screens, what decides whether one needs drawing again, and what is written into it in place ---------- */
export function hostScreen(l, s, tab, more) {
  if (tab === 'players') return players(l, s);
  if (tab === 'console') return consoleTab(l, s);
  if (tab === 'tools') return tools(l, s, more);
  return dash(l, s);
}
export function hostSig(l, s, tab) {
  const d = s.d || {}, u = uiOf(l.id);
  const base = [!!s.err, !!d.gone, !!d.insecure, d.status, d.ready, (d.players || []).length, !!d.frozen, !!d.crashLoop, l.name];
  const pick = {
    players: [d.players, d.playing, d.whitelist, d.ops, d.friends],
    console: [u.filter, u.legacy],
    tools: [d.backups, d.note, d.horn, d.wakeMode, d.address, d.doctor, d.nextRestart, u.showBackups],
  }[tab] || [d.players, newer(d), (d.perf || {}).points ? (d.perf.points.length > 1) : false, d.wake, d.asks, d.doctor, d.session,
    (d.tasks || []).map((t) => [t.label, t.status, t.error]), d.activity, d.restartAt && d.restartAt > now(), d.nextRestart, d.playing, d.pack, d.startedAt, u.metric, u.more];
  return JSON.stringify([base, pick]);
}
export function hostPatch(l, s) {
  const root = document.querySelector('.detail.host');
  if (!root || !usable(s)) return;
  const d = s.d, one = (key) => root.querySelector(`[data-live="${key}"]`);
  const sub = one('sub'); if (sub) sub.textContent = heroSub(s);
  const v = stats(d);
  for (const key of ['tps', 'mspt', 'mem']) { const e = one(key); if (e) setStat(e, v[key]); }
  const c = one('chart'); if (c) c.replaceChildren(chartOf(l, d));
  (d.tasks || []).forEach((t, i) => {
    const e = one('task-' + i); if (!e) return;
    const s2 = e.querySelector('.s'); if (s2) s2.textContent = t.error || t.detail || (t.status === 'running' ? 'Running' : 'Done');
    const bar = e.querySelector('.bar'); if (bar) { bar.setAttribute('aria-valuenow', String(pct(t))); bar.firstElementChild.style.transform = `scaleX(${Math.min(1, pct(t) / 100)})`; }
    const pill = e.querySelector('.pill'); if (pill && t.status === 'running') pill.textContent = `${pct(t)}%`;
  });
  for (const e of root.querySelectorAll('[data-since]')) e.textContent = (e.dataset.fmt || '') + span(now() - Number(e.dataset.since));
  for (const e of root.querySelectorAll('time[data-t]')) e.textContent = ago(Number(e.dataset.t));
}
export function hostSubtitle(l, s) {
  const st = s.err ? { line: 'Out of reach' } : hostStatus(s.d);
  return st.line;
}
