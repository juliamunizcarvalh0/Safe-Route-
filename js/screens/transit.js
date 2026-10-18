import { register } from '../router.js';
import * as store from '../store.js';
import * as mapx from '../map.js';
import * as net from '../net.js';
import * as T from '../transit-net.js';
import { here, hav, fmtDist, fmtMin, bboxOf } from '../geo.js';
import { ic } from '../icons.js';
import { analyze, label, PART_LABEL } from '../score.js';
import { allReports } from '../data.js';
import { $, $$, esc, toast, modal, resizable } from '../ui.js';
import { odBar, modeSwitch, bindOD } from './home.js';
import { shareModal } from './nav.js';

const hhmm = ms => isNaN(ms) ? '--:--' : new Date(ms).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
const MODE_ICON = { walk: 'walk', bus: 'bus', subway: 'train', rail: 'train' };
const MODE_COLOR = { bus: '#D6336C', subway: '#3B1766', rail: '#0F8A62' };
const tone = s => s == null ? 'alt' : s >= 85 ? 'safe' : s >= 70 ? 'warn' : 'risk';
const badge = (s, short) => s == null ? '' : `<span class="badge ${tone(s)}">${ic(tone(s) === 'safe' ? 'shield' : 'alert', 12)} ${s}${short ? '' : ' · ' + label(s).t}</span>`;
const pt = (l) => ({ coords: [[l.lon, l.lat], [l.lon, l.lat]] });

export function scoreItinerary(it, osm, reports, night) {
  const segs = [];
  let prevEnd = it.legs[0]?.start;
  it.legs.forEach((l, i) => {
    if (l.mode === 'walk') { if (l.dist > 20) l.a = analyze({ coords: l.coords }, osm, reports, night); }
    else {
      l.fromA = analyze(pt(l.from), osm, reports, night); l.toA = analyze(pt(l.to), osm, reports, night);
      l.wait = Math.max(0, Math.round((l.start - prevEnd) / 60000));
    }
    prevEnd = l.end;
  });
  const walks = it.legs.filter(l => l.mode === 'walk' && l.a && l.a.score != null);
  const wd = walks.reduce((a, l) => a + l.dist, 0);
  const walkScore = walks.length ? Math.round(walks.reduce((a, l) => a + l.a.score * l.dist, 0) / (wd || 1)) : null;
  const stopList = [];
  it.legs.filter(l => l.mode !== 'walk').forEach(l => { stopList.push({ name: l.from.name, kind: 'embarque', a: l.fromA, wait: l.wait }, { name: l.to.name, kind: 'desembarque', a: l.toA, wait: 0 }); });
  const scored = stopList.filter(x => x.a && x.a.score != null);
  const stopAvg = scored.length ? Math.round(scored.reduce((a, x) => a + x.a.score, 0) / scored.length) : null;
  const weakest = scored.length ? scored.reduce((m, x) => x.a.score < m.a.score ? x : m) : null;
  // Nota por EXPOSIÇÃO: quanto mais tempo exposta (andando, esperando parada), mais pesa; quanto pior o lugar, pior.
  // Esperar parada pesa mais que andar (você fica parada e visível); dentro do veículo o peso é pequeno e a nota é neutra (interior não é avaliado).
  const NEUTRO = night ? 72 : 80;
  let wSum = 0, sSum = 0;
  const add = (min, sc, w) => { if (min > 0 && sc != null) { wSum += min * w; sSum += min * w * sc; } };
  it.legs.forEach(l => {
    if (l.mode === 'walk') add(l.dur / 60, l.a?.score, 1);
    else {
      add(l.wait, l.fromA?.score, 2);
      add(l.dur / 60, NEUTRO, .25);
    }
  });
  const base = wSum ? sSum / wSum : null;
  const walkM = it.legs.filter(l => l.mode === 'walk').reduce((a, l) => a + l.dist, 0);
  const waitMin = it.legs.filter(l => l.mode !== 'walk').reduce((a, l) => a + (l.wait || 0), 0);
  const pen = {
    transfers: it.transfers * (night ? 5 : 3),
    walk: Math.min(14, Math.max(0, (walkM - 300) / 100) * (night ? 1.6 : .8)),
    wait: Math.min(14, Math.max(0, waitMin - 3) * (night ? .9 : .45)),
    weak: weakest && weakest.a.score < 70 ? Math.round((70 - weakest.a.score) * .3) : 0,
    night: night ? 3 : 0
  };
  Object.keys(pen).forEach(k => pen[k] = Math.round(pen[k]));
  const penalty = Object.values(pen).reduce((a, b) => a + b, 0);
  const score = base == null ? null : Math.max(0, Math.min(100, Math.round(base - penalty)));
  let why = '';
  if (weakest) { const ps = Object.entries(weakest.a.parts).filter(([, v]) => v != null).sort((a, b) => a[1] - b[1])[0]; if (ps) why = PART_LABEL[ps[0]].toLowerCase(); }
  it.a = { score, walkScore, stopAvg, weakest, why, penalty, pen, walkM, waitMin };
  return it.a;
}

register('transit', (p) => {
  const dest = p.dest;
  if (!p.origin || p.origin.isHere) p.origin = { name: 'Minha localização', sub: here.source === 'gps' ? 'GPS' : 'Local de demonstração', lat: here.lat, lon: here.lon, isHere: true };
  const org = p.origin;
  return {
    opts: { map: true },
    html: `${odBar(p)}<div class="sheet" id="sheet" style="max-height:62%"><div class="grab"></div><div id="body" class="stack"></div></div>`,
    mount(el, r) {
      mapx.clear(); const map = mapx.get(), L = mapx.L(), grp = mapx.group();
      const body = $('#body', el); let alive = true; const ctl = new AbortController();
      let list = [], sel = 0, layer = null, live = null, osmFail = false;
      const o = { lat: org.lat, lon: org.lon };
      bindOD(el, r, p);
      const sheetH = () => $('#sheet', el).offsetHeight + 10;
      const fit = (coords) => { try { const b = bboxOf(coords && coords.length ? coords : [[o.lon, o.lat], [dest.lon, dest.lat]], 0.0006); mapx.fit([[b[0], b[1]], [b[2], b[3]]], { top: 175, bottom: Math.min(sheetH(), 520) + 24, maxZoom: 17 }); } catch {} };
      resizable($('#sheet', el), { onChange: () => fit(list[sel]?.legs.flatMap(l => l.coords)) });
      const base = () => {
        if (org.isHere) L.marker([o.lat, o.lon], { icon: mapx.youIcon(), keyboard: false, interactive: false }).addTo(grp);
        else mapx.pin(o.lat, o.lon, { color: '#0F8A62', svg: ic('walk', 18), size: 36 });
        mapx.pin(dest.lat, dest.lon, { color: '#3B1766', svg: ic('pin', 18), size: 36 });
      };
      base();
      const head = (sub) => `${modeSwitch('transit')}${sub || ''}`;
      const loading = (msg) => { body.innerHTML = head(`<div class="hrow">${ic('loader', 22, 'spin')}<div class="grow"><div class="head">${msg}</div><div class="small">Consultando linhas, horários e a segurança de cada ponto…</div></div></div><div class="skeleton" style="height:5.5rem"></div><div class="skeleton" style="height:5.5rem"></div>`); bindOD(el, r, p); fit(); };
      const draw = () => {
        mapx.clear(); base(); const it = list[sel]; if (!it) return;
        it.legs.forEach(l => {
          const ll = l.coords.map(c => [c[1], c[0]]), col = l.mode === 'walk' ? '#5C5170' : (l.color || MODE_COLOR[l.mode]);
          L.polyline(ll, { color: '#fff', weight: l.mode === 'walk' ? 9 : 11, opacity: .95, lineCap: 'round', lineJoin: 'round' }).addTo(grp);
          L.polyline(ll, { color: col, weight: l.mode === 'walk' ? 5 : 7, opacity: 1, dashArray: l.mode === 'walk' ? '1 9' : null, lineCap: 'round', lineJoin: 'round' }).addTo(grp);
        });
        const colr = s => ({ safe: '#0F8A62', warn: '#8F5600', risk: '#C92A2A', alt: '#5C5170' }[tone(s)]);
        it.legs.filter(l => l.mode !== 'walk').forEach(l => [[l.from, l.fromA], [l.to, l.toA]].forEach(([s, a]) => L.circleMarker([s.lat, s.lon], { radius: 8, weight: 3, color: '#fff', fillColor: colr(a?.score), fillOpacity: 1 }).addTo(grp).bindTooltip(esc(s.name) + (a?.score != null ? ' · ' + a.score : ''))));
      };
      const legChip = l => l.mode === 'walk' ? `<span class="badge alt">${ic('walk', 12)} ${fmtMin(l.dur)}</span>` : `<span class="badge" style="background:${l.color || MODE_COLOR[l.mode]};color:#fff">${ic(MODE_ICON[l.mode], 12)} ${esc(l.line || T.MODE_LABEL[l.mode])}</span>`;
      const timeline = it => it.legs.map(l => {
        if (l.mode === 'walk') return `<div class="hrow" style="align-items:flex-start"><div class="tile alt" style="width:2.25rem;height:2.25rem">${ic('walk', 18)}</div><div class="grow"><div class="strong">Caminhe ${fmtDist(l.dist)} · ${fmtMin(l.dur)}</div><div class="small">até ${esc(l.to.name || 'o destino')}</div></div>${l.a ? badge(l.a.score, true) : ''}</div>`;
        const col = l.color || MODE_COLOR[l.mode];
        return `<div class="card flat" style="padding:.75rem;gap:.5rem;border-color:${col}"><div class="hrow"><span class="badge" style="background:${col};color:#fff">${ic(MODE_ICON[l.mode], 14)} ${esc(l.line || T.MODE_LABEL[l.mode])}</span><div class="grow small">${esc(l.headsign ? 'sentido ' + l.headsign : l.lineLong)}</div><span class="cap">${l.stops + 1} paradas</span></div>
          <div class="hrow"><div class="grow"><div class="strong">${hhmm(l.start)} · Embarque</div><div class="small">${esc(l.from.name)}${l.wait > 1 ? ` · espera ${l.wait} min` : ''}</div></div>${badge(l.fromA?.score, true)}</div>
          <div class="hrow"><div class="grow"><div class="strong">${hhmm(l.end)} · Desembarque</div><div class="small">${esc(l.to.name)}</div></div>${badge(l.toA?.score, true)}</div></div>`;
      }).join('');
      const render = () => {
        const it = list[sel], a = it.a, l0 = label(a.score);
        const first = it.legs.find(l => l.mode === 'bus'); // Olho Vivo cobre só ônibus
        body.innerHTML = head(`<div class="over">${list.length} ${list.length > 1 ? 'opções' : 'opção'} de viagem · agora</div>
          <div class="stack" role="group" aria-label="Opções de transporte público">${list.map((x, i) => `<button class="route-card" style="--rc:${x.label === 'Mais segura' ? '#0F8A62' : x.label === 'Mais rápida' ? '#D6336C' : '#3B1766'}" data-r="${i}" aria-pressed="${i === sel}"><div class="hrow"><span class="dot"></span><span class="head grow">${x.label}</span>${x.a.score != null ? `<span class="badge ${tone(x.a.score)}">${ic(tone(x.a.score) === 'safe' ? 'shield' : 'alert', 14)} ${x.a.score} · ${label(x.a.score).t}</span>` : '<span class="badge alt">Sem dados</span>'}</div>
            <div class="chips" style="gap:.25rem;align-items:center">${x.legs.map((l, k) => legChip(l) + (k < x.legs.length - 1 ? `<span class="cap">›</span>` : '')).join('')}</div>
            <div class="small">${hhmm(x.start)} → ${hhmm(x.end)} · <b>${fmtMin(x.dur)}</b> · ${x.transfers === 0 ? 'sem baldeação' : x.transfers + ' baldeaç' + (x.transfers === 1 ? 'ão' : 'ões')} · ${fmtDist(x.walk)} a pé</div></button>`).join('')}</div>
          ${a.weakest && a.weakest.a.score < 70 ? `<div class="banner ${tone(a.weakest.a.score) === 'risk' ? 'risk' : 'warn'}">${ic('alert', 18)}<span><b>Ponto mais frágil:</b> ${esc(a.weakest.name)} (${a.weakest.a.score}) — ponto fraco: ${esc(a.why)}.${a.weakest.wait > 4 ? ` Você esperaria cerca de ${a.weakest.wait} min ali.` : ''}</span></div>` : a.weakest ? `<div class="banner safe">${ic('shield', 18)}<span>Todos os pontos de parada desta opção têm segurança aceitável.</span></div>` : ''}
          ${osmFail ? `<div class="banner warn">${ic('info', 18)}<span>Dados de iluminação e comércio indisponíveis agora; o score é <b>parcial</b>.</span></div>` : ''}
          <div id="live"></div>
          <div class="over" style="margin-top:.25rem">Passo a passo</div><div class="stack">${timeline(it)}</div>
          <div class="banner alt">${ic('info', 18)}<span>O score avalia calçadas e pontos de parada. <b>Não avalia o interior do veículo.</b></span></div>
          ${it.legs[0]?.mode === 'walk' && it.legs[0].dist > 30 ? `<button class="btn primary" data-walk>${ic('nav', 20)} Caminhar até o ponto de embarque</button>` : ''}
          <div class="hrow"><button class="btn soft" data-why>${ic('info', 18)} Por que esse score?</button><button class="iconbtn" data-share aria-label="Avisar alguém desta viagem" style="background:var(--rose-soft);color:var(--rose-text);box-shadow:none">${ic('share', 20)}</button></div>`);
        bindOD(el, r, p);
        $$('[data-r]', body).forEach(b => b.onclick = () => { sel = +b.dataset.r; draw(); render(); });
        const w = $('[data-walk]', body); if (w) w.onclick = () => { const l = it.legs[0]; r.go('nav', { route: { coords: l.coords, dist: l.dist, dur: l.dur, a: l.a, steps: [{ type: 'depart', mod: 'straight', name: '', dist: l.dist, dur: l.dur, loc: l.coords[0] }, { type: 'arrive', mod: '', name: '', dist: 0, dur: 0, loc: l.coords.at(-1) }] }, dest: { name: l.to.name, lat: l.to.lat, lon: l.to.lon }, custom: !org.isHere }, { anim: 'up' }); };
        $('[data-why]', body).onclick = () => whyModal(it, store.isNight());
        $('[data-share]', body).onclick = () => shareModal(`Vou de ${org.name} para ${dest.name} de transporte público: ${it.legs.filter(l => l.mode !== 'walk').map(l => (l.line || T.MODE_LABEL[l.mode]) + ' (embarque ' + hhmm(l.start) + ' em ' + l.from.name + ')').join(' → ')}. Chego por volta das ${hhmm(it.end)}. — SafeRoute`);
        requestAnimationFrame(() => fit(it.legs.flatMap(l => l.coords))); setTimeout(() => alive && fit(it.legs.flatMap(l => l.coords)), 500);
        liveInfo(it, first);
      };
      const liveInfo = async (it, first) => {
        const box = $('#live', body); if (!box || !first) return;
        if (!T.proxyUrl()) { box.remove(); return; }
        box.innerHTML = `<div class="banner alt">${ic('loader', 18, 'spin')}<span>Consultando o Olho Vivo…</span></div>`;
        try {
          const a = await T.arrivals(first.from.name, first.from.lat, first.from.lon, first.line, { signal: ctl.signal });
          if (!alive || list[sel] !== it) return;
          if (a.notFound) box.innerHTML = `<div class="banner warn">${ic('info', 18)}<span>Não achei este ponto no Olho Vivo.</span></div>`;
          else if (a.line) box.innerHTML = `<div class="banner safe">${ic('bus', 18)}<span><b>Ao vivo · ${esc(a.line.c)}:</b> ${a.line.t.length ? 'chega às ' + a.line.t.join(', ') : 'sem previsão agora'} no ponto ${esc(a.stop)}.</span></div>`;
          else box.innerHTML = `<div class="banner warn">${ic('info', 18)}<span>Sem previsão ao vivo para a linha ${esc(first.line || '')} neste ponto${a.all?.length ? '. Passam aqui: ' + esc(a.all.slice(0, 4).map(x => x.c).join(', ')) : ''}.</span></div>`;
        } catch { if (alive) box.innerHTML = `<div class="banner warn">${ic('info', 18)}<span>Tempo real indisponível agora (verifique o proxy em Perfil › Transporte).</span></div>`; }
      };
      const fallback = async (msg) => {
        body.innerHTML = head(`<div class="banner warn">${ic('alert', 18)}<span>${msg}</span></div><div class="head">Pontos de transporte perto de ${org.isHere ? 'você' : 'a partida'}</div><div id="near"><div class="skeleton" style="height:3rem"></div></div>`);
        bindOD(el, r, p);
        try {
          const st = (await net.stopsAround(o.lat, o.lon, 700, { signal: ctl.signal })).slice(0, 8); if (!alive) return;
          const box = $('#near', body); if (!st.length) { box.innerHTML = '<div class="small">Nenhum ponto encontrado por perto no mapa colaborativo.</div>'; return; }
          box.innerHTML = st.map((s, i) => `<button class="sugg" data-st="${i}"><div class="tile alt">${ic(s.kind === 'bus' ? 'bus' : 'train', 20)}</div><div class="grow"><div class="strong">${esc(s.name)}</div><div class="small">${s.kind === 'bus' ? 'Ponto de ônibus' : s.kind === 'subway' ? 'Metrô' : 'Estação'} · a ${fmtDist(s.d)}</div></div></button>`).join('');
          st.forEach(s => mapx.pin(s.lat, s.lon, { color: '#3B1766', svg: ic(s.kind === 'bus' ? 'bus' : 'train', 14), size: 28 }));
          $$('[data-st]', box).forEach(b => b.onclick = () => { const s = st[+b.dataset.st]; mapx.flyTo(s.lat, s.lon, 17, 120); });
        } catch { const box = $('#near', body); if (box) box.innerHTML = '<div class="small">Não consegui consultar os pontos agora.</div>'; }
      };
      (async () => {
        loading('Buscando viagens…');
        let its;
        try { its = await T.planTransit(o, dest, { signal: ctl.signal }); } catch { if (alive) fallback('Não consegui montar a viagem agora. O serviço de horários pode estar fora do ar ou sem cobertura nesta região (os dados são da SPTrans, Grande São Paulo).'); return; }
        if (!alive) return;
        if (!its.length) { fallback('Não encontrei viagem de transporte público para este trajeto agora. Pode ser fora de horário ou fora da área coberta (Grande São Paulo).'); return; }
        list = its; draw(); fit(its[0].legs.flatMap(l => l.coords));
        loading('Avaliando a segurança de calçadas e pontos…');
        let osm = null;
        try { const lines = []; its.forEach(it => it.legs.forEach(l => { if (l.mode === 'walk') lines.push(l.coords); else { lines.push([[l.from.lon, l.from.lat], [l.from.lon, l.from.lat]], [[l.to.lon, l.to.lat], [l.to.lon, l.to.lat]]); } })); osm = await net.osmAround(lines.slice(0, 40), { signal: ctl.signal }); } catch { osmFail = true; }
        if (!alive) return;
        const rep = allReports(), night = store.isNight();
        its.forEach(it => scoreItinerary(it, osm, rep, night));
        const ORDER = ['Mais segura', 'Equilibrada', 'Mais rápida'];
        const bySafe = [...its].sort((a, b) => (b.a.score ?? -1) - (a.a.score ?? -1) || a.dur - b.dur), fastest = [...its].sort((a, b) => a.dur - b.dur)[0];
        its.forEach(x => x.label = 'Equilibrada'); bySafe[0].label = 'Mais segura'; if (fastest !== bySafe[0]) fastest.label = 'Mais rápida';
        its.sort((a, b) => ORDER.indexOf(a.label) - ORDER.indexOf(b.label));
        sel = 0; draw(); render();
      })();
      return () => { alive = false; ctl.abort(); };
    }
  };
});

function whyModal(it, night) {
  const a = it.a, l = label(a.score), col = l.tone === 'safe' ? 'var(--safe)' : l.tone === 'warn' ? 'var(--warn)' : 'var(--risk)';
  const bc = v => v == null ? 'var(--muted)' : v >= 85 ? 'var(--safe)' : v >= 70 ? 'var(--warn)' : 'var(--risk)';
  const row = (t, v, d) => `<div class="why-row"><div class="hrow"><span class="grow strong">${t}</span><b class="why-n">${v == null ? '—' : v}</b></div><div class="bar-t"><i style="width:${v ?? 0}%;background:${bc(v)}"></i></div><div class="small">${d}</div></div>`;
  const pens = [
    [a.pen.transfers, `${it.transfers} baldeaç${it.transfers === 1 ? 'ão' : 'ões'}`, 'cada troca é mais uma espera'],
    [a.pen.walk, `${Math.round(a.walkM)} m a pé`, 'mais tempo na rua'],
    [a.pen.wait, `${a.waitMin} min de espera`, 'parada e visível no ponto'],
    [a.pen.weak, 'Ponto frágil', a.weakest ? esc(a.weakest.name) : ''],
    [a.pen.night, 'Viagem à noite', 'menos gente e menos luz']
  ].filter(x => x[0] > 0);
  const summary = a.weakest && a.weakest.a.score < 70 ? `O ponto mais frágil é <b>${esc(a.weakest.name)}</b> (${a.weakest.a.score}).` : a.penalty >= 10 ? 'A nota cai principalmente pelo tempo que você fica exposta.' : 'Pontos e calçadas com segurança aceitável.';
  modal(`<div class="hrow" style="gap:1rem"><div class="scorering" style="--p:${a.score ?? 0};--c:${col}"><span><span class="h-n">${a.score ?? '—'}</span></span></div><div class="grow"><div class="over">${night ? 'À noite' : 'De dia'}</div><h2 class="h-s">${l.t}</h2><div class="small" style="margin-top:.25rem">${summary}</div></div></div>
    <div class="why-sec"><div class="why-h">Onde você vai estar</div>
      ${row('Caminhadas', a.walkScore, 'Calçadas até o ponto e depois do desembarque.')}
      ${row('Pontos de parada', a.stopAvg, 'Embarques e desembarques. Esperar ali pesa o dobro.')}
    </div>
    ${pens.length ? `<div class="why-sec"><div class="why-h">O que reduz a nota <span class="badge risk" style="padding:.125rem .5rem">−${a.penalty}</span></div>
      <div class="why-list">${pens.map(x => `<div class="why-pen"><div class="grow"><div class="strong">${x[1]}</div>${x[2] ? `<div class="small">${x[2]}</div>` : ''}</div><span class="why-m">−${x[0]}</span></div>`).join('')}</div></div>` : ''}
    <details class="why-det"><summary>Como calculamos</summary><div class="small stack" style="gap:.5rem;margin-top:.5rem"><p>Cada trecho conta pelo tempo que você passa nele. Dentro do veículo o peso é pequeno e a nota é neutra: <b>o interior não é avaliado</b>.</p><p>Horários e linhas: dados abertos da SPTrans (GTFS) via Transitous. Iluminação, comércio e vias: OpenStreetMap. Ocorrências: dados <b>ilustrativos</b>.</p></div></details>
    <button class="btn dark" data-dismiss>Entendi</button>`);
}

/* ---------------- Perfil › Transporte (proxy do tempo real) ---------------- */
register('transit-settings', () => ({
  opts: {},
  html: `<div class="scroll" style="gap:1rem"><div class="hdr"><button class="iconbtn" data-back aria-label="Voltar">${ic('back', 22)}</button><h1 class="grow" tabindex="-1" style="font-family:Fraunces,serif;font-size:1.375rem;color:var(--plum);font-weight:600">Transporte</h1></div>
    <p class="lead">Viagens de ônibus, metrô e trem já funcionam com dados abertos. Para ver <b>quando o ônibus chega</b> (Olho Vivo, SPTrans), configure o proxy.</p>
    <div class="card alt" style="box-shadow:none"><div class="strong">Por que um proxy?</div><div class="small">A SPTrans exige um token secreto e não aceita chamadas diretas de sites. O proxy (gratuito, Cloudflare) guarda o token fora do site público. Passo a passo na pasta <b>worker/</b> do projeto.</div></div>
    <div class="field"><label for="px">Endereço do proxy</label><input id="px" class="input" type="url" inputmode="url" autocomplete="off" autocapitalize="off" placeholder="https://saferoute-sptrans-proxy.SEU-USUARIO.workers.dev" value="${esc(store.get().settings.proxyUrl || '')}"><div id="pxs" class="small" style="min-height:1.2em" role="status"></div></div>
    <button class="btn soft" id="pxt">Testar conexão</button></div>
    <div class="bar-fixed"><button class="btn primary" id="pxs-save">Salvar</button></div>`,
  mount(el, r) {
    const px = $('#px', el), st = $('#pxs', el);
    const clean = () => px.value.trim().replace(/\/+$/, '');
    $('#pxt', el).onclick = async () => { const u = clean(); if (!/^https:\/\//.test(u)) { st.style.color = 'var(--risk)'; st.textContent = 'Use um endereço que comece com https://'; return; } st.style.color = 'var(--ink-soft)'; st.textContent = 'Testando…'; try { const j = await net.getJSON(u + '/health', { timeout: 8000 }); st.style.color = 'var(--safe)'; st.textContent = j.ok ? 'Conectado ✓' : 'Respondeu, mas não parece o proxy do SafeRoute.'; } catch { st.style.color = 'var(--risk)'; st.textContent = 'Não consegui conectar. Confira o endereço e o ALLOWED_ORIGIN do proxy.'; } };
    $('#pxs-save', el).onclick = () => { const u = clean(); if (u && !/^https:\/\//.test(u)) { st.style.color = 'var(--risk)'; st.textContent = 'Use um endereço que comece com https://'; return; } store.update(s => s.settings.proxyUrl = u); toast(u ? 'Tempo real ativado' : 'Tempo real desativado', 'check'); r.back(); };
  }
}));
