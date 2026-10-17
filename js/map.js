import { $, toast } from './ui.js';
import { here } from './geo.js';
let map, tiles, scene, night = false, tileErr = 0, warned = false;
const L_ = () => window.L;
// Mapa-base: tiles padrão do OpenStreetMap (sem chave). Reserva: OSM França (HOT).
const SOURCES = [
  { url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', sub: '' },
  { url: 'https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png', sub: 'abc' }
];
const ATTR = '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
let src = 0, okTiles = 0;
export function init() {
  if (map || !L_()) return map;
  map = L_().map('map', { zoomControl: false, attributionControl: true, zoomSnap: 0.5, tap: true, inertia: true }).setView([here.lat, here.lon], 15);
  map.attributionControl.setPrefix(false);
  scene = L_().layerGroup().addTo(map);
  setTiles();
  return map;
}
function setTiles() {
  if (tiles) map.removeLayer(tiles);
  const s = SOURCES[src];
  tiles = L_().tileLayer(s.url, { subdomains: s.sub || 'abc', maxZoom: 19, attribution: ATTR, crossOrigin: true });
  tiles.on('tileerror', () => {
    tileErr++;
    if (tileErr === 5 && !okTiles && src < SOURCES.length - 1) { src++; tileErr = 0; setTiles(); return; }
    if (tileErr === 6 && !warned) { warned = true; toast('Não consegui carregar o mapa. Verifique sua conexão.', 'alert', 4200); }
  });
  tiles.on('tileload', () => { tileErr = 0; okTiles++; });
  tiles.addTo(map);
}
export function show(on) {
  const el = $('#map');
  if (on) { init(); el.classList.add('on'); setTimeout(() => map && map.invalidateSize(), 30); } else el.classList.remove('on');
}
export function setNight(n) { night = !!n; $('#map').classList.toggle('night-map', night); }
export const get = () => map;
export const group = () => { init(); return scene; };
export function clear() { if (scene) scene.clearLayers(); }
export const L = () => L_();
export function icon(html, size = 36) { return L_().divIcon({ className: '', html, iconSize: [size, size], iconAnchor: [size / 2, size / 2] }); }
export function youIcon(nav) { return icon(`<div class="you ${nav ? 'nav' : ''}"></div>`, 56); }
export function pin(lat, lon, { color = '#D6336C', svg = '', size = 38, title = '' } = {}) {
  const html = `<div class="mk" style="width:${size}px;height:${size}px;background:${color}" ${title ? `title="${title}"` : ''}>${svg}</div>`;
  return L_().marker([lat, lon], { icon: icon(html, size), keyboard: false }).addTo(scene);
}
export function fit(bounds, { top = 150, bottom = 300, side = 30, maxZoom = 17 } = {}) {
  map.invalidateSize();
  map.fitBounds(bounds, { paddingTopLeft: [side, top], paddingBottomRight: [side, bottom], maxZoom, animate: true, duration: .8 });
}
export function flyTo(lat, lon, zoom = 16, offsetY = 0) {
  map.invalidateSize();
  const p = map.project([lat, lon], zoom).add([0, offsetY]); // offset >0 desloca o alvo p/ cima
  map.flyTo(map.unproject(p, zoom), zoom, { duration: .8 });
}
export function view(lat, lon, zoom = 15, offsetY = 0, animate = false) {
  map.invalidateSize();
  const p = map.project([lat, lon], zoom).add([0, offsetY]);
  map.setView(map.unproject(p, zoom), zoom, { animate });
}
