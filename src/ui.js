/* The pieces every screen is built from: elements, icons, sheets, toasts, segmented controls, charts and the small
   formatting helpers. Text from a server only ever reaches the screen as text (textContent), never as markup. */
import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { prefs } from './net.js';

export const NATIVE = Capacitor.isNativePlatform();

export function el(tag, props, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'text') e.textContent = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
    else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? '' : String(v));
  }
  for (const k of kids.flat(Infinity)) if (k != null && k !== false) e.append(k.nodeType ? k : document.createTextNode(String(k)));
  return e;
}
const SVG = 'http://www.w3.org/2000/svg';
export function svg(id, cls) {
  const s = document.createElementNS(SVG, 'svg');
  s.setAttribute('class', cls || 'i'); s.setAttribute('aria-hidden', 'true');
  const u = document.createElementNS(SVG, 'use'); u.setAttribute('href', '#' + id);
  s.append(u); return s;
}
function svgEl(tag, attrs) {
  const e = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  return e;
}

/* ---------- words and numbers ---------- */
export const hhmm = (t) => new Date(t * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
export const hhmmss = (t) => new Date(t * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
export const ago = (t) => { const s = Math.max(0, Date.now() / 1000 - t); return s < 90 ? 'just now' : s < 3600 ? Math.round(s / 60) + ' min ago' : s < 86400 ? Math.round(s / 3600) + ' h ago' : Math.round(s / 86400) + ' d ago'; };
export const span = (sec) => { const m = Math.max(1, Math.round(Math.max(0, sec) / 60)); return m < 60 ? m + ' min' : Math.floor(m / 60) + ' h ' + String(m % 60).padStart(2, '0') + ' min'; };
export const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
export const initial = (s) => (String(s || '?').trim()[0] || '?').toUpperCase();
export const gb = (mb) => mb == null ? '–' : (mb / 1024).toFixed(mb >= 10240 ? 0 : 1) + ' GB';
export const size = (mb) => mb == null ? '–' : mb >= 1000 ? gb(mb) : Math.round(mb) + ' MB';
/* a duration for a small stat tile: the number and its unit apart, so the unit can be set smaller */
export const hours = (sec) => sec >= 3600 ? [(sec / 3600).toFixed(sec >= 36000 ? 0 : 1), 'h'] : [String(Math.max(1, Math.round(sec / 60))), 'min'];
export const when = (t) => new Date(t * 1000).toLocaleString([], { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
export function hue(name) { let h = 0; for (const c of String(name || '')) h = (h * 31 + c.charCodeAt(0)) % 360; return h; }
/* a player's own colour, the same rule as Fenrir Connect's avatars, so a name looks alike everywhere */
export function face(name, cls) {
  const h = hue(name);
  return el('span', { class: 'face' + (cls ? ' ' + cls : ''), 'aria-hidden': 'true', text: initial(name),
    style: { background: `linear-gradient(145deg, hsl(${h} 62% 52%), hsl(${(h + 40) % 360} 62% 38%))` } });
}

/* ---------- touch ---------- */
export function tap(kind) {
  if (!NATIVE || prefs.get('haptics') === false) return;
  if (kind === 'ok') Haptics.notification({ type: NotificationType.Success }).catch(() => {});
  else if (kind === 'bad') Haptics.notification({ type: NotificationType.Warning }).catch(() => {});
  else Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
}
export function toast(text, kind) {
  const t = el('div', { class: 'toast' + (kind ? ' ' + kind : ''), text });
  document.getElementById('toasts').append(t);
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 260); }, 3400);
}
export async function busy(btn, fn) {
  if (btn) { btn.classList.add('busy'); btn.disabled = true; }
  try { return await fn(); } finally { if (btn && btn.isConnected) { btn.classList.remove('busy'); btn.disabled = false; } }
}
export async function copy(text, btn) {
  let ok = false;
  try { await navigator.clipboard.writeText(text); ok = true; } catch (_) {
    const ta = el('textarea', { style: { position: 'fixed', opacity: '0' } }); ta.value = text; document.body.append(ta); ta.select();
    try { ok = document.execCommand('copy'); } catch (_e) { ok = false; }
    ta.remove();
  }
  tap(ok ? 'ok' : 'bad');
  if (btn && ok) { const was = btn.textContent; btn.textContent = 'Copied'; setTimeout(() => { if (btn.isConnected) btn.textContent = was; }, 1400); }
  if (!ok) toast('This phone did not let the app copy it.', 'bad');
  return ok;
}

/* ---------- drafts: what someone typed survives the screen being rebuilt by the next update ---------- */
const drafts = new Map();
export function field(key, props) {
  const i = el('input', props);
  if (drafts.has(key)) i.value = drafts.get(key);
  i.addEventListener('input', () => drafts.set(key, i.value));
  return i;
}
export const clearDraft = (key) => drafts.delete(key);

/* ---------- segmented control: a few choices, one of them on ---------- */
export function seg(label, options, value, onPick) {
  return el('div', { class: 'seg', role: 'radiogroup', 'aria-label': label },
    options.map(([v, text]) => el('button', { type: 'button', role: 'radio', 'aria-checked': String(v === value), class: v === value ? 'on' : '',
      onclick: () => { if (v !== value) { tap(); onPick(v); } } }, text)));
}

/* ---------- sheets: add, more, confirm, rename ---------- */
let layer = null;
export function closeLayer() {
  if (!layer) return false;
  const { scrim, sheet, done, before } = layer;
  layer = null;
  scrim.classList.remove('show'); sheet.classList.remove('show');
  setTimeout(() => { scrim.remove(); sheet.remove(); }, 320);
  if (done) done();
  if (before && before.isConnected && before.focus) before.focus({ preventScroll: true });
  return true;
}
export const layerOpen = () => !!layer;
export function openSheet(children, onClose) {
  closeLayer();
  const before = document.activeElement;
  const scrim = el('div', { class: 'scrim', onclick: () => closeLayer() });
  const sheet = el('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true' }, el('div', { class: 'grab', 'aria-hidden': 'true' }), children);
  const h = sheet.querySelector('h2');
  if (h) { h.id = 'sheet-t'; sheet.setAttribute('aria-labelledby', 'sheet-t'); }
  document.getElementById('layer').append(scrim, sheet);
  layer = { scrim, sheet, done: onClose, before };
  requestAnimationFrame(() => {
    scrim.classList.add('show'); sheet.classList.add('show');
    const f = sheet.querySelector('input, textarea, button.primary, button.teal, button');
    if (f) f.focus({ preventScroll: true });
  });
  return sheet;
}
export function confirmSheet(title, text, okText, danger) {
  return new Promise((resolve) => {
    let answered = false;
    const answer = (v) => { if (answered) return; answered = true; closeLayer(); resolve(v); };
    openSheet([el('h2', { text: title }), el('p', { text }),
      el('div', { class: 'actions' },
        el('button', { class: 'btn ' + (danger ? 'solid-danger' : 'primary'), onclick: () => answer(true) }, okText),
        el('button', { class: 'btn', onclick: () => answer(false) }, 'Cancel'))], () => { if (!answered) { answered = true; resolve(false); } });
  });
}
/* one line of text from a sheet: resolves to the text, or null when it was closed */
export function askText({ title, text, value, placeholder, okText, maxlength, allowEmpty, extra }) {
  return new Promise((resolve) => {
    let answered = false;
    const input = el('input', { value: value || '', placeholder: placeholder || '', maxlength: maxlength || 200, enterkeyhint: 'done', 'aria-label': title });
    const answer = (v) => { if (answered) return; answered = true; closeLayer(); resolve(v); };
    const ok = () => { const v = input.value.trim(); if (!v && !allowEmpty) { input.focus(); return; } answer(v); };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') ok(); });
    openSheet([el('h2', { text: title }), text ? el('p', { text }) : null, el('div', { class: 'field' }, input),
      el('div', { class: 'actions' }, el('button', { class: 'btn primary', onclick: ok }, okText || 'Save'),
        (extra || []).map((x) => el('button', { class: 'btn' + (x.danger ? ' danger' : ''), onclick: () => answer({ extra: x.id, text: input.value.trim() }) }, x.label)),
        el('button', { class: 'btn', onclick: () => answer(null) }, 'Cancel'))], () => { if (!answered) { answered = true; resolve(null); } });
  });
}

/* ---------- charts: one line over the last half hour, drawn to scale ---------- */
export function chart(points, { min = 0, max, unit = '', digits = 0, label, warnBelow, warnAbove }) {
  const W = 320, H = 112, PAD_T = 10, PAD_B = 18;
  const vals = points.map((p) => p.v).filter((v) => v != null && isFinite(v));
  const box = el('div', { class: 'chart' });
  if (vals.length < 2) {
    box.append(el('p', { class: 'chart-empty', text: 'The chart fills in while the server runs.' }));
    return box;
  }
  const top = max != null ? Math.max(max, ...vals) : Math.max(...vals) * 1.15 || 1;
  const t0 = points[0].t, t1 = points[points.length - 1].t, dt = Math.max(1, t1 - t0);
  const x = (t) => ((t - t0) / dt) * W;
  const y = (v) => PAD_T + (1 - (v - min) / (top - min || 1)) * (H - PAD_T - PAD_B);
  const pts = points.filter((p) => p.v != null && isFinite(p.v)).map((p) => [x(p.t), y(p.v)]);
  const line = pts.map(([px, py], i) => (i ? 'L' : 'M') + px.toFixed(1) + ' ' + py.toFixed(1)).join(' ');
  const s = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'none', class: 'chart-svg', role: 'img', 'aria-label': label });
  const gid = 'g' + Math.random().toString(36).slice(2, 8);
  const defs = svgEl('defs', {});
  const grad = svgEl('linearGradient', { id: gid, x1: 0, y1: 0, x2: 0, y2: 1 });
  grad.append(svgEl('stop', { offset: 0, 'stop-color': 'currentColor', 'stop-opacity': '.28' }), svgEl('stop', { offset: 1, 'stop-color': 'currentColor', 'stop-opacity': '0' }));
  defs.append(grad); s.append(defs);
  for (const g of [0.25, 0.5, 0.75]) s.append(svgEl('line', { x1: 0, x2: W, y1: PAD_T + g * (H - PAD_T - PAD_B), y2: PAD_T + g * (H - PAD_T - PAD_B), class: 'grid' }));
  if (warnBelow != null && warnBelow > min && warnBelow < top) s.append(svgEl('line', { x1: 0, x2: W, y1: y(warnBelow), y2: y(warnBelow), class: 'warn-line' }));
  if (warnAbove != null && warnAbove > min && warnAbove < top) s.append(svgEl('line', { x1: 0, x2: W, y1: y(warnAbove), y2: y(warnAbove), class: 'warn-line' }));
  s.append(svgEl('path', { d: `${line} L${pts[pts.length - 1][0].toFixed(1)} ${H - PAD_B} L${pts[0][0].toFixed(1)} ${H - PAD_B} Z`, fill: `url(#${gid})`, stroke: 'none' }));
  s.append(svgEl('path', { d: line, class: 'line', fill: 'none' }));
  const [lx, ly] = pts[pts.length - 1];
  s.append(svgEl('circle', { cx: lx, cy: ly, r: 3.2, class: 'end', fill: 'currentColor' }));
  box.append(s);
  const fmt = (v) => (digits ? v.toFixed(digits) : Math.round(v).toLocaleString()) + unit;
  const lo = Math.min(...vals), avg = vals.reduce((a, b) => a + b, 0) / vals.length;
  box.append(el('div', { class: 'chart-axis', 'aria-hidden': 'true' }, el('span', { text: span(t1 - t0) + ' ago' }), el('span', { text: 'now' })),
    el('div', { class: 'chart-legend' },
      el('span', null, el('small', { text: 'Now' }), el('b', { text: fmt(vals[vals.length - 1]) })),
      el('span', null, el('small', { text: 'Lowest' }), el('b', { text: fmt(lo) })),
      el('span', null, el('small', { text: 'Average' }), el('b', { text: fmt(avg) })),
      el('span', null, el('small', { text: 'Highest' }), el('b', { text: fmt(Math.max(...vals)) }))));
  return box;
}

/* ---------- a picture, full screen ---------- */
export function viewer(src, caption) {
  const img = el('img', { src, alt: caption || 'Screenshot' });
  const close = () => { wrap.classList.remove('show'); setTimeout(() => wrap.remove(), 240); };
  const wrap = el('div', { class: 'viewer', role: 'dialog', 'aria-modal': 'true', 'aria-label': caption || 'Screenshot', onclick: close },
    img, caption ? el('p', { text: caption }) : null,
    el('button', { class: 'icon-btn viewer-x', 'aria-label': 'Close', onclick: (e) => { e.stopPropagation(); close(); } }, svg('i-x')));
  document.getElementById('layer').append(wrap);
  requestAnimationFrame(() => wrap.classList.add('show'));
  return wrap;
}
