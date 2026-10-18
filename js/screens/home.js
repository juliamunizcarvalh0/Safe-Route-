import { register } from '../router.js';
import * as store from '../store.js';
import * as mapx from '../map.js';
import * as net from '../net.js';
import { here, requestGPS, hav, fmtDist, fmtMin, bboxOf } from '../geo.js';
import { ic } from '../icons.js';
import { analyze, label, PART_LABEL, WEIGHTS } from '../score.js';
import { allReports, CATS, HOTSPOTS, LANDMARKS } from '../data.js';
import { $, $$, T, esc, toast, debounce, modal, waLink, osmLink, vibrate, resizable } from '../ui.js';
import { openReport } from './community.js';
import { contestModal } from './nav.js';

let gpsTried = false;
function greeting() { const h = new Date().getHours(); return h < 5 ? 'Boa madrugada' : h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'; }
export function drawReports(on) {
  if (!on) return; const g = mapx.group();
  allReports().forEach(r => {
    const c = CATS[r.cat] || CATS.other;
    mapx.pin(r.lat, r.lon, { color: c.color, svg: ic(c.icon, 16), size: 32, title: c.label }).on('click', () => openReport(r));
  });
}
export function drawHotspots(on) {
  if (!on) return; const L = mapx.L(), g = mapx.group();
  HOTSPOTS.forEach(h => L.circle([h.lat, h.lon], { radius: h.r, stroke: false, fillColor: '#C92A2A', fillOpacity: .12 + .18 * h.w, interactive: false }).addTo(g));
}
function drawYou() { mapx.pin(here.lat, here.lon, {}); } // substituído abaixo
const placeIcon = k => k === 'home' ? 'home' : k === 'work' ? 'briefcase' : 'star';

register('home', () => {
  if (store.get().share && Date.now() - store.get().share.ts > 3 * 3600e3) store.update(x => x.share = null); // compartilhamento expira em 3 h
  const st = store.get(), s = st.settings;
  const places = st.places; const byKind = k => places.find(p => p.kind === k);
  const slot = (k, lbl) => { const p = byKind(k); return `<button class="chip" data-slot="${k}">${ic(placeIcon(k), 18)}${p ? esc(lbl) : esc(lbl) + ' · definir'}</button>`; };
  const favs = places.filter(p => p.kind === 'fav').map(p => `<button class="chip" data-place="${p.id}">${ic('star', 18)}${esc(p.name.slice(0, 18))}</button>`).join('');
  const recents = st.recents.slice(0, 2).map((p, i) => `<button class="sugg" data-recent="${i}"><div class="tile alt">${ic('clock', 20)}</div><div class="grow"><div class="strong">${esc(p.name)}</div><div class="small">${esc(p.sub || '')}</div></div>${ic('right', 18)}</button>`).join('');
  return {
    opts: { map: true, tabs: true },
    html: `<div class="topbar"><button class="search hit" data-search aria-label="Buscar destino">${ic('search', 22)}<span>${T('Para onde vamos?', 'Para onde você vai?')}</span></button>${st.share ? `<div class="banner safe hit" style="margin-top:.5rem">${ic('share', 18)}<span class="grow">Aviso ativo${st.share.dest ? ' para ' + esc(st.share.dest) : ''}. Expira em até 3 h.</span><button class="chip" data-endshare>Encerrar</button></div>` : ''}</div>
      <div class="hit" style="position:absolute;right:1rem;top:7.5rem;display:flex;flex-direction:column;gap:.625rem;align-items:flex-end">
        <button class="fab round" data-locate aria-label="Minha localização">${ic('locate', 22)}</button>
        <button class="fab round" data-layer="reports" aria-pressed="${s.layers.reports}" aria-label="Mostrar relatos no mapa" style="${s.layers.reports ? 'background:var(--plum);color:#fff' : ''}">${ic('flag', 22)}</button>
        <button class="fab round" data-layer="hotspots" aria-pressed="${s.layers.hotspots}" aria-label="Mostrar áreas de atenção (dados ilustrativos)" style="${s.layers.hotspots ? 'background:var(--plum);color:#fff' : ''}">${ic('layers', 22)}</button>
        <button class="fab sos" data-sos aria-label="SOS — pedir ajuda">${ic('shieldalert', 22)}SOS</button>
      </div>
      <div class="sheet withtabs"><div class="grab"></div>
        ${here.source === 'demo' ? `<div class="banner warn">${ic('info', 18)}<div>${T('Mostrando um local de demonstração (Consolação, São Paulo).', 'Local de demonstração.')} <button class="strong" style="text-decoration:underline" data-gps>Usar minha localização</button></div></div>` : ''}
        <div><div class="over">${greeting()}</div><h2 class="h-s">${T('Para onde vamos?', 'Para onde você vai?')}</h2></div>
        <div class="chips nowrap">${slot('home', 'Casa')}${slot('work', 'Trabalho')}${favs}<button class="chip" data-slot="fav" aria-label="Adicionar favorito">${ic('plus', 18)}</button></div>
        ${recents}
        ${s.layers.hotspots ? `<div class="small">${ic('alert', 14)} Áreas em vermelho: <b>dados ilustrativos</b>, não oficiais.</div>` : ''}
        ${store.isNight() ? `<div class="banner alt">${ic('moon', 18)}<span>${T('É noite: priorizamos ruas iluminadas e com movimento.', 'É noite. Damos mais valor a ruas com luz.')}</span></div>` : ''}
      </div>`,
    mount(el, r) {
      const map = mapx.get(); mapx.clear();
      const drawAll = () => { mapx.clear(); drawReports(store.get().settings.layers.reports); drawHotspots(store.get().settings.layers.hotspots); st.places.forEach(p => mapx.pin(p.lat, p.lon, { color: '#3B1766', svg: ic(placeIcon(p.kind), 16), size: 30 })); youM = mapx.L().marker([here.lat, here.lon], { icon: mapx.youIcon(), keyboard: false, interactive: false, zIndexOffset: 1000 }).addTo(mapx.group()); };
      let youM; drawAll();
      mapx.view(here.lat, here.lon, 15, 110, false);
      resizable($('.sheet', el));
      const es = $('[data-endshare]', el); if (es) es.onclick = () => { store.update(x => x.share = null); r.reset('home', {}, 'fade'); toast('Aviso encerrado', 'check'); };
      $('[data-search]', el).onclick = () => r.go('search', { mode: 'dest' }, { anim: 'up' });
      $('[data-sos]', el).onclick = () => r.go('sos', {}, { anim: 'up' });
      $('[data-locate]', el).onclick = async () => {
        if (!store.get().consent.location) { askLocation(r); return; }
        try { await requestGPS(); drawAll(); mapx.flyTo(here.lat, here.lon, 16, 110); } catch { toast('Não consegui sua localização agora.', 'alert'); mapx.flyTo(here.lat, here.lon, 16, 110); }
      };
      const g = $('[data-gps]', el); if (g) g.onclick = () => askLocation(r);
      $$('[data-layer]', el).forEach(b => b.onclick = () => { store.update(s => s.settings.layers[b.dataset.layer] = !s.settings.layers[b.dataset.layer]); r.refresh(); });
      $$('[data-slot]', el).forEach(b => b.onclick = () => { const k = b.dataset.slot, p = byKind(k); p ? r.go('routes', { dest: p }) : r.go('search', { mode: 'save', kind: k }, { anim: 'up' }); });
      $$('[data-place]', el).forEach(b => b.onclick = () => r.go('routes', { dest: places.find(p => p.id === b.dataset.place) }));
      $$('[data-recent]', el).forEach(b => b.onclick = () => r.go('routes', { dest: st.recents[+b.dataset.recent] }));
      if (store.get().consent.location && here.source === 'demo' && !gpsTried) { gpsTried = true; requestGPS(7000).then(() => { r.refresh(); }).catch(() => toast('Sem GPS agora. Usando local de demonstração.', 'info', 3200)); }
      return () => {};
    }
  };
});
async function askLocation(r) {
  store.update(s => { s.consent.location = true; s.consent.at = Date.now(); });
  try { await requestGPS(9000); toast('Localização ativada', 'check'); r.refresh(); } catch { toast('O navegador não liberou a localização. Verifique a permissão do site.', 'alert', 4200); }
}

/* ---------------- busca ---------------- */
register('search', (p) => {
  const st = store.get();
  const title = p.title || (p.mode === 'save' ? (p.kind === 'home' ? 'Definir casa' : p.kind === 'work' ? 'Definir trabalho' : 'Novo favorito') : 'Para onde vamos?');
  return {
    opts: {},
    html: `<div class="scroll" style="gap:1rem"><div class="hdr"><button class="iconbtn" data-back aria-label="Voltar">${ic('back', 22)}</button><h1 class="grow" tabindex="-1" style="font-family:Fraunces,serif;font-size:1.25rem;color:var(--plum);font-weight:600">${title}</h1></div>
      <div class="field"><label for="q" class="sr-only">Buscar endereço ou lugar</label><div class="search" style="box-shadow:inset 0 0 0 2px var(--plum);min-height:3.5rem">${ic('search', 22)}<input id="q" class="grow" style="border:0;outline:0;background:none;font-size:1rem;min-width:0" type="search" inputmode="search" enterkeyhint="search" autocomplete="off" autocapitalize="sentences" placeholder="Rua, bairro ou lugar" aria-controls="res"><button id="clr" class="iconbtn" style="width:2.25rem;height:2.25rem;box-shadow:none;display:none" aria-label="Limpar">${ic('x', 18)}</button></div></div>
      <div id="res" class="stack" style="gap:.25rem" aria-live="polite"></div></div>`,
    mount(el, r) {
      const q = $('#q', el), res = $('#res', el), clr = $('#clr', el);
      let ctl, results = [];
      const row = (it, i, icon = 'pin') => `<button class="sugg" data-i="${i}"><div class="tile alt">${ic(icon, 20)}</div><div class="grow"><div class="strong">${esc(it.name)}</div><div class="small">${esc(it.sub || '')}${it.dist != null ? ' · ' + fmtDist(it.dist) : ''}</div></div></button>`;
      const choose = it => {
        if (p.mode === 'pick') { p.onChoose(it); return; }
        if (p.mode === 'save') {
          store.update(s => { if (p.kind !== 'fav') s.places = s.places.filter(x => x.kind !== p.kind); s.places.push({ id: store.uid(), kind: p.kind, name: it.name, sub: it.sub, lat: it.lat, lon: it.lon }); });
          toast('Salvo', 'check'); r.back('down');
        } else {
          store.update(s => { s.recents = [it, ...s.recents.filter(x => x.name !== it.name)].slice(0, 6); });
          r.go('routes', { dest: it });
        }
      };
      const bindRows = () => $$('[data-i]', res).forEach(b => b.onclick = () => choose(results[+b.dataset.i]));
      const mapRow = `<button class="sugg" data-pick><div class="tile">${ic('pin', 20)}</div><div class="grow strong">Escolher no mapa</div>${ic('right', 18)}</button>`;
      const home = () => {
        results = [...st.places.map(p => ({ ...p })), ...st.recents];
        if (p.mode === 'pick' && p.allowHere) { results.unshift({ name: 'Minha localização', sub: here.source === 'gps' ? 'GPS' : 'Local de demonstração', lat: here.lat, lon: here.lon, isHere: true }); }
        res.innerHTML = mapRow + (results.length ? `<div class="over" style="margin:.75rem 0 .25rem">Salvos e recentes</div>` + results.map((it, i) => row(it, i, it.isHere ? 'locate' : it.kind ? placeIcon(it.kind) : 'clock')).join('') : `<div class="small" style="padding:.75rem .25rem">Digite um endereço ou lugar. A busca usa dados abertos do OpenStreetMap.</div>`);
        bindRows(); bindPick();
      };
      const bindPick = () => { const b = $('[data-pick]', res); if (b) b.onclick = () => r.go('pick', { title: 'Escolher no mapa', confirm: 'Usar este local', onPick: place => { r.back(); setTimeout(() => choose(place), 60); } }); };
      const run = debounce(async () => {
        const v = q.value.trim(); if (v.length < 3) { home(); return; }
        ctl && ctl.abort(); ctl = new AbortController();
        res.innerHTML = [1, 2, 3].map(() => `<div class="sugg"><div class="skeleton" style="width:2.75rem;height:2.75rem"></div><div class="grow stack" style="gap:.4rem"><div class="skeleton" style="width:70%"></div><div class="skeleton" style="width:45%;height:.75rem"></div></div></div>`).join('');
        try {
          const rs = await net.search(v, { signal: ctl.signal });
          results = rs.map(x => ({ ...x, dist: hav([here.lat, here.lon], [x.lat, x.lon]) }));
          res.innerHTML = results.length ? results.map((it, i) => row(it, i)).join('') : `<div class="card alt" style="box-shadow:none"><div class="head">Nada encontrado</div><div class="small">Tente outro nome, o bairro ou a cidade. Você também pode escolher no mapa.</div></div>${mapRow}`;
          bindRows(); bindPick();
        } catch (e) {
          if (ctl.signal.aborted) return;
          const n = v.toLowerCase(); results = LANDMARKS.filter(l => l.name.toLowerCase().includes(n) || n.split(' ').some(w => w.length > 3 && l.name.toLowerCase().includes(w)));
          res.innerHTML = `<div class="banner warn">${ic('alert', 18)}<span>Não consegui consultar a busca agora. ${results.length ? 'Mostrando sugestões locais.' : 'Verifique a conexão.'}</span></div>` +
            results.map((it, i) => row(it, i)).join('') + `<button class="btn soft" data-retry>Tentar de novo</button>` + mapRow;
          bindRows(); bindPick(); const b = $('[data-retry]', res); if (b) b.onclick = run;
        }
      }, 450);
      q.addEventListener('input', () => { clr.style.display = q.value ? 'flex' : 'none'; run(); });
      q.addEventListener('keydown', e => { if (e.key === 'Enter') { run.cancel(); if (results[0] && q.value.trim().length >= 3) choose(results[0]); else run(); } });
      clr.onclick = () => { q.value = ''; clr.style.display = 'none'; home(); q.focus(); };
      home(); setTimeout(() => q.focus({ preventScroll: true }), 450);
      return () => { ctl && ctl.abort(); run.cancel(); };
    }
  };
});

/* ---------------- escolher no mapa ---------------- */
register('pick', (p) => ({
  opts: { map: true },
  html: `<div class="topbar"><button class="iconbtn hit" data-back aria-label="Voltar">${ic('back', 22)}</button><div class="card hit grow" style="padding:.75rem 1rem;box-shadow:var(--shadow-lg)"><span class="small">${esc(p.title || 'Mova o mapa até o local')}</span></div></div>
    <div style="position:absolute;left:50%;top:50%;transform:translate(-50%,-100%);pointer-events:none;color:var(--rose);filter:drop-shadow(0 4px 6px rgba(0,0,0,.35))">${ic('pin', 48)}</div>
    <div class="sheet"><div class="grab"></div><div><div class="over">Local escolhido</div><div class="head" id="pk-name"><span class="skeleton" style="display:block;width:60%"></span></div><div class="small" id="pk-sub"> </div></div>
    <button class="btn primary" id="pk-ok" disabled>${esc(p.confirm || 'Confirmar')}</button></div>`,
  mount(el, r) {
    mapx.clear(); const map = mapx.get(); const c = p.center || here;
    mapx.view(c.lat, c.lon, 16, 0, false);
    let cur = null, seq = 0;
    const upd = debounce(async () => {
      const ctr = map.getCenter(), my = ++seq; $('#pk-ok', el).disabled = true;
      $('#pk-name', el).innerHTML = '<span class="skeleton" style="display:block;width:60%"></span>';
      const place = await net.reverse(+ctr.lat.toFixed(6), +ctr.lng.toFixed(6));
      if (my !== seq) return; cur = place; $('#pk-name', el).textContent = place.name; $('#pk-sub', el).textContent = place.sub; $('#pk-ok', el).disabled = false;
    }, 500);
    map.on('moveend', upd); upd();
    $('#pk-ok', el).onclick = () => cur && p.onPick(cur);
    return () => { map.off('moveend', upd); upd.cancel(); };
  }
}));

/* ---------------- rotas ---------------- */
const COLORS = { 'Mais segura': '#0F8A62', 'Equilibrada': '#3B1766', 'Mais rápida': '#D6336C' };
const bg = c => c; 
export function odBar(p) {
  const org = p.origin, dest = p.dest;
  return `<div class="topbar"><button class="iconbtn hit" data-back aria-label="Voltar">${ic('back', 22)}</button>
      <div class="card hit grow" style="padding:.375rem .5rem .375rem .75rem;box-shadow:var(--shadow-lg);gap:0;flex-direction:row;align-items:center">
        <div class="grow" style="min-width:0">
          <button class="hrow" data-edit="origin" style="width:100%;min-height:var(--tap)" aria-label="Alterar ponto de partida: ${esc(org.name)}"><span class="dot" style="--rc:var(--safe);width:.75rem;height:.75rem"></span><span class="grow" style="min-width:0"><span class="cap" style="display:block">De</span><span class="strong" style="display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(org.name)}</span></span></button>
          <div class="hr" style="margin:0 0 0 1.5rem"></div>
          <button class="hrow" data-edit="dest" style="width:100%;min-height:var(--tap)" aria-label="Alterar destino: ${esc(dest.name)}">${ic('pin', 14)}<span class="grow" style="min-width:0"><span class="cap" style="display:block">Para</span><span class="strong" style="display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(dest.name)}</span></span></button>
        </div>
        <button class="iconbtn" data-swap aria-label="Inverter origem e destino" style="box-shadow:none;background:var(--rose-soft);color:var(--rose-text);margin-left:.25rem">${ic('uturn', 20)}</button>
      </div></div>`;
}
export function modeSwitch(cur) {
  return `<div class="chips" role="radiogroup" aria-label="Modo de deslocamento"><button class="chip" role="radio" aria-checked="${cur === 'walk'}" data-mode="walk">${ic('walk', 16)} A pé</button><button class="chip" role="radio" aria-checked="${cur === 'transit'}" data-mode="transit">${ic('bus', 16)} Transporte público</button></div>`;
}
export function bindOD(el, r, p) {
  $$('[data-edit]', el).forEach(b => b.onclick = () => {
    const which = b.dataset.edit;
    r.go('search', { mode: 'pick', allowHere: which === 'origin', title: which === 'origin' ? 'Ponto de partida' : 'Destino', onChoose: it => { p[which === 'origin' ? 'origin' : 'dest'] = it; if (which === 'dest') store.update(s => { s.recents = [it, ...s.recents.filter(x => x.name !== it.name)].slice(0, 6); }); r.back(); } }, { anim: 'up' });
  });
  const sw = $('[data-swap]', el); if (sw) sw.onclick = () => { const t = p.origin; p.origin = p.dest; p.dest = t; r.refresh(); };
  $$('[data-mode]', el).forEach(b => b.onclick = () => { const m = b.dataset.mode; if (el.dataset.screen === (m === 'walk' ? 'routes' : 'transit')) return; r.go(m === 'walk' ? 'routes' : 'transit', { origin: p.origin, dest: p.dest }, { anim: 'fade', replace: true }); });
}
register('routes', (p) => {
  const dest = p.dest;
  if (!p.origin || p.origin.isHere) p.origin = { name: 'Minha localização', sub: here.source === 'gps' ? 'GPS' : 'Local de demonstração', lat: here.lat, lon: here.lon, isHere: true };
  const org = p.origin;
  return {
    opts: { map: true },
    html: `${odBar(p)}
      <div class="sheet" id="sheet" style="max-height:60%"><div class="grab"></div><div id="body" class="stack"></div></div>`,
    mount(el, r) {
      mapx.clear(); const map = mapx.get(), L = mapx.L(), grp = mapx.group();
      const body = $('#body', el); let alive = true, ctl = new AbortController();
      let list = [], sel = 0, lines = [], osm = null, osmFail = false, estimated = false;
      const o = { lat: org.lat, lon: org.lon };
      const D = hav([o.lat, o.lon], [dest.lat, dest.lon]);
      bindOD(el, r, p);
      if (org.isHere) mapx.L().marker([o.lat, o.lon], { icon: mapx.youIcon(), keyboard: false, interactive: false }).addTo(grp);
      else mapx.pin(o.lat, o.lon, { color: '#0F8A62', svg: ic('walk', 18), size: 36 });
      mapx.pin(dest.lat, dest.lon, { color: '#3B1766', svg: ic('pin', 18), size: 36 });
      resizable($('#sheet', el), { onChange: () => fitAll(list[sel]?.coords) });
      const sheetH = () => $('#sheet', el).offsetHeight + 10;
      const fitAll = (coords) => { try { const b = bboxOf(coords || [[o.lon, o.lat], [dest.lon, dest.lat]], 0.0004); mapx.fit([[b[0], b[1]], [b[2], b[3]]], { top: 175, bottom: Math.min(sheetH(), 520) + 24, maxZoom: 17 }); } catch {} };
      const loading = (msg) => { body.innerHTML = `${modeSwitch('walk')}<div class="hrow">${ic('loader', 22, 'spin')}<div class="grow"><div class="head">${msg}</div><div class="small">Buscando caminhos a pé e dados da região…</div></div></div><div class="skeleton" style="height:5.5rem"></div><div class="skeleton" style="height:5.5rem"></div>`; fitAll(); bindOD(el, r, p); };
      const draw = () => {
        lines.forEach(l => grp.removeLayer(l)); lines = [];
        list.forEach((rt, i) => {
          const ll = rt.coords.map(c => [c[1], c[0]]), on = i === sel, col = COLORS[rt.label] || '#3B1766';
          const casing = L.polyline(ll, { color: '#fff', weight: on ? 12 : 9, opacity: on ? 1 : .8, lineCap: 'round', lineJoin: 'round' }).addTo(grp);
          const line = L.polyline(ll, { color: col, weight: on ? 7 : 5, opacity: on ? 1 : .75, lineCap: 'round', lineJoin: 'round', dashArray: on ? null : '2 9' }).addTo(grp);
          [casing, line].forEach(x => x.on('click', () => { sel = i; draw(); render(); }));
          lines.push(casing, line); if (on) { casing.bringToFront(); line.bringToFront(); }
        });
      };
      const night = () => store.isNight();
      const score = () => { const rep = allReports(); list.forEach(rt => { rt.a = analyze(rt, osm, rep, night());
        // caminhar mais = mais tempo exposta: cada 100 m além de 400 m desconta (mais à noite)
        const extra = Math.min(12, Math.max(0, (rt.dist - 400) / 100) * (night() ? 1 : .5)), extraR = Math.round(extra);
        rt.a.lengthPenalty = extraR; if (rt.a.score != null) rt.a.score = Math.max(0, rt.a.score - extraR); }); };
      const assign = () => {
        const ORDER = ['Mais segura', 'Equilibrada', 'Mais rápida'];
        if (list.length === 1) { list[0].label = 'Mais segura'; return; }
        const bySafe = [...list].sort((a, b) => (b.a.score ?? -1) - (a.a.score ?? -1) || a.dur - b.dur);
        const fastest = [...list].sort((a, b) => a.dur - b.dur)[0];
        list.forEach(x => x.label = 'Equilibrada');
        bySafe[0].label = 'Mais segura';
        if (fastest !== bySafe[0]) fastest.label = 'Mais rápida';
        list.sort((a, b) => ORDER.indexOf(a.label) - ORDER.indexOf(b.label));
      };
      const render = () => {
        const cur = list[sel]; const a = cur.a;
        const seg = ['auto', 'day', 'night'].map(k => `<button class="chip" role="radio" aria-checked="${store.get().settings.time === k}" data-time="${k}">${k === 'auto' ? 'Agora' : k === 'day' ? ic('sun', 16) + 'Dia' : ic('moon', 16) + 'Noite'}</button>`).join('');
        body.innerHTML = `${modeSwitch('walk')}<div class="hrow"><div class="grow"><div class="over">${list.length} ${list.length > 1 ? 'opções' : 'opção'} a pé</div><h2 class="h-s">${esc(dest.name)}</h2></div></div>
          ${estimated ? `<div class="banner risk">${ic('alert', 18)}<span>Não consegui calcular a rota pelas ruas. Mostrando uma <b>estimativa em linha reta</b>; não use para navegar.</span></div>` : ''}
          ${D > 25000 ? `<div class="banner warn">${ic('alert', 18)}<span>Distância muito grande para ir a pé.</span></div>` : ''}
          <div class="stack" role="group" aria-label="Opções de rota">${list.map((rt, i) => {
            const l = label(rt.a.score), col = COLORS[rt.label] || '#3B1766';
            return `<button class="route-card" style="--rc:${col}" data-r="${i}" aria-pressed="${i === sel}"><div class="hrow"><span class="dot"></span><span class="head grow">${rt.label}</span>${rt.a.score != null ? `<span class="badge ${l.tone}">${ic(l.tone === 'safe' ? 'shield' : 'alert', 14)} ${rt.a.score} · ${l.t}</span>` : `<span class="badge alt">Sem dados</span>`}</div>
              <div class="small" style="padding-left:1.45rem">${ic('clock', 13)} <b>${fmtMin(rt.dur)}</b> · ${ic('walk', 13)} ${fmtDist(rt.dist)}${rt.a.litPct != null ? ' · ' + ic('bulb', 13) + ' ' + Math.round(rt.a.litPct * 100) + '% com luz' : ''}</div></button>`;
          }).join('')}</div>
          ${osmFail ? `<div class="banner warn">${ic('info', 18)}<span>Dados de iluminação e comércio indisponíveis agora, então <b>não dá para calcular a nota</b>. Tente de novo em instantes.</span></div>` : a.partial ? `<div class="banner alt">${ic('info', 18)}<span>${a.riskCovered ? '' : 'Sem dados de ocorrências nesta região; o score usa só iluminação, movimento e tipo de via.'}</span></div>` : ''}
          <div class="chips" role="radiogroup" aria-label="Horário considerado"><span class="small" style="align-self:center">Horário:</span>${seg}</div>
          <button class="btn primary" data-start>${ic('nav', 20)} Iniciar caminhada</button>
          <div class="hrow"><button class="btn soft" data-why>${ic('info', 18)} Por que esse score?</button><button class="iconbtn" data-share aria-label="Compartilhar rota" style="background:var(--rose-soft);color:var(--rose-text);box-shadow:none">${ic('share', 20)}</button></div>`;
        bindOD(el, r, p);
        $$('[data-r]', body).forEach(b => b.onclick = () => { sel = +b.dataset.r; draw(); render(); vibrate(8); });
        $$('[data-time]', body).forEach(b => b.onclick = () => { store.update(s => s.settings.time = b.dataset.time); score(); assign(); sel = 0; draw(); render(); });
        $('[data-start]', body).onclick = () => r.go('nav', { route: cur, dest, custom: !org.isHere }, { anim: 'up' });
        $('[data-why]', body).onclick = () => scoreModal(cur, night());
        $('[data-share]', body).onclick = () => { const t = `Estou indo para ${dest.name} a pé (${fmtMin(cur.dur)}). Destino: ${osmLink(dest.lat, dest.lon)} — via SafeRoute`; window.open(waLink(t), '_blank', 'noopener'); };
        requestAnimationFrame(() => fitAll(cur.coords)); setTimeout(() => alive && fitAll(cur.coords), 500);
      };
      (async () => {
        loading('Calculando rotas…');
        if (D < 30) { body.innerHTML = `<div class="head">Você já está aqui 🙂</div><button class="btn primary" data-back>Voltar</button>`; $('[data-back]', body).onclick = () => r.back(); return; }
        try { list = await net.routes(o, dest, { signal: ctl.signal }); if (!list.length) throw new Error('vazio'); }
        catch (e) { if (!alive) return; list = net.straightRoute(o, dest); estimated = true; }
        if (!alive) return;
        // desenha provisório
        list.forEach((x, i) => x.label = ['Mais segura', 'Equilibrada', 'Mais rápida'][i]); list.forEach(x => x.a = { score: null, parts: {} });
        draw(); fitAll(list[0].coords);
        loading('Avaliando a segurança de cada caminho…');
        try { osm = estimated ? null : await net.osmAround(list.map(x => x.coords), { signal: ctl.signal }); osmFail = !osm; } catch { osm = null; osmFail = !estimated; }
        if (!alive) return;
        score(); assign(); sel = 0; draw(); render();
      })();
      return () => { alive = false; ctl.abort(); };
    }
  };
});

export function scoreModal(rt, night) {
  const a = rt.a, l = label(a.score);
  const W = a.weights || WEIGHTS[night ? 'night' : 'day'];
  const col = l.tone === 'safe' ? 'var(--safe)' : l.tone === 'warn' ? 'var(--warn)' : 'var(--risk)';
  const rows = Object.keys(PART_LABEL).map(k => { const v = a.parts[k]; return `<div class="stack" style="gap:.3rem"><div class="hrow"><span class="grow strong">${PART_LABEL[k]}</span><span class="small">peso ${Math.round(W[k] * 100)}%</span><b>${v == null ? '—' : Math.round(v * 100)}</b></div><div class="bar-t" role="img" aria-label="${PART_LABEL[k]}: ${v == null ? 'sem dados' : Math.round(v * 100) + ' de 100'}"><i style="width:${v == null ? 0 : Math.round(v * 100)}%;background:${v == null ? 'var(--muted)' : v >= .85 ? 'var(--safe)' : v >= .7 ? 'var(--warn)' : 'var(--risk)'}"></i></div></div>`; }).join('');
  modal(`<div class="hrow" style="gap:1rem"><div class="scorering" style="--p:${a.score ?? 0};--c:${col}"><span><span class="h-n">${a.score ?? '—'}</span></span></div><div class="grow"><div class="over">${night ? 'Considerando a noite' : 'Considerando o dia'}</div><h2 class="h-s">Segurança ${l.t.toLowerCase()}</h2><span class="badge ${l.tone}">${rt.label}</span></div></div>
    <div class="stack">${rows}</div>
    ${a.refuges.length ? `<div><div class="strong" style="margin-bottom:.4rem">Pontos de apoio no caminho</div><div class="chips">${[...new Set(a.refuges.map(x => x.name))].slice(0, 6).map(n => `<span class="badge safe">${ic('cross', 12)} ${esc(n)}</span>`).join('')}</div></div>` : ''}
    <details class="why-det"><summary>Como calculamos</summary><div class="small stack" style="gap:.5rem;margin-top:.5rem"><p>Iluminação, comércio aberto e tipo de via vêm do OpenStreetMap. As <b>ocorrências são dados ilustrativos</b>, não estatísticas oficiais. Relatos da comunidade também entram, mas perdem peso com o tempo e saem do cálculo após 30 dias.</p>${a.lengthPenalty ? `<p>Caminho longo: −${a.lengthPenalty} ponto(s), porque você fica mais tempo exposta.</p>` : ''}<p>O score apoia sua decisão; não é uma garantia.</p></div></details>
    <button class="btn soft" data-contest>Discordo desta nota</button><button class="btn dark" data-dismiss>Entendi</button>`, { onMount: m => { m.querySelector('[data-contest]').onclick = () => contestModal(rt, night); } });
}
