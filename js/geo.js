const R = 6371000, rad = d => d * Math.PI / 180;
export function hav(a, b) { // [lat,lon]
  const dLat = rad(b[0] - a[0]), dLon = rad(b[1] - a[1]);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}
export function bearing(a, b) {
  const y = Math.sin(rad(b[1] - a[1])) * Math.cos(rad(b[0]));
  const x = Math.cos(rad(a[0])) * Math.sin(rad(b[0])) - Math.sin(rad(a[0])) * Math.cos(rad(b[0])) * Math.cos(rad(b[1] - a[1]));
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}
export function makeProj(ref) {
  const k = Math.cos(rad(ref[0])) * 111320;
  return (lat, lon) => [(lon - ref[1]) * k, (lat - ref[0]) * 110574];
}
export function distPtSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
  let t = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0; t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}
// coords: [[lon,lat],...] -> acumulado em metros
export function cumulative(coords) {
  const c = [0];
  for (let i = 1; i < coords.length; i++) c.push(c[i - 1] + hav([coords[i - 1][1], coords[i - 1][0]], [coords[i][1], coords[i][0]]));
  return c;
}
export function pointAt(coords, cum, s) {
  const total = cum[cum.length - 1]; s = Math.max(0, Math.min(total, s));
  let i = 1; while (i < cum.length - 1 && cum[i] < s) i++;
  const seg = cum[i] - cum[i - 1] || 1, t = (s - cum[i - 1]) / seg;
  const a = coords[i - 1], b = coords[i];
  return { lat: a[1] + (b[1] - a[1]) * t, lon: a[0] + (b[0] - a[0]) * t, bearing: bearing([a[1], a[0]], [b[1], b[0]]), i };
}
export function sampleAlong(coords, step = 25) {
  const cum = cumulative(coords), total = cum[cum.length - 1], out = [];
  for (let s = 0; s <= total; s += step) { const p = pointAt(coords, cum, s); out.push({ lat: p.lat, lon: p.lon, d: s }); }
  return out;
}
export function bboxOf(coords, pad = 0.0015) {
  let s = 90, w = 180, n = -90, e = -180;
  for (const [lon, lat] of coords) { s = Math.min(s, lat); n = Math.max(n, lat); w = Math.min(w, lon); e = Math.max(e, lon); }
  return [s - pad, w - pad, n + pad, e + pad];
}
export function nearestOnLine(coords, lat, lon) { // distância mínima (m) do ponto à polilinha
  const ref = [lat, lon], pr = makeProj(ref); let best = Infinity;
  for (let i = 1; i < coords.length; i++) {
    const a = pr(coords[i - 1][1], coords[i - 1][0]), b = pr(coords[i][1], coords[i][0]);
    best = Math.min(best, distPtSeg(0, 0, a[0], a[1], b[0], b[1]));
  }
  return best;
}
export const fmtDist = m => m < 950 ? `${Math.round(m / 10) * 10 || 10} m` : `${(m / 1000).toFixed(m < 10000 ? 1 : 0).replace('.', ',')} km`;
export const fmtMin = s => { const m = Math.max(1, Math.round(s / 60)); return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`; };

// posição do usuário (GPS real ou local de demonstração)
export const DEMO = { lat: -23.5568, lon: -46.6618, source: 'demo' };
export const here = { ...DEMO };
export function requestGPS(timeout = 9000) {
  return new Promise((res, rej) => {
    if (!navigator.geolocation) return rej(new Error('unsupported'));
    navigator.geolocation.getCurrentPosition(p => {
      here.lat = p.coords.latitude; here.lon = p.coords.longitude; here.source = 'gps'; res(here);
    }, e => rej(e), { enableHighAccuracy: true, timeout, maximumAge: 15000 });
  });
}
