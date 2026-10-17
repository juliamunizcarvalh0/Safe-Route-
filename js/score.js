import { makeProj, distPtSeg, sampleAlong, hav } from './geo.js';
import { HOTSPOTS, COVERAGE } from './data.js';
import * as store from './store.js';
export const WEIGHTS = {
  night: { light: .35, activity: .25, road: .15, risk: .25 },
  day: { light: .15, activity: .25, road: .20, risk: .40 }
};
export const PART_LABEL = { light: 'Iluminação', activity: 'Movimento e comércio aberto', road: 'Tipo de via', risk: 'Ocorrências na região' };
export const label = s => s == null ? { t: 'Sem dados', tone: 'alt' } : s >= 85 ? { t: 'Alta', tone: 'safe' } : s >= 70 ? { t: 'Atenção', tone: 'warn' } : { t: 'Cautela', tone: 'risk' };
const POI_ACT = new Set(['restaurant', 'cafe', 'bar', 'pub', 'fast_food', 'fuel', 'bank', 'convenience', 'supermarket', 'bakery', 'mall', 'station', 'subway_entrance', 'stop_position']);
const REFUGE = { pharmacy: 'Farmácia', police: 'Delegacia/Polícia', hospital: 'Hospital', clinic: 'Clínica', station: 'Estação', fuel: 'Posto aberto', subway_entrance: 'Metrô' };
export const inCoverage = (lat, lon) => hav([lat, lon], [COVERAGE.lat, COVERAGE.lon]) < COVERAGE.radius;

export function riskAt(lat, lon, userReports = []) {
  let r = 0;
  for (const h of HOTSPOTS) { const d = hav([lat, lon], [h.lat, h.lon]); if (d < h.r * 2.5) r += h.w * Math.exp(-(d * d) / (2 * (h.r * .6) ** 2)); }
  for (const u of userReports) { // relatos negativos recentes pesam um pouco
    if (u.cat === 'safe') continue; const d = hav([lat, lon], [u.lat, u.lon]); if (d < 150) r += .25 * (1 - d / 150);
  }
  return Math.min(1, r);
}
export function analyze(route, osm, reports, night) {
  const W = WEIGHTS[night ? 'night' : 'day'];
  const samples = sampleAlong(route.coords, 25);
  const ref = [samples[0].lat, samples[0].lon], pr = makeProj(ref);
  const P = samples.map(s => pr(s.lat, s.lon));
  const res = { parts: { light: null, activity: null, road: null, risk: null }, refuges: [], litPct: null, osm: !!osm, samples: samples.length };
  const nonSafe = reports.filter(r => r.cat !== 'safe');
  // risco
  const cov = samples.filter(s => inCoverage(s.lat, s.lon)).length / samples.length;
  res.riskCovered = cov > .6;
  if (res.riskCovered) res.parts.risk = 1 - samples.reduce((a, s) => a + riskAt(s.lat, s.lon, nonSafe), 0) / samples.length;
  // relatos positivos: pequeno bônus de atividade
  if (osm) {
    const lamps = [], pois = [], litWays = [], isoWays = [], pedWays = [];
    for (const el of osm) {
      const t = el.tags || {};
      if (el.type === 'node') {
        const [x, y] = pr(el.lat, el.lon);
        if (t.highway === 'street_lamp') lamps.push([x, y]);
        else { const k = t.amenity || t.shop || t.railway || (t.public_transport ? 'stop_position' : null); if (POI_ACT.has(k) || ['pharmacy', 'police', 'hospital', 'clinic'].includes(k)) pois.push({ x, y, k, name: t.name, lat: el.lat, lon: el.lon }); }
      } else if (el.type === 'way' && el.geometry) {
        const pts = el.geometry.map(g => pr(g.lat, g.lon));
        if (t.lit) litWays.push({ pts, lit: t.lit !== 'no' && t.lit !== 'disused' });
        if (/^(path|track|steps|footway)$/.test(t.highway) && t.footway !== 'sidewalk' && t.footway !== 'crossing') isoWays.push(pts);
        if (/^(pedestrian|living_street)$/.test(t.highway)) pedWays.push(pts);
      }
    }
    const near = (ways, x, y, max) => { let b = 1e9, hit = null; for (const w of ways) { const pts = w.pts || w; for (let i = 1; i < pts.length; i++) { const d = distPtSeg(x, y, pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]); if (d < b) { b = d; hit = w; } } } return b <= max ? hit : null; };
    let lightSum = 0, litN = 0, actSum = 0, roadSum = 0;
    const seen = new Set();
    P.forEach(([x, y]) => {
      const w = near(litWays, x, y, 18);
      const lamp = lamps.some(l => Math.hypot(l[0] - x, l[1] - y) < 35);
      let l = w ? (w.lit ? 1 : 0.1) : lamp ? .8 : .4; if (w && w.lit) litN++;
      lightSum += l;
      let c = 0; for (const p of pois) { if (Math.hypot(p.x - x, p.y - y) < 90) { c++; if (REFUGE[p.k] && !seen.has(p.lat + ',' + p.lon)) { seen.add(p.lat + ',' + p.lon); res.refuges.push({ kind: REFUGE[p.k], name: p.name || REFUGE[p.k], lat: p.lat, lon: p.lon }); } } }
      actSum += Math.min(1, c / 3) * .85 + (c ? .15 : 0);
      let r = .75; if (near(pedWays, x, y, 15)) r = 1; else if (near(isoWays, x, y, 12)) r = .35;
      roadSum += r;
    });
    const n = P.length;
    res.parts.light = lightSum / n; res.parts.activity = actSum / n; res.parts.road = roadSum / n; res.litPct = litN / n;
    // relatos positivos próximos aumentam levemente o movimento percebido
    const pos = reports.filter(r => r.cat === 'safe' && samples.some(s => hav([s.lat, s.lon], [r.lat, r.lon]) < 120)).length;
    res.parts.activity = Math.min(1, res.parts.activity + pos * .05);
  }
  let tw = 0, ts = 0;
  for (const k of Object.keys(W)) if (res.parts[k] != null) { tw += W[k]; ts += W[k] * res.parts[k]; }
  res.score = tw >= .2 ? Math.round(100 * ts / tw) : null;
  res.partial = Object.values(res.parts).some(v => v == null);
  res.refuges = res.refuges.slice(0, 6);
  res.weights = W;
  return res;
}
