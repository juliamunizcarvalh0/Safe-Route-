import { $, $$, announce } from './ui.js';
import * as mapx from './map.js';
import { ic } from './icons.js';
import { T } from './ui.js';
const reg = {}, stack = [];
let busy = null;
export const register = (name, fn) => { reg[name] = fn; };
const TABS = [['home', 'Mapa', 'map'], ['reports', 'Relatos', 'flag'], ['support', 'Rede', 'users'], ['me', 'Perfil', 'user']];
const reduce = () => document.documentElement.dataset.reduce === '1' || matchMedia('(prefers-reduced-motion: reduce)').matches;

function build(name, p) {
  const def = reg[name]; if (!def) throw new Error('tela desconhecida: ' + name);
  const s = def(p || {});
  const el = document.createElement('section');
  el.className = 'screen ' + (s.opts?.map ? 'overmap' : s.opts?.night ? 'night' : s.opts?.cls || 'opaque');
  el.dataset.screen = name;
  el.innerHTML = s.html;
  return { name, p, el, s, opts: s.opts || {} };
}
function paintChrome(e) {
  const tb = $('#tabbar');
  const showTabs = !!e.opts.tabs;
  tb.hidden = !showTabs;
  if (showTabs) tb.innerHTML = TABS.map(([id, label, icon]) => `<button class="tab" data-tab="${id}" ${e.name === id ? 'aria-current="page"' : ''}><span class="pill">${ic(icon, 24)}</span><span>${label}</span></button>`).join('');
  $$('#tabbar .tab').forEach(b => b.onclick = () => { if (e.name !== b.dataset.tab) tab(b.dataset.tab); });
  const sb = $('#statusbar');
  sb.classList.toggle('dark', !!(e.opts.night || e.opts.darkbar));
  // fundo sólido na barra de status: o conteúdo que rola passa por baixo dela, sem ficar por cima do relógio
  const c = e.el.classList; let bg = 'transparent';
  if (c.contains('calc')) bg = '#000'; else if (c.contains('sos-bg')) bg = '#5A0A24'; else if (c.contains('night')) bg = 'var(--night)'; else if (c.contains('opaque')) bg = 'var(--bg)';
  sb.style.background = bg;
  mapx.show(!!e.opts.map);
  if (e.opts.map) mapx.setNight(!!e.opts.mapNight);
}
function wire(e) {
  $$('[data-back]', e.el).forEach(b => b.addEventListener('click', () => back()));
  e.cleanup = e.s.mount && e.s.mount(e.el, { go, back, tab, reset, refresh }) || null;
}
function focusTitle(e) {
  const h = $('h1', e.el); if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); announce(h.textContent); }
}
function animate(newE, oldE, kind) {
  const D = reduce() ? 1 : 420, ease = 'cubic-bezier(.22,1,.36,1)';
  const anims = [];
  const A = (el, kf, o = {}) => anims.push(el.animate(kf, { duration: D, easing: ease, fill: 'both', ...o }).finished.catch(() => {}));
  if (kind === 'none' || reduce()) { return Promise.resolve(); }
  const sheet = newE.el.classList.contains('overmap');
  if (kind === 'forward') {
    A(newE.el, [{ opacity: 0, transform: 'translateX(32px) scale(.985)' }, { opacity: 1, transform: 'none' }]);
    oldE && A(oldE.el, [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateX(-18px) scale(.985)' }], { duration: D * .75 });
  } else if (kind === 'back') {
    A(newE.el, [{ opacity: 0, transform: 'translateX(-24px) scale(.985)' }, { opacity: 1, transform: 'none' }]);
    oldE && A(oldE.el, [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateX(26px) scale(.985)' }], { duration: D * .75 });
  } else if (kind === 'up') {
    A(newE.el, [{ opacity: 0, transform: 'translateY(36px)' }, { opacity: 1, transform: 'none' }], { duration: D * 1.1 });
    oldE && A(oldE.el, [{ opacity: 1 }, { opacity: 0 }], { duration: D * .7 });
  } else if (kind === 'down') {
    A(newE.el, [{ opacity: 0 }, { opacity: 1 }], { duration: D * .8 });
    oldE && A(oldE.el, [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(40px)' }], { duration: D * .8 });
  } else { // fade / tab
    A(newE.el, [{ opacity: 0, transform: 'scale(.992)' }, { opacity: 1, transform: 'none' }], { duration: D * .7 });
    oldE && A(oldE.el, [{ opacity: 1 }, { opacity: 0 }], { duration: D * .6 });
  }
  return Promise.all(anims);
}
async function show(entry, kind, old) {
  const olds = [...$$('#screens > .screen')];
  if (old && old.cleanup) { try { old.cleanup(); } catch {} old.cleanup = null; } // limpa o antigo ANTES de montar o novo (que desenha no mapa)
  olds.forEach(o => o.style.pointerEvents = 'none');
  $('#screens').appendChild(entry.el);
  entry.el.style.zIndex = 2;
  paintChrome(entry);
  wire(entry);
  await animate(entry, old, kind);
  olds.forEach(o => o.remove());
  entry.el.style.zIndex = ''; entry.el.getAnimations().forEach(a => a.cancel());
  focusTitle(entry);
}
export function go(name, p, { anim = 'forward', replace = false } = {}) {
  const e = build(name, p);
  const prev = stack[stack.length - 1];
  if (replace && prev) stack.pop();
  stack.push(e);
  return show(e, anim, prev);
}
export function back(anim = 'back') {
  if (stack.length < 2) return;
  const gone = stack.pop();
  const e = build(stack[stack.length - 1].name, stack[stack.length - 1].p);
  stack[stack.length - 1] = e;
  return show(e, anim, gone);
}
export function tab(name) { return reset(name, {}, 'tab'); }
export function reset(name, p, anim = 'fade') {
  const e = build(name, p);
  const prev = stack[stack.length - 1];
  stack.length = 0; stack.push(e);
  return show(e, anim, prev);
}
export function refresh() { // re-renderiza a tela atual sem animação (ex.: mudou idioma/linguagem simples)
  const cur = stack[stack.length - 1]; if (!cur) return;
  const sc = $('.scroll', cur.el)?.scrollTop;
  if (cur.cleanup) { try { cur.cleanup(); } catch {} cur.cleanup = null; }
  const e = build(cur.name, cur.p); stack[stack.length - 1] = e;
  $$('#screens > .screen').forEach(o => o.remove());
  $('#screens').appendChild(e.el); paintChrome(e); wire(e);
  if (sc != null) { const s = $('.scroll', e.el); if (s) s.scrollTop = sc; }
}
export const current = () => stack[stack.length - 1];
export const depth = () => stack.length;
