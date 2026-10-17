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
export function speak(text) {
  if (!store.get().settings.voice || !('speechSynthesis' in window)) return;
  try { speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(text); u.lang = 'pt-BR'; u.rate = 1; speechSynthesis.speak(u); } catch {}
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
