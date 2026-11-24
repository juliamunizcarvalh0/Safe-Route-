import * as store from './store.js';
import * as router from './router.js';
import './screens/onboarding.js';
import './screens/home.js';
import './screens/nav.js';
import './screens/community.js';
import './screens/settings.js';
import './screens/transit.js';
import { $ } from './ui.js';
import * as ui from './ui.js';

store.applySettings();
// MobileDU 6.3 e 6.4: o jeito de tocar é escolhido pela pessoa (só vale para toque na tela; teclado e leitor de tela passam direto)
{
  let down = 0, last = null, lastAt = 0;
  document.addEventListener('pointerdown', () => { down = Date.now(); }, true);
  document.addEventListener('click', e => {
    if (!e.detail) return;
    const st = store.get().settings, held = Date.now() - down;
    if (st.tapMin && held < st.tapMin) { e.stopImmediatePropagation(); e.preventDefault(); return; }
    const b = e.target.closest && e.target.closest('[data-critical]'); if (!b || st.tapMode === 'simple') return;
    if (st.tapMode === 'long') { if (held < 600) { e.stopImmediatePropagation(); e.preventDefault(); ui.toast('Segure o botão por um instante para confirmar.'); } return; }
    if (last === b && Date.now() - lastAt < 1500) { last = null; return; }
    e.stopImmediatePropagation(); e.preventDefault(); last = b; lastAt = Date.now(); ui.toast('Toque de novo para confirmar.');
  }, true);
}
const fit = () => {
  const d = $('#device'); if (window.matchMedia('(max-width:760px),(max-height:620px)').matches) { d.style.transform = ''; return; }
  const sc = Math.min(1, (innerHeight - 24) / 870, (innerWidth - 24) / 420);
  d.style.transform = `scale(${sc})`; d.style.margin = `${-(844 * (1 - sc)) / 2}px ${-(390 * (1 - sc)) / 2}px`;
};
addEventListener('resize', fit); fit();
const tick = () => { $('#clock').textContent = new Date().toTimeString().slice(0, 5); }; tick(); setInterval(tick, 20000);
router.reset('splash', {}, 'none');
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
window.__router = router;
