// Transporte público: planejamento via Transitous (MOTIS, dados abertos GTFS) e tempo real via proxy Olho Vivo (SPTrans).
import { getJSON } from './net.js';
import * as store from './store.js';
import { hav } from './geo.js';

export const PLAN_URL = 'https://api.transitous.org/api/v1/plan';

export function decodePolyline(str, precision = 6) {
  const f = 10 ** precision; let i = 0, lat = 0, lon = 0; const out = [];
  while (i < str.length) {
    let b, sh = 0, r = 0; do { b = str.charCodeAt(i++) - 63; r |= (b & 31) << sh; sh += 5; } while (b >= 32); lat += (r & 1) ? ~(r >> 1) : (r >> 1);
    sh = 0; r = 0; do { b = str.charCodeAt(i++) - 63; r |= (b & 31) << sh; sh += 5; } while (b >= 32); lon += (r & 1) ? ~(r >> 1) : (r >> 1);
    out.push([lon / f, lat / f]);
  }
  return out;
}
function geom(leg, from) {
  const g = leg.legGeometry; if (!g || !g.points) return null;
  const tryP = [g.precision, 6, 5].filter(x => x != null);
  for (const p of tryP) { const c = decodePolyline(g.points, p); if (c.length && hav([from.lat, from.lon], [c[0][1], c[0][0]]) < 3000) return c; }
  return null;
}
const MODE = m => /SUBWAY|METRO/.test(m) ? 'subway' : /RAIL|TRAIN|TRAM/.test(m) ? 'rail' : /BUS|COACH/.test(m) ? 'bus' : m === 'WALK' ? 'walk' : 'bus';
export const MODE_LABEL = { bus: 'Ônibus', subway: 'Metrô', rail: 'Trem', walk: 'A pé' };
const ms = t => (t ? new Date(t).getTime() : NaN);
export function normalize(it) {
  const legs = (it.legs || []).map(l => {
    const mode = MODE(l.mode || 'WALK');
    const fr = { name: l.from?.name || '', lat: l.from?.lat, lon: l.from?.lon }, to = { name: l.to?.name || '', lat: l.to?.lat, lon: l.to?.lon };
    const coords = geom(l, fr) || [[fr.lon, fr.lat], [to.lon, to.lat]];
    const start = ms(l.startTime || l.from?.departure), end = ms(l.endTime || l.to?.arrival);
    const dur = l.duration || (end - start) / 1000 || 0;
    let dist = l.distance; if (dist == null) dist = coords.reduce((a, c, i) => i ? a + hav([coords[i - 1][1], coords[i - 1][0]], [c[1], c[0]]) : 0, 0);
    return { mode, from: fr, to, coords, start, end, dur, dist, line: l.routeShortName || l.tripShortName || '', lineLong: l.routeLongName || '', headsign: l.headsign || '', agency: l.agencyName || '', color: l.routeColor ? '#' + String(l.routeColor).replace('#', '') : null, stops: (l.intermediateStops || []).length, realtime: !!l.realTime };
  }).filter(l => l.from.lat != null && l.to.lat != null);
  const start = ms(it.startTime) || legs[0]?.start, end = ms(it.endTime) || legs.at(-1)?.end;
  const walk = legs.filter(l => l.mode === 'walk').reduce((a, l) => a + l.dist, 0);
  return { legs, start, end, dur: it.duration || (end - start) / 1000, transfers: it.transfers ?? Math.max(0, legs.filter(l => l.mode !== 'walk').length - 1), walk };
}
export async function planTransit(from, to, { signal } = {}) {
  const t = new Date().toISOString();
  const q = `fromPlace=${from.lat.toFixed(6)},${from.lon.toFixed(6)}&toPlace=${to.lat.toFixed(6)},${to.lon.toFixed(6)}&time=${encodeURIComponent(t)}&arriveBy=false&numItineraries=4`;
  const j = await getJSON(`${PLAN_URL}?${q}`, { signal, timeout: 25000 });
  const its = (j.itineraries || []).map(normalize).filter(i => i.legs.some(l => l.mode !== 'walk'));
  return its.slice(0, 4);
}

/* ---------- tempo real (Olho Vivo via proxy próprio; o token fica só no servidor) ---------- */
// Proxy padrão (Cloudflare Worker, guarda o token da SPTrans). Um endereço salvo em Ajustes tem prioridade.
export const DEFAULT_PROXY = 'https://saferoute-sptrans-proxy.juliamuniz0746.workers.dev';
export const proxyUrl = () => ((store.get().settings.proxyUrl || '').trim() || DEFAULT_PROXY).replace(/\/+$/, '');
const normL = x => String(x || '').toUpperCase().replace(/\s/g, '');
// 1) pela linha: acha os sentidos da linha, lista os pontos deles (com coordenadas) e usa o mais perto do embarque.
async function stopByLine(base, line, lat, lon, signal) {
  const L = normL(line); if (!L) return null;
  let ls = await getJSON(`${base}/lines?q=${encodeURIComponent(L)}`, { signal, timeout: 9000 }).catch(() => []);
  if (!Array.isArray(ls) || !ls.length) ls = await getJSON(`${base}/lines?q=${encodeURIComponent(L.split('-')[0])}`, { signal, timeout: 9000 }).catch(() => []);
  if (!Array.isArray(ls)) return null;
  const exact = ls.filter(x => normL(`${x.lt}-${x.tl}`) === L), cand = (exact.length ? exact : ls.filter(x => normL(x.lt) === L.split('-')[0])).slice(0, 4);
  let best = null;
  for (const c of cand) {
    const st = await getJSON(`${base}/line-stops?line=${c.cl}`, { signal, timeout: 9000 }).catch(() => []);
    for (const s of Array.isArray(st) ? st : []) { const d = hav([lat, lon], [s.py, s.px]); if (d < 200 && (!best || d < best.d)) best = { ...s, d }; }
  }
  return best;
}
// 2) pelo nome do ponto (plano B).
async function stopByName(base, name, lat, lon, signal) {
  const stops = await getJSON(`${base}/stops?q=${encodeURIComponent(String(name || '').slice(0, 50))}`, { signal, timeout: 9000 }).catch(() => []);
  return (Array.isArray(stops) ? stops : []).map(s => ({ ...s, d: hav([lat, lon], [s.py, s.px]) })).filter(s => s.d < 200).sort((a, b) => a.d - b.d)[0] || null;
}
export async function arrivals(stopName, lat, lon, line, { signal } = {}) {
  const base = proxyUrl(); if (!base) return { off: true };
  const near = (await stopByLine(base, line, lat, lon, signal)) || (await stopByName(base, stopName, lat, lon, signal));
  if (!near) return { notFound: true };
  const j = await getJSON(`${base}/arrivals?stop=${near.cp}`, { signal, timeout: 9000 });
  const lines = j?.p?.l || [];
  const L = normL(line);
  const hit = L ? lines.find(l => normL(l.c) === L || normL(l.c).startsWith(L) || L.startsWith(normL(l.c))) : null;
  return { stop: near.np, all: lines.map(l => ({ c: l.c, to: l.lt0 === l.lt1 ? l.lt0 : l.lt1, t: (l.vs || []).map(v => v.t).slice(0, 3) })), line: hit ? { c: hit.c, t: (hit.vs || []).map(v => v.t).slice(0, 3) } : null };
}
