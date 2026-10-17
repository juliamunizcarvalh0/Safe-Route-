// Acesso a serviços abertos: busca (Nominatim/Photon), rotas a pé (OSRM) e dados do OpenStreetMap (Overpass).
import { here, hav, bearing, makeProj, distPtSeg } from './geo.js';
async function getJSON(url, { signal, timeout = 12000, init } = {}) {
  const c = new AbortController(); const t = setTimeout(() => c.abort(), timeout);
  signal && signal.addEventListener('abort', () => c.abort());
  try { const r = await fetch(url, { ...init, signal: c.signal }); if (!r.ok) throw new Error('HTTP ' + r.status); return await r.json(); }
  finally { clearTimeout(t); }
}
/* ---------- busca ---------- */
function fmtNominatim(r) {
  const a = r.address || {}; const road = a.road || a.pedestrian || a.footway;
  const title = r.name || (road ? road + (a.house_number ? ', ' + a.house_number : '') : r.display_name.split(',')[0]);
  const parts = [a.suburb || a.neighbourhood || a.quarter, a.city || a.town || a.village || a.municipality, a.state_code || a.state].filter(Boolean);
  return { name: title, sub: parts.join(', ') || r.display_name.split(',').slice(1, 3).join(',').trim(), lat: +r.lat, lon: +r.lon, type: r.type, cat: r.category };
}
export async function search(q, { signal } = {}) {
  q = q.trim(); if (q.length < 3) return [];
  const d = 0.35, vb = [here.lon - d, here.lat + d, here.lon + d, here.lat - d].join(',');
  try {
    const j = await getJSON(`https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=7&countrycodes=br&accept-language=pt-BR&viewbox=${vb}&q=${encodeURIComponent(q)}`, { signal });
    return j.map(fmtNominatim);
  } catch (e) {
    if (signal?.aborted) throw e;
    const j = await getJSON(`https://photon.komoot.io/api/?limit=7&lat=${here.lat}&lon=${here.lon}&q=${encodeURIComponent(q)}`, { signal });
    return (j.features || []).filter(f => (f.properties.countrycode || 'BR') === 'BR').map(f => {
      const p = f.properties; return { name: p.name || p.street || 'Local', sub: [p.district || p.locality, p.city, p.state].filter(Boolean).join(', '), lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0] };
    });
  }
}
export async function reverse(lat, lon) {
  try {
    const j = await getJSON(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=18&addressdetails=1&accept-language=pt-BR&lat=${lat}&lon=${lon}`, { timeout: 8000 });
    return fmtNominatim({ ...j, lat, lon });
  } catch { return { name: 'Local no mapa', sub: `${lat.toFixed(4)}, ${lon.toFixed(4)}`, lat, lon }; }
}
/* ---------- rotas a pé ---------- */
const OSRM = 'https://routing.openstreetmap.de/routed-foot/route/v1/foot/';
const q = '?overview=full&geometries=geojson&steps=true&alternatives=';
function norm(r, via) {
  const steps = [];
  r.legs.forEach((leg, li) => leg.steps.forEach((s, si) => {
    const m = s.maneuver.type;
    if (li > 0 && si === 0 && m === 'depart') return;
    if (m === 'arrive' && li < r.legs.length - 1) return;
    steps.push({ type: m, mod: s.maneuver.modifier || '', name: s.name || '', dist: s.distance, dur: s.duration, loc: s.maneuver.location, exit: s.maneuver.exit });
  }));
  return { coords: r.geometry.coordinates, dist: r.distance, dur: r.duration, steps, via: !!via };
}
function similar(a, b) {
  const pick = (c, n = 12) => Array.from({ length: n }, (_, i) => c[Math.floor(i * (c.length - 1) / (n - 1))]);
  const pr = makeProj([a[0][1], a[0][0]]);
  const bs = b.map(p => pr(p[1], p[0]));
  let sum = 0;
  for (const p of pick(a)) {
    const [x, y] = pr(p[1], p[0]); let best = 1e9;
    for (let i = 1; i < bs.length; i++) best = Math.min(best, distPtSeg(x, y, bs[i - 1][0], bs[i - 1][1], bs[i][0], bs[i][1]));
    sum += best;
  }
  return sum / 12 < 45;
}
export async function routes(from, to, { signal } = {}) {
  const ll = p => `${p.lon.toFixed(6)},${p.lat.toFixed(6)}`;
  const base = await getJSON(`${OSRM}${ll(from)};${ll(to)}${q}true`, { signal });
  if (base.code !== 'Ok') throw new Error(base.code || 'sem rota');
  let out = base.routes.map(r => norm(r));
  const D = out[0].dist;
  if (D > 150) { // variações com ponto intermediário deslocado (caminhos alternativos)
    const brg = bearing([from.lat, from.lon], [to.lat, to.lon]);
    const mid = [(from.lat + to.lat) / 2, (from.lon + to.lon) / 2];
    const off = Math.min(Math.max(D * 0.22, 120), 600);
    const vias = [brg + 90, brg - 90].map(b => {
      const dl = off * Math.cos(b * Math.PI / 180) / 110574, dn = off * Math.sin(b * Math.PI / 180) / (111320 * Math.cos(mid[0] * Math.PI / 180));
      return { lat: mid[0] + dl, lon: mid[1] + dn };
    });
    const rs = await Promise.allSettled(vias.map(v => getJSON(`${OSRM}${ll(from)};${ll(v)};${ll(to)}${q}false`, { signal, timeout: 10000 })));
    rs.forEach(r => { if (r.status === 'fulfilled' && r.value.code === 'Ok') out.push(norm(r.value.routes[0], true)); });
  }
  const keep = [];
  for (const r of out) {
    if (r.dist > D * 1.7 + 350) continue;
    if (keep.every(k => !similar(r.coords, k.coords) || !similar(k.coords, r.coords))) keep.push(r);
  }
  return keep.slice(0, 3);
}
export function straightRoute(from, to) { // último recurso: linha reta, claramente marcada como estimativa
  const d = hav([from.lat, from.lon], [to.lat, to.lon]);
  return [{ coords: [[from.lon, from.lat], [to.lon, to.lat]], dist: d * 1.25, dur: d * 1.25 / 1.3, estimated: true,
    steps: [{ type: 'depart', mod: '', name: '', dist: d, dur: d / 1.3, loc: [from.lon, from.lat] }, { type: 'arrive', mod: '', name: '', dist: 0, dur: 0, loc: [to.lon, to.lat] }] }];
}
/* ---------- OpenStreetMap (Overpass) ---------- */
const OVP = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
export async function osmAround(routeCoords, { signal } = {}) { // routeCoords: lista de rotas ([[lon,lat],...])
  const poly = coords => { // amostra ~1 ponto a cada 100–200 m, no máx. 80 pontos
    const step = Math.max(1, Math.ceil(coords.length / 80)); const pts = [];
    for (let i = 0; i < coords.length; i += step) pts.push(coords[i]); pts.push(coords[coords.length - 1]);
    return pts.map(c => c[1].toFixed(5) + ',' + c[0].toFixed(5)).join(',');
  };
  const parts = routeCoords.map(poly);
  const st = (sel, r) => parts.map(pl => `${sel}(around:${r},${pl});`).join('');
  const ql = `[out:json][timeout:25];(${st('way["highway"]["lit"]', 25)}${st('way["highway"~"^(footway|path|steps|track|pedestrian|living_street)$"]', 25)}${st('node["highway"="street_lamp"]', 40)}${st('node["amenity"~"^(pharmacy|police|hospital|clinic|restaurant|cafe|bar|pub|fast_food|fuel|bank)$"]', 100)}${st('node["shop"~"^(convenience|supermarket|bakery|mall)$"]', 100)}${st('node["railway"~"^(station|subway_entrance)$"]', 100)}${st('node["public_transport"="stop_position"]', 60)});out geom tags qt;`;
  let err;
  for (const u of OVP) {
    try { const j = await getJSON(u, { signal, timeout: 28000, init: { method: 'POST', body: 'data=' + encodeURIComponent(ql), headers: { 'Content-Type': 'application/x-www-form-urlencoded' } } }); return j.elements || []; }
    catch (e) { err = e; if (signal?.aborted) throw e; }
  }
  throw err;
}
