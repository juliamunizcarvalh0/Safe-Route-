import * as store from './store.js';
import { ic } from './icons.js';
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// linguagem simples: T('texto normal','texto simples')
export const T = (n, s) => (store.get().settings.simple && s) ? s : n;
export function toast(msg, icon = 'info', ms = 2600) {
  const t = $('#toast'); t.innerHTML = ic(icon, 20) + `<span>${esc(msg)}</span>`;
  t.classList.add('show'); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), ms);
  announce(msg);
}
export function announce(msg) { const l = $('#live-region'); l.textContent = ''; setTimeout(() => l.textContent = msg, 30); }
export function vibrate(p) { if (store.get().settings.vibrate && navigator.vibrate) try { navigator.vibrate(p); } catch {} }
/* Voz feminina: o navegador não informa o gênero das vozes, então escolhemos pelo nome (vozes pt-BR conhecidas). */
const FEM = /(female|feminin|francisca|maria|luciana|fernanda|vit[oó]ria|camila|isabela|raquel|helena|google portugu[eê]s do brasil|google português)/i;
const MASC = /(male\b|masculin|daniel|felipe|antonio|antônio|donato|ricardo|thiago|jo[aã]o|luciano)/i;
let voicePick;
function pickVoice() {
  const all = speechSynthesis.getVoices();
  if (!all.length) return null;
  if (voicePick && all.includes(voicePick)) return voicePick;
  const br = all.filter(v => /^pt[-_]BR/i.test(v.lang));
  const pool = br.length ? br : all.filter(v => /^pt/i.test(v.lang));
  voicePick = pool.find(v => FEM.test(v.name) && !MASC.test(v.name)) || pool.find(v => !MASC.test(v.name)) || pool[0] || null;
  return voicePick;
}
if ('speechSynthesis' in window) { try { speechSynthesis.getVoices(); speechSynthesis.addEventListener('voiceschanged', () => { voicePick = null; }); } catch {} }
export function speak(text) {
  if (!store.get().settings.voice || !('speechSynthesis' in window)) return;
  try {
    speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(text); u.lang = 'pt-BR'; u.rate = 1;
    const v = pickVoice(); if (v) { u.voice = v; u.lang = v.lang; if (!FEM.test(v.name)) u.pitch = 1.25; } else u.pitch = 1.25;
    speechSynthesis.speak(u);
  } catch {}
}
export function relTime(ts) {
  const m = Math.round((Date.now() - ts) / 60000);
  if (m < 1) return 'agora'; if (m < 60) return `há ${m} min`;
  const h = Math.round(m / 60); if (h < 24) return `há ${h} h`; const d = Math.round(h / 24); return `há ${d} d`;
}
export function debounce(fn, ms) { let t; const f = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; f.cancel = () => clearTimeout(t); return f; }
export const download = (name, text, type = 'application/json') => {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
};
export const waLink = (text, phone = '') => `https://wa.me/${phone.replace(/\D/g, '')}?text=${encodeURIComponent(text)}`;
export const osmLink = (lat, lon) => `https://www.openstreetmap.org/?mlat=${lat.toFixed(5)}&mlon=${lon.toFixed(5)}#map=18/${lat.toFixed(5)}/${lon.toFixed(5)}`;

let closing = null;
export function modal(html, { dismissible = true, onMount } = {}) {
  const ov = $('#overlay'); clearTimeout(closing);
  ov.innerHTML = `<div class="scrim" data-close></div><div class="modal" role="dialog" aria-modal="true"><div class="grab" style="background:var(--line);width:2.5rem;height:.25rem;border-radius:.125rem;margin:0 auto"></div>${html}</div>`;
  const m = $('.modal', ov); const prev = document.activeElement;
  const close = () => { ov.classList.remove('open'); closing = setTimeout(() => { ov.innerHTML = ''; }, 420); document.removeEventListener('keydown', key); prev && prev.focus && prev.focus(); };
  const key = e => { if (e.key === 'Escape' && dismissible) close(); };
  document.addEventListener('keydown', key);
  if (dismissible) $('[data-close]', ov).addEventListener('click', close);
  $$('[data-dismiss]', ov).forEach(b => b.addEventListener('click', close));
  requestAnimationFrame(() => requestAnimationFrame(() => ov.classList.add('open')));
  setTimeout(() => (m.querySelector('[autofocus],button,input') || m).focus?.({ preventScroll: true }), 120);
  onMount && onMount(m, close);
  return close;
}
export function confirmDialog({ title, body, ok = 'Confirmar', cancel = 'Cancelar', danger = false }) {
  return new Promise(res => {
    let done = false;
    const close = modal(`<h2 class="h-s">${esc(title)}</h2><p class="lead">${esc(body)}</p>
      <button class="btn ${danger ? 'danger' : 'primary'}" data-ok>${esc(ok)}</button>
      <button class="btn ghost" data-no>${esc(cancel)}</button>`, {
      onMount: (m, c) => {
        $('[data-ok]', m).onclick = () => { done = true; c(); res(true); };
        $('[data-no]', m).onclick = () => { done = true; c(); res(false); };
      }
    });
  });
}
export const toggle = (id, on, label) => `<button class="tg" role="switch" id="${id}" aria-checked="${!!on}" aria-label="${esc(label)}"></button>`;
export function bindToggle(el, fn) { el.addEventListener('click', () => { const v = el.getAttribute('aria-checked') !== 'true'; el.setAttribute('aria-checked', v); fn(v); }); }
export function header(title, { back = true, right = '' } = {}) {
  return `<div class="hdr">${back ? `<button class="iconbtn" data-back aria-label="Voltar">${ic('back', 22)}</button>` : ''}<h1 class="grow" tabindex="-1">${esc(title)}</h1>${right}</div>`;
}

// Painel (bottom sheet) que o usuário pode arrastar pela alça: recolhido · padrão · expandido
export function resizable(sheet, { onChange } = {}) {
  const handle = $('.grab', sheet); if (!handle) return;
  handle.classList.add('handle'); handle.setAttribute('role', 'button'); handle.tabIndex = 0;
  handle.setAttribute('aria-label', 'Redimensionar painel. Arraste ou use as setas para cima e para baixo.');
  const H = () => (sheet.parentElement?.clientHeight || 844);
  const base = { max: sheet.style.maxHeight };
  let custom = false;
  const natural = () => { const h0 = sheet.style.height, m0 = sheet.style.maxHeight; sheet.style.transition = 'none'; sheet.style.height = 'auto'; sheet.style.maxHeight = base.max || ''; const n = sheet.offsetHeight; sheet.style.height = h0; sheet.style.maxHeight = m0; return n; };
  const snaps = () => { const full = Math.round(H() * .78), nat = Math.min(natural(), Math.round(H() * .66)), peek = Math.min(150, nat); return [...new Set([peek, nat, full])].sort((a, b) => a - b); };
  const apply = (h, animate = true) => {
    sheet.style.transition = animate ? 'height .38s cubic-bezier(.22,1,.36,1)' : 'none';
    sheet.style.maxHeight = 'none'; sheet.style.height = h + 'px'; custom = true;
    if (animate) setTimeout(() => onChange && onChange(h), 400);
  };
  let drag = null;
  handle.addEventListener('pointerdown', e => {
    e.preventDefault(); handle.setPointerCapture?.(e.pointerId);
    const h = sheet.offsetHeight; drag = { y: e.clientY, h, sc: (sheet.getBoundingClientRect().height / h) || 1, moved: false, s: snaps() };
  });
  handle.addEventListener('pointermove', e => {
    if (!drag) return; const dy = (drag.y - e.clientY) / drag.sc; if (Math.abs(dy) > 3) drag.moved = true;
    apply(Math.max(90, Math.min(H() * .8, drag.h + dy)), false);
  });
  const end = () => {
    if (!drag) return; const d = drag; drag = null;
    const cur = sheet.offsetHeight, list = d.s;
    if (!d.moved) { const i = list.findIndex(v => v >= cur - 4); apply(list[(Math.max(0, i) + 1) % list.length]); return; }
    // inércia simples: soltar perto de um ponto de parada
    apply(list.reduce((a, b) => Math.abs(b - cur) < Math.abs(a - cur) ? b : a));
  };
  handle.addEventListener('pointerup', end); handle.addEventListener('pointercancel', end);
  handle.addEventListener('keydown', e => {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown' && e.key !== 'Enter' && e.key !== ' ') return; e.preventDefault();
    const list = snaps(), cur = sheet.offsetHeight, i = list.reduce((bi, v, k) => Math.abs(v - cur) < Math.abs(list[bi] - cur) ? k : bi, 0);
    const n = e.key === 'ArrowUp' ? Math.min(list.length - 1, i + 1) : e.key === 'ArrowDown' ? Math.max(0, i - 1) : (i + 1) % list.length;
    apply(list[n]);
  });
}
