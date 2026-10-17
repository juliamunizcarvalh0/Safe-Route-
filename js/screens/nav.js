import { register } from '../router.js';
import * as store from '../store.js';
import * as mapx from '../map.js';
import { here, cumulative, pointAt, makeProj, distPtSeg, hav, fmtDist, fmtMin } from '../geo.js';
import { ic } from '../icons.js';
import { label } from '../score.js';
import { $, $$, T, esc, toast, modal, confirmDialog, speak, vibrate, waLink, osmLink, announce } from '../ui.js';

const MODS = { 'slight left': 'upleft', 'slight right': 'upright', left: 'left', right: 'rightturn', 'sharp left': 'left', 'sharp right': 'rightturn', uturn: 'uturn', straight: 'up' };
const TXT = { left: 'Vire à esquerda', right: 'Vire à direita', 'slight left': 'Siga levemente à esquerda', 'slight right': 'Siga levemente à direita', 'sharp left': 'Faça a curva fechada à esquerda', 'sharp right': 'Faça a curva fechada à direita', uturn: 'Faça o retorno', straight: 'Siga em frente' };
export function stepInfo(st) {
  const on = st.name ? ` na ${st.name}`.replace(' na Rua ', ' na Rua ') : '';
  if (st.type === 'arrive') return { icon: 'pin', text: 'Você chegou ao destino' };
  if (st.type === 'depart') return { icon: 'up', text: 'Siga em frente' + (st.name ? ` pela ${st.name}` : '') };
  if (st.type === 'roundabout' || st.type === 'rotary') return { icon: 'uturn', text: `Entre na rotatória${st.exit ? ' e pegue a ' + st.exit + 'ª saída' : ''}` + on };
  if (st.type === 'end of road') return { icon: MODS[st.mod] || 'up', text: `No fim da rua, ${(TXT[st.mod] || 'siga em frente').toLowerCase()}` + on };
  if (st.type === 'fork') return { icon: MODS[st.mod] || 'up', text: `Mantenha-se à ${/left/.test(st.mod) ? 'esquerda' : 'direita'}` + on };
  if (st.type === 'continue' || st.type === 'new name' || st.type === 'merge') return { icon: MODS[st.mod] || 'up', text: (st.mod && st.mod !== 'straight' ? TXT[st.mod] : 'Continue') + on };
  return { icon: MODS[st.mod] || 'up', text: (TXT[st.mod] || 'Siga em frente') + on };
}
const clock = s => { const d = new Date(Date.now() + s * 1000); return d.toTimeString().slice(0, 5); };
function snap(coords, cum, lat, lon) {
  const pr = makeProj([lat, lon]); let best = { d: 1e9, s: 0 };
  for (let i = 1; i < coords.length; i++) {
    const a = pr(coords[i - 1][1], coords[i - 1][0]), b = pr(coords[i][1], coords[i][0]);
    const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy; let t = l2 ? (-a[0] * dx - a[1] * dy) / l2 : 0; t = Math.max(0, Math.min(1, t));
    const d = Math.hypot(a[0] + t * dx, a[1] + t * dy);
    if (d < best.d) best = { d, s: cum[i - 1] + t * (cum[i] - cum[i - 1]) };
  }
  return best;
}
export const alertText = (dest, extra = '') => `${extra}Estou indo a pé para ${dest?.name || 'meu destino'}. Chego por volta das ${clock(0)}. Local: ${osmLink(here.lat, here.lon)} — SafeRoute`;
export function shareModal(text, title = 'Avisar alguém de confiança') {
  const g = store.get().guardians;
  modal(`<h2 class="h-s">${esc(title)}</h2><p class="small">O SafeRoute não tem servidor: ele abre o WhatsApp com a mensagem pronta e você toca em enviar.</p>
    ${g.map(x => `<a class="btn primary" target="_blank" rel="noopener" href="${waLink(text, x.phone)}">${ic('send', 18)} ${esc(x.name)}</a>`).join('')}
    <a class="btn ${g.length ? 'soft' : 'primary'}" target="_blank" rel="noopener" href="${waLink(text)}">${ic('share', 18)} Escolher contato no WhatsApp</a>
    ${g.length ? '' : '<p class="small">Dica: cadastre pessoas de confiança em Rede › Contatos para enviar com um toque.</p>'}
    <button class="btn ghost" data-dismiss>Fechar</button>`);
}

register('nav', (p) => {
  const rt = p.route, dest = p.dest, night = store.isNight();
  const total0 = rt.coords.length ? 1 : 0; void total0;
  const l = label(rt.a?.score);
  return {
    opts: { map: true, mapNight: night, darkbar: night },
    html: `<div class="nav-top hit" role="status"><div class="nav-turn" id="n-ic">${ic('up', 36)}</div><div class="grow"><div class="h-n" id="n-d" style="font-size:1.75rem">—</div><div id="n-t" style="font-weight:600">Preparando…</div></div>
        <button class="iconbtn" id="n-voice" style="background:rgba(255,255,255,.14);color:#fff;box-shadow:none" aria-pressed="${store.get().settings.voice}" aria-label="Voz de orientação">${ic('volume', 20)}</button></div>
      <div id="off" class="hit banner risk" style="position:absolute;left:1rem;right:1rem;top:9.75rem;display:none;box-shadow:var(--shadow-lg)">${ic('alert', 18)}<span>Você saiu da rota. Volte ao caminho ou recalcule.</span></div>
      <button class="fab abs round hit" id="n-follow" style="right:1rem;top:9.75rem;display:none" aria-label="Centralizar no meu local">${ic('locate', 22)}</button>
      <div class="sheet nightsheet"><div class="grab"></div>
        <div class="eta"><div><b id="eta">—</b><div class="small" style="color:var(--on-dark-soft)" id="rem">—</div></div>${rt.a?.score != null ? `<span class="badge ${l.tone}">${ic('shield', 14)} ${rt.a.score} · ${l.t}</span>` : ''}</div>
        <div class="guard">${store.get().guardians.length ? `<div class="av">${store.get().guardians.slice(0, 3).map(g => `<span class="avatar rose">${esc(g.name[0].toUpperCase())}</span>`).join('')}</div><div class="grow">${T('Avise ' + esc(store.get().guardians[0].name) + (store.get().guardians.length > 1 ? ' e outras' : '') + ' pelo WhatsApp', 'Avise quem você confia')}</div>` : `${ic('users', 18)}<div class="grow">${T('Cadastre contatos de confiança em Rede.', 'Cadastre contatos em Rede.')}</div>`}</div>
        <div class="actions3"><button class="btn night" id="a-share">${ic('share', 22)}Avisar</button><button class="btn night" id="a-rep">${ic('flag', 22)}Relatar</button><button class="btn night" id="a-hide">${ic('eyeoff', 22)}Esconder</button></div>
        <div class="hrow" id="sim" style="flex-wrap:wrap"><span class="small" style="color:var(--on-dark-soft)">${here.source === 'demo' ? 'Simulação' : 'Modo'}:</span>
          ${['sim:1', 'sim:4', 'sim:10', 'gps'].map(k => `<button class="chip" style="background:var(--night);color:#fff;box-shadow:inset 0 0 0 1.5px #5b4a8a" data-m="${k}" role="radio" aria-checked="false">${k === 'gps' ? ic('locate', 14) + 'GPS real' : '×' + k.split(':')[1]}</button>`).join('')}</div>
        <div class="hrow"><button class="btn danger" id="a-sos" style="flex:1.2">${ic('shieldalert', 20)} SOS</button><button class="btn ghostd" id="a-end" style="flex:1">Encerrar</button></div>
      </div>`,
    mount(el, r) {
      mapx.clear(); const map = mapx.get(), L = mapx.L(), grp = mapx.group();
      const coords = rt.coords, cum = cumulative(coords), total = cum[cum.length - 1];
      const sumS = rt.steps.reduce((a, s) => a + s.dist, 0) || total, k = total / sumS;
      let acc = 0; const starts = rt.steps.map(s => { const v = acc * k; acc += s.dist; return v; });
      const ll = coords.map(c => [c[1], c[0]]);
      L.polyline(ll, { color: night ? '#0b0718' : '#fff', weight: 12, opacity: .9, lineCap: 'round', lineJoin: 'round' }).addTo(grp);
      const done = L.polyline([], { color: '#8F849F', weight: 7, lineCap: 'round' }).addTo(grp);
      const ahead = L.polyline(ll, { color: '#D6336C', weight: 7, lineCap: 'round', lineJoin: 'round' }).addTo(grp);
      mapx.pin(dest.lat, dest.lon, { color: '#3B1766', svg: ic('pin', 18), size: 36 });
      const you = L.marker(ll[0], { icon: mapx.youIcon(true), keyboard: false, interactive: false, zIndexOffset: 1000 }).addTo(grp);
      let s = 0, mult = 1, mode = here.source === 'gps' ? 'gps' : 'sim', follow = true, timer, watch, ended = false, announced = new Set(), t0 = Date.now(), firstView = true, lastOff = false;
      const setMode = m => {
        mode = m; $$('[data-m]', el).forEach(b => { const on = (m === 'gps' && b.dataset.m === 'gps') || (m === 'sim' && b.dataset.m === 'sim:' + mult); b.setAttribute('aria-checked', on); b.style.background = on ? '#fff' : 'var(--night)'; b.style.color = on ? 'var(--plum)' : '#fff'; });
        if (watch != null) { navigator.geolocation.clearWatch(watch); watch = null; }
        if (m === 'gps') {
          if (!navigator.geolocation) { toast('Seu aparelho não oferece GPS.', 'alert'); return setMode('sim'); }
          if (!store.get().consent.location) store.update(x => { x.consent.location = true; });
          watch = navigator.geolocation.watchPosition(pos => {
            here.lat = pos.coords.latitude; here.lon = pos.coords.longitude; here.source = 'gps';
            const sn = snap(coords, cum, here.lat, here.lon);
            lastOff = sn.d > 60; $('#off', el).style.display = lastOff ? 'flex' : 'none';
            s = Math.max(s, sn.s); update(lastOff ? [here.lat, here.lon] : null);
          }, () => { toast('Sem sinal de GPS. Voltando para a simulação.', 'alert', 3500); setMode('sim'); }, { enableHighAccuracy: true, maximumAge: 2000, timeout: 15000 });
        }
      };
      const update = (override) => {
        const pt = override ? { lat: override[0], lon: override[1] } : pointAt(coords, cum, s);
        you.setLatLng([pt.lat, pt.lon]);
        const i = pointAt(coords, cum, s).i;
        done.setLatLngs([...ll.slice(0, i), [pt.lat, pt.lon]]); ahead.setLatLngs([[pt.lat, pt.lon], ...ll.slice(i)]);
        if (follow) { mapx.view(pt.lat, pt.lon, firstView ? 17.5 : map.getZoom(), 120, !firstView); firstView = false; }
        const rem = Math.max(0, total - s), sec = rem / 1.3;
        $('#eta', el).textContent = fmtMin(sec); $('#rem', el).textContent = `${fmtDist(rem)} restantes · chegada ${clock(sec)}`;
        let j = starts.findIndex(v => v > s - 3); if (j < 0) j = rt.steps.length - 1; if (j === 0 && rt.steps.length > 1 && s < 8) j = 0;
        const st = rt.steps[j], info = stepInfo(st), dd = Math.max(0, starts[j] - s);
        $('#n-ic', el).innerHTML = ic(info.icon, 36); $('#n-d', el).textContent = dd < 8 && j > 0 ? 'Agora' : fmtDist(dd); $('#n-t', el).textContent = info.text;
        if (!announced.has(j) && (dd <= 60 || j === 0) && !(j === 0 && announced.size)) { announced.add(j); const m = Math.round(dd / 10) * 10; speak(j === 0 ? info.text : (dd < 20 ? info.text : `Em ${m} metros, ${info.text}`)); if (j > 0) vibrate([180]); announce(info.text); }
        if (rem < 18 && !ended) arrive();
      };
      const arrive = () => { ended = true; vibrate([200, 100, 200]); speak('Você chegou ao destino.'); r.go('arrived', { dest, route: rt, secs: (Date.now() - t0) / 1000 }, { anim: 'fade', replace: true }); };
      const tick = () => { if (mode === 'sim' && !ended) { s = Math.min(total, s + 1.4 * mult); update(); } };
      timer = setInterval(tick, 1000); update();
      $$('[data-m]', el).forEach(b => b.onclick = () => { if (b.dataset.m === 'gps') setMode('gps'); else { mult = +b.dataset.m.split(':')[1]; setMode('sim'); } });
      setMode(mode);
      map.on('dragstart', () => { follow = false; $('#n-follow', el).style.display = 'flex'; });
      $('#n-follow', el).onclick = () => { follow = true; $('#n-follow', el).style.display = 'none'; update(); };
      const v = $('#n-voice', el); v.onclick = () => { const on = !store.get().settings.voice; store.update(x => x.settings.voice = on); v.setAttribute('aria-pressed', on); v.style.opacity = on ? 1 : .5; if (!on) speechSynthesis?.cancel(); toast(on ? 'Voz ligada' : 'Voz desligada', 'volume'); };
      v.style.opacity = store.get().settings.voice ? 1 : .5;
      $('#a-share', el).onclick = () => shareModal(alertText(dest));
      $('#a-rep', el).onclick = () => r.go('report-new', { fromNav: true, loc: { lat: you.getLatLng().lat, lon: you.getLatLng().lng } }, { anim: 'up' });
      $('#a-hide', el).onclick = () => r.go('calc', {}, { anim: 'fade' });
      $('#a-sos', el).onclick = () => r.go('sos', {}, { anim: 'up' });
      $('#a-end', el).onclick = async () => { if (await confirmDialog({ title: 'Encerrar caminhada?', body: 'O acompanhamento será finalizado.', ok: 'Encerrar', cancel: 'Continuar' })) r.reset('home', {}, 'down'); };
      return () => { clearInterval(timer); if (watch != null) navigator.geolocation.clearWatch(watch); map.off('dragstart'); speechSynthesis?.cancel?.(); };
    }
  };
});

register('arrived', (p) => ({
  opts: {},
  html: `<div class="scroll bar" style="justify-content:center;gap:1.25rem"><div class="confetti">${'<span class="core">' + ic('check', 34) + '</span>'}</div>
    <div class="center stack" style="gap:.5rem"><h1 class="h-m">${T('Você chegou bem!', 'Você chegou!')}</h1><p class="lead">${esc(p.dest.name)}<br>${fmtMin(p.secs > 5 ? p.secs : p.route.dur)} · ${fmtDist(p.route.dist)}</p></div>
    <div class="stack"><div class="strong center">Como foi o caminho?</div><div class="chips" role="radiogroup" aria-label="Como foi o caminho" style="justify-content:center">
      ${[['ok', 'smile', 'Tranquilo'], ['meh', 'meh', 'Mais ou menos'], ['bad', 'frown', 'Não me senti segura']].map(([k, i, t]) => `<button class="chip" role="radio" aria-checked="false" data-fb="${k}">${ic(i, 18)}${t}</button>`).join('')}</div>
      <p class="small center">Sua resposta fica só no seu aparelho e ajuda a calibrar o app com você.</p></div></div>
    <div class="bar-fixed"><button class="btn soft" id="a-tell">${ic('send', 18)} Avisar que cheguei</button><button class="btn primary" id="a-done">Concluir</button></div>`,
  mount(el, r) {
    let fb = null; $$('[data-fb]', el).forEach(b => b.onclick = () => { fb = b.dataset.fb; $$('[data-fb]', el).forEach(x => x.setAttribute('aria-checked', x === b)); if (fb === 'bad') toast('Sentimos muito. Você pode relatar o que aconteceu em Relatos.', 'heart', 3800); });
    $('#a-tell', el).onclick = () => shareModal(`Cheguei bem em ${p.dest.name}. 💜 — SafeRoute`, 'Avisar que cheguei');
    $('#a-done', el).onclick = () => { store.update(s => s.trips.unshift({ ts: Date.now(), dest: p.dest.name, dist: Math.round(p.route.dist), score: p.route.a?.score ?? null, fb })); r.reset('home', {}, 'fade'); };
  }
}));

/* ---------------- SOS ---------------- */
export function sosMessage() { return `🚨 PRECISO DE AJUDA. Minha localização: ${osmLink(here.lat, here.lon)} (enviado pelo SafeRoute às ${clock(0)})`; }
register('sos', () => ({
  opts: { cls: 'night sos-bg', darkbar: true },
  html: `<div class="scroll" style="align-items:stretch;gap:1.25rem">${`<div class="hdr"><button class="iconbtn" data-back aria-label="Voltar" style="background:rgba(255,255,255,.14);color:#fff;box-shadow:none">${ic('back', 22)}</button><h1 class="grow" tabindex="-1" style="font-family:Fraunces,serif;font-size:1.375rem;font-weight:600">Pedir ajuda</h1></div>`}
    <p style="text-align:center;color:var(--on-dark-soft)">${T('Segure o botão por 2 segundos para avisar seus contatos de confiança.', 'Segure o botão por 2 segundos.')}</p>
    <div class="holdwrap"><svg viewBox="0 0 240 240" aria-hidden="true"><circle cx="120" cy="120" r="108" fill="none" stroke="rgba(255,255,255,.18)" stroke-width="10"/><circle id="ring" cx="120" cy="120" r="108" fill="none" stroke="#fff" stroke-width="10" stroke-linecap="round" stroke-dasharray="679" stroke-dashoffset="679"/></svg>
      <button class="holdbtn" id="hold" aria-label="SOS. Segure por 2 segundos para ativar"><span>SOS</span></button></div>
    <div class="stack" style="gap:.625rem"><button class="btn white" id="alt">Ativar sem segurar (confirmar)</button><a class="btn ghostd" href="tel:190">${ic('phone', 20)} Ligar 190 · Polícia</a><button class="btn ghostd" id="hide">${ic('eyeoff', 20)} Esconder o app (modo discreto)</button></div>
    <p class="small" style="color:var(--on-dark-soft);text-align:center">Em perigo imediato, ligue 190. O SafeRoute não substitui os serviços de emergência.</p></div>`,
  mount(el, r) {
    const hold = $('#hold', el), ring = $('#ring', el); let raf, t0 = 0, active = false;
    const reset = () => { cancelAnimationFrame(raf); active = false; t0 = 0; hold.classList.remove('holding'); ring.style.transition = 'stroke-dashoffset .3s'; ring.style.strokeDashoffset = 679; };
    const trigger = () => { reset(); vibrate([200, 100, 200, 100, 400]); r.go('sos-active', {}, { anim: 'fade', replace: true }); };
    const loop = () => { const f = Math.min(1, (performance.now() - t0) / 2000); ring.style.strokeDashoffset = 679 * (1 - f); if (f >= 1) trigger(); else raf = requestAnimationFrame(loop); };
    const start = e => { if (active) return; active = true; t0 = performance.now(); hold.classList.add('holding'); ring.style.transition = 'none'; vibrate(30); raf = requestAnimationFrame(loop); };
    hold.addEventListener('pointerdown', e => { e.preventDefault(); hold.setPointerCapture?.(e.pointerId); start(); });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(ev => hold.addEventListener(ev, reset));
    hold.addEventListener('keydown', e => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); start(); } });
    hold.addEventListener('keyup', e => { if (e.key === ' ' || e.key === 'Enter') reset(); });
    hold.addEventListener('contextmenu', e => e.preventDefault());
    $('#alt', el).onclick = async () => { if (await confirmDialog({ title: 'Ativar o alerta SOS?', body: 'Vamos preparar a mensagem com sua localização para seus contatos.', ok: 'Ativar agora', danger: true })) trigger(); };
    $('#hide', el).onclick = () => r.go('calc', {}, { anim: 'fade' });
    return reset;
  }
}));

register('sos-active', () => {
  const g = store.get().guardians, msg = sosMessage();
  return {
    opts: { cls: 'night sos-bg', darkbar: true },
    html: `<div class="scroll" style="gap:1rem"><div class="center stack" style="align-items:center;gap:.5rem;margin-top:.5rem"><div class="tile" style="width:4.5rem;height:4.5rem;background:var(--risk);color:#fff;border-radius:50%;animation:pop .6s var(--ease)">${ic('shieldalert', 34)}</div><h1 class="h-m" style="color:#fff" tabindex="-1">Alerta pronto</h1><p style="color:var(--on-dark-soft)">${T('Envie agora para quem pode te ajudar. Toque em cada botão.', 'Toque nos botões para pedir ajuda.')}</p></div>
      <div class="card" style="background:var(--night-surface);box-shadow:none;color:#fff"><div class="small" style="color:var(--on-dark-soft)">Mensagem</div><div style="font-size:.875rem">${esc(msg)}</div></div>
      <div class="stack" style="gap:.625rem"><a class="btn danger" href="tel:190">${ic('phone', 20)} Ligar 190 · Polícia Militar</a>
        ${g.map(x => `<a class="btn white" target="_blank" rel="noopener" href="${waLink(msg, x.phone)}">${ic('send', 18)} Enviar para ${esc(x.name)}</a>`).join('')}
        <a class="btn ${g.length ? 'night' : 'white'}" target="_blank" rel="noopener" href="${waLink(msg)}">${ic('share', 18)} Enviar para outro contato</a>
        <a class="btn night" href="tel:180">${ic('phone', 18)} Ligar 180 · Central da Mulher</a></div>
      <div class="banner alt" style="background:var(--night-surface);color:var(--on-dark-soft)">${ic('info', 18)}<span>Nada é enviado automaticamente: o SafeRoute não tem servidor. Os botões abrem o WhatsApp ou o telefone.</span></div>
      <button class="btn ghostd" id="ok">Estou segura · encerrar</button></div>`,
    mount(el, r) { vibrate([300, 150, 300]); $('#ok', el).onclick = () => r.reset('home', {}, 'down'); }
  };
});

/* ---------------- modo discreto (calculadora) ---------------- */
register('calc', () => ({
  opts: { cls: 'night calc', darkbar: true },
  html: `<div class="disp-n" id="cd" aria-live="polite" role="status">0</div><div class="keys" id="keys" role="group" aria-label="Calculadora">
    ${[['AC', 'fn'], ['±', 'fn'], ['%', 'fn'], ['÷', 'op'], ['7'], ['8'], ['9'], ['×', 'op'], ['4'], ['5'], ['6'], ['−', 'op'], ['1'], ['2'], ['3'], ['+', 'op'], ['0', 'zero'], [',', ''], ['=', 'op']].map(([k, c]) => `<button class="key ${c || ''}" data-k="${k}" ${k === '=' ? 'aria-label="igual"' : ''}>${k}</button>`).join('')}</div>`,
  mount(el, r) {
    let cur = '0', acc = null, op = null, fresh = true; const cd = $('#cd', el);
    const show = () => { let t = cur.replace('.', ','); cd.textContent = t.length > 9 ? Number(cur).toExponential(3) : t; cd.style.fontSize = t.length > 7 ? '3rem' : ''; $$('.key.op', el).forEach(b => b.classList.toggle('act', fresh && op && b.dataset.k === op)); };
    const calc = (a, b, o) => o === '+' ? a + b : o === '−' ? a - b : o === '×' ? a * b : o === '÷' ? (b === 0 ? NaN : a / b) : b;
    const fmt = n => isFinite(n) ? String(+n.toPrecision(10)) : 'Erro';
    const press = k => {
      if (/\d/.test(k)) { cur = fresh || cur === '0' ? k : cur + k; fresh = false; }
      else if (k === ',') { if (fresh) { cur = '0.'; fresh = false; } else if (!cur.includes('.')) cur += '.'; }
      else if (k === 'AC') { cur = '0'; acc = null; op = null; fresh = true; }
      else if (k === '±') cur = fmt(-Number(cur));
      else if (k === '%') cur = fmt(Number(cur) / 100);
      else if (k === '=') { if (op && acc != null) { cur = fmt(calc(acc, Number(cur), op)); acc = null; op = null; fresh = true; } }
      else { if (op && acc != null && !fresh) { cur = fmt(calc(acc, Number(cur), op)); } acc = Number(cur); op = k; fresh = true; }
      show();
    };
    $$('.key', el).forEach(b => { if (b.dataset.k !== '=') b.onclick = () => press(b.dataset.k); });
    // segurar "=" por 2s volta ao app
    const eq = $('[data-k="="]', el); let t;
    const down = e => { e.preventDefault(); t = setTimeout(() => { t = null; vibrate(80); r.reset('home', {}, 'fade'); }, 2000); };
    const up = () => { if (t) { clearTimeout(t); t = null; press('='); } };
    eq.addEventListener('pointerdown', down); ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => eq.addEventListener(ev, up));
    eq.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) { e.preventDefault(); down(e); } });
    eq.addEventListener('keyup', e => { if (e.key === 'Enter' || e.key === ' ') up(); });
    show(); return () => clearTimeout(t);
  }
}));
