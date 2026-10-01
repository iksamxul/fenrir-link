/* The network and what the phone keeps. On a phone fetch goes through the native HTTP stack (CapacitorHttp: no browser
   rules about other sites); in a desktop browser it is plain fetch, which the dev page answers with fake data.
   Links live in the keychain (Android Keystore, iOS Keychain); only harmless preferences live in localStorage. */
import { SecureStorage } from '@aparajita/capacitor-secure-storage';

const HOST_KEY = /^[A-Za-z0-9]{32}$/;
const FRIEND_KEY = /^[A-Za-z0-9]{6,16}$/;

function withTimeout(p, ms) { return Promise.race([p, new Promise((_, no) => setTimeout(() => no(new Error('timeout')), ms))]); }

export async function getJSON(url, ms) {
  const r = await withTimeout(fetch(url, { cache: 'no-store', headers: { Accept: 'application/json' } }), ms || 10000);
  let d = null;
  try { d = await r.json(); } catch (_) { d = null; }
  if (r.status === 404 || (d && d.gone)) return { gone: true };
  if (r.status === 403) return { insecure: true };
  if (!r.ok || !d) throw new Error('HTTP ' + r.status);
  return d;
}
export async function postJSON(url, body, headers) {
  try {
    const r = await withTimeout(fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(headers || {}) }, body: JSON.stringify(body || {}) }), 20000);
    let d = null;
    try { d = await r.json(); } catch (_) { d = null; }
    if (d && typeof d === 'object') return d;
    return { ok: false, error: r.status === 404 ? 'This link no longer works. Scan the new code.' : r.status === 429 ? 'Too many at once. Wait a moment.' : 'Fenrir answered in a way this app does not understand.' };
  } catch (_) {
    return { ok: false, error: 'Fenrir is not answering. Its PC may be off, or its address changed.' };
  }
}

/* ---------- links: what a code means ---------- */
export function parseLink(text) {
  const t = String(text || '').trim();
  // a Fenrir Connect code: KEY@address, or KEY@https://address for a host on Cloudflare or Tailscale
  const code = t.match(/^([A-Za-z0-9]{6,16})@(https?:\/\/)?([A-Za-z0-9.-]+(?::\d{1,5})?)\/?$/i);
  if (code) {
    const secure = code[2] ? /^https/i.test(code[2]) : /(\.trycloudflare\.com|\.ts\.net)(:\d+)?$/i.test(code[3]);
    return { kind: 'friend', base: (secure ? 'https://' : 'http://') + code[3].toLowerCase(), key: code[1].toUpperCase() };
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
export const urls = {
  state: (l) => l.kind === 'host' ? `${l.base}/${l.key}/admin.json` : `${l.base}/${l.key}/status.json`,
  names: (l) => `${l.base}/${l.key}/manifest.json?lite=1`,
  log: (l, after) => `${l.base}/${l.key}/log.json?after=${after || 0}`,
  page: (l) => l.kind === 'host' ? `${l.base}/${l.key}/admin` : `${l.base}/${l.key}/status`,
  map: (l) => `${l.base}/${l.key}/map/`,
  gallery: (l, file) => (window.__fenrirLinkDev && window.__fenrirLinkDev.picture) ? window.__fenrirLinkDev.picture(file) : `${l.base}/${l.key}/gallery/${encodeURIComponent(file)}`,
  act: (l, route) => l.kind === 'host' ? `${l.base}/${l.key}/admin/${route}` : `${l.base}/${l.key}/${route}`,
};

/* ---------- what the phone keeps ---------- */
export const store = {
  async load() {
    try {
      const v = await SecureStorage.get('links');
      if (Array.isArray(v)) return v;
      if (typeof v === 'string' && v) return JSON.parse(v);
    } catch (_) { /* nothing kept yet, or the keychain is locked */ }
    return [];
  },
  async save(list) {
    try { await SecureStorage.set('links', list); return true; } catch (e) { return e && e.message ? e.message : 'the keychain refused it'; }
  },
};
const PREFS = 'fenrirlink.prefs';
let cache = null;
export const prefs = {
  all() {
    if (cache) return cache;
    try { cache = JSON.parse(localStorage.getItem(PREFS) || '{}') || {}; } catch (_) { cache = {}; }
    return cache;
  },
  get(k) { return this.all()[k]; },
  set(k, v) { this.all()[k] = v; try { localStorage.setItem(PREFS, JSON.stringify(cache)); } catch (_) { /* a preference, not a link: fine to lose */ } },
};
