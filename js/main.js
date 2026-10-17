import * as store from './store.js';
import * as router from './router.js';
import './screens/onboarding.js';
import './screens/home.js';
import './screens/nav.js';
import './screens/community.js';
import './screens/settings.js';
import { $ } from './ui.js';

store.applySettings();
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
