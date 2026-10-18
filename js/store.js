// Estado local do app. Tudo fica no aparelho (localStorage). Nada é enviado a servidor.
const KEY = 'saferoute.v1';
const defaults = () => ({
  v: 1,
  onboarded: false,
  consent: { location: false, reports: false, at: null },
  settings: { fontScale: 1, contrast: false, big: false, simple: false, voice: true, vibrate: true, reduce: false, time: 'auto', proxyUrl: '', layers: { reports: true, hotspots: false } },
  guardians: [], places: [], recents: [], reports: [], votes: {}, trips: [], survey: null, contests: [], share: null
});
const mem = {};
const ls = {
  get(k) { try { return localStorage.getItem(k); } catch { return mem[k] ?? null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { mem[k] = v; } },
  del(k) { try { localStorage.removeItem(k); } catch { delete mem[k]; } }
};
function merge(a, b) {
  if (!b || typeof b !== 'object') return a;
  for (const k of Object.keys(a)) {
    if (k in b) a[k] = (a[k] && typeof a[k] === 'object' && !Array.isArray(a[k])) ? merge(a[k], b[k]) : b[k];
  }
  return a;
}
let state;
try { state = merge(defaults(), JSON.parse(ls.get(KEY))); } catch { state = defaults(); }
const subs = new Set();
export const get = () => state;
export function update(fn) { fn(state); ls.set(KEY, JSON.stringify(state)); subs.forEach(f => f(state)); }
export const subscribe = f => (subs.add(f), () => subs.delete(f));
export function wipe() { ls.del(KEY); state = defaults(); }
export function exportData() { return JSON.stringify({ app: 'SafeRoute', exportedAt: new Date().toISOString(), data: state }, null, 2); }
export function applySettings() {
  const s = state.settings, r = document.documentElement;
  r.style.fontSize = (16 * s.fontScale) + 'px';
  r.dataset.contrast = s.contrast ? 'high' : 'normal';
  r.dataset.big = s.big ? '1' : '0';
  r.dataset.reduce = s.reduce ? '1' : '0';
}
export function uid() { return Math.random().toString(36).slice(2, 9); }
export const hour = () => { const d = new Date(); return d.getHours() + d.getMinutes() / 60; };
export function isNight() {
  const t = state.settings.time;
  if (t === 'night') return true;
  if (t === 'day') return false;
  const h = hour(); return h >= 18.5 || h < 5.5;
}
