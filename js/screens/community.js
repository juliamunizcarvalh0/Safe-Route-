import { register } from '../router.js';
import * as store from '../store.js';
import * as net from '../net.js';
import { here, hav, fmtDist } from '../geo.js';
import { ic } from '../icons.js';
import { allReports, CATS } from '../data.js';
import { $, $$, T, esc, toast, modal, confirmDialog, relTime, header, toggle, bindToggle, vibrate } from '../ui.js';
import { router_ } from '../main-ref.js';

export function openReport(r) {
  const c = CATS[r.cat] || CATS.other, st = store.get(), voted = !!st.votes[r.id], mine = !r.seed;
  const d = hav([here.lat, here.lon], [r.lat, r.lon]);
  modal(`<div class="hrow"><div class="tile ${c.tone}">${ic(c.icon, 22)}</div><div class="grow"><h2 class="h-s">${c.label}</h2><div class="small">${relTime(r.ts)} · a ${fmtDist(d)} de você</div></div>${r.seed ? '<span class="badge alt">Ilustrativo</span>' : '<span class="badge rose">Meu relato</span>'}</div>
    <p class="lead" style="color:var(--ink)">${esc(r.text || 'Sem descrição.')}</p>
    <button class="btn ${voted ? 'dark' : 'soft'}" id="vote" aria-pressed="${voted}">${ic('thumb', 18)} ${voted ? 'Você confirmou' : 'Também vi isso'} · ${(r.up || 0) + (voted ? 1 : 0)}</button>
    ${mine ? `<button class="btn dangerline" id="del">${ic('trash', 18)} Excluir meu relato</button>` : ''}
    <button class="btn ghost" data-dismiss>Fechar</button>`, {
    onMount: (m, close) => {
      $('#vote', m).onclick = () => { store.update(s => { s.votes[r.id] ? delete s.votes[r.id] : s.votes[r.id] = true; }); vibrate(10); close(); const cur = router_.current(); if (cur?.name === 'reports') router_.refresh(); };
      const del = $('#del', m); if (del) del.onclick = () => { store.update(s => s.reports = s.reports.filter(x => x.id !== r.id)); close(); toast('Relato excluído', 'trash'); const cur = router_.current(); if (cur) router_.refresh(); };
    }
  });
}

let filter = 'all';
register('reports', () => {
  const all = allReports().map(r => ({ ...r, d: hav([here.lat, here.lon], [r.lat, r.lon]) })).sort((a, b) => b.ts - a.ts);
  const list = all.filter(r => filter === 'all' || (filter === 'near' && r.d < 2500) || (filter === 'mine' && !r.seed));
  const votes = store.get().votes;
  return {
    opts: { tabs: true },
    html: `<div class="scroll tabs" style="gap:1rem">${header('Relatos da comunidade', { back: false })}
      <p class="lead">${T('O que mulheres como você viram pelo caminho. Ajuda a decidir por onde ir.', 'O que outras mulheres viram nas ruas.')}</p>
      <div class="banner alt">${ic('info', 18)}<span>Os relatos de exemplo são <b>ilustrativos</b>. Os seus ficam só no seu aparelho.</span></div>
      <div class="chips nowrap" role="radiogroup" aria-label="Filtrar relatos">${[['all', 'Todos'], ['near', 'Perto de mim'], ['mine', 'Meus']].map(([k, t]) => `<button class="chip" role="radio" aria-checked="${filter === k}" data-f="${k}">${t}</button>`).join('')}</div>
      <div class="stack">${list.length ? list.map(r => { const c = CATS[r.cat] || CATS.other; return `<button class="post press" data-id="${r.id}" style="text-align:left"><div class="meta"><span class="badge ${c.tone}">${ic(c.icon, 14)} ${c.label}</span><span class="cap">${relTime(r.ts)} · ${fmtDist(r.d)}</span></div><div>${esc(r.text)}</div><div class="meta"><span class="cap">${ic('thumb', 14)} ${(r.up || 0) + (votes[r.id] ? 1 : 0)} confirmaram</span>${r.seed ? '<span class="badge alt">Ilustrativo</span>' : ''}</div></button>`; }).join('') : `<div class="card alt center" style="box-shadow:none"><div class="head">Nada por aqui ainda</div><div class="small">${filter === 'mine' ? 'Você ainda não fez relatos.' : 'Nenhum relato perto de você.'}</div></div>`}</div></div>
      <button class="fab abs hit" data-new style="right:1rem;bottom:6rem;background:var(--rose);color:#fff;padding:.75rem 1.25rem;pointer-events:auto">${ic('plus', 20)} Relatar</button>`,
    mount(el, r) {
      $$('[data-f]', el).forEach(b => b.onclick = () => { filter = b.dataset.f; r.refresh(); });
      $$('[data-id]', el).forEach(b => b.onclick = () => openReport(all.find(x => x.id === b.dataset.id)));
      $('[data-new]', el).onclick = () => { draft = null; r.go('report-new', {}, { anim: 'up' }); };
    }
  };
});

let draft = null;
register('report-new', (p) => {
  if (!draft) draft = { cat: null, loc: p.loc ? { ...p.loc } : { lat: here.lat, lon: here.lon }, text: '', anon: true, addr: null };
  const d = draft;
  return {
    opts: {},
    html: `<div class="scroll" style="gap:1rem">${header('Novo relato')}
      <p class="lead">${T('O que você viu? Seu relato ajuda outras mulheres.', 'O que você viu?')}</p>
      <div class="grid2" role="radiogroup" aria-label="Tipo de relato">${Object.entries(CATS).map(([k, c]) => `<button class="opt" role="radio" aria-pressed="${d.cat === k}" data-c="${k}"><div class="tile ${c.tone}">${ic(c.icon, 22)}</div>${c.label}</button>`).join('')}</div>
      <div class="card"><div class="hrow"><div class="tile alt">${ic('pin', 22)}</div><div class="grow"><div class="strong" id="addr">${d.addr ? esc(d.addr) : 'Buscando endereço…'}</div><div class="small">${d.loc.lat.toFixed(4)}, ${d.loc.lon.toFixed(4)}</div></div><button class="btn soft sm" id="chg">Mudar</button></div></div>
      <div class="field"><label for="tx">Conte mais (opcional)</label><textarea id="tx" class="textarea" maxlength="280" placeholder="Ex.: poste apagado na esquina">${esc(d.text)}</textarea><div class="cap" style="text-align:right"><span id="cnt">${d.text.length}</span>/280</div></div>
      <div class="row"><div class="tile alt">${ic('eyeoff', 22)}</div><div class="grow"><div class="strong">Relato anônimo</div><div class="small">Sem nome e sem identificação.</div></div>${toggle('anon', d.anon, 'Relato anônimo')}</div></div>
      <div class="bar-fixed"><button class="btn primary" id="send" ${d.cat ? '' : 'disabled'}>${ic('send', 18)} Enviar relato</button></div>`,
    mount(el, r) {
      $$('[data-c]', el).forEach(b => b.onclick = () => { d.cat = b.dataset.c; $$('[data-c]', el).forEach(x => x.setAttribute('aria-pressed', x === b)); $('#send', el).disabled = false; vibrate(8); });
      const tx = $('#tx', el); tx.oninput = () => { d.text = tx.value; $('#cnt', el).textContent = tx.value.length; };
      bindToggle($('#anon', el), v => d.anon = v);
      if (!d.addr) net.reverse(d.loc.lat, d.loc.lon).then(pl => { d.addr = pl.name + (pl.sub ? ' · ' + pl.sub : ''); const a = $('#addr', el); if (a) a.textContent = d.addr; });
      $('#chg', el).onclick = () => r.go('pick', { title: 'Onde isso aconteceu?', confirm: 'Usar este local', center: d.loc, onPick: pl => { d.loc = { lat: pl.lat, lon: pl.lon }; d.addr = pl.name + (pl.sub ? ' · ' + pl.sub : ''); r.back(); } });
      $('#send', el).onclick = async () => {
        if (!store.get().consent.reports) { if (!await confirmDialog({ title: 'Ativar relatos?', body: 'Para contribuir, precisamos da sua permissão. O relato fica salvo só neste aparelho e você pode apagar quando quiser.', ok: 'Permitir e enviar', cancel: 'Agora não' })) return; store.update(s => s.consent.reports = true); }
        store.update(s => s.reports.unshift({ id: 'u' + store.uid(), cat: d.cat, lat: d.loc.lat, lon: d.loc.lon, text: d.text.trim() || CATS[d.cat].label, ts: Date.now(), anon: d.anon, up: 0 }));
        draft = null; r.go('report-sent', {}, { anim: 'fade', replace: true });
      };
    }
  };
});

register('report-sent', () => ({
  opts: {},
  html: `<div class="scroll bar" style="justify-content:center;gap:1.25rem"><div class="confetti" style="--c:var(--rose)"><span class="core">${ic('heart', 34)}</span></div>
    <div class="center stack"><h1 class="h-m">Obrigada por contribuir</h1><p class="lead">${T('Seu relato foi salvo e já aparece no mapa e no cálculo do score das suas rotas.', 'Seu relato foi salvo.')}</p></div>
    <div class="banner alt">${ic('lock', 18)}<span>Ele fica só no seu aparelho. Você pode excluir em Relatos › Meus.</span></div></div>
    <div class="bar-fixed"><button class="btn primary" id="m">Ver no mapa</button><button class="btn soft" id="r">Voltar aos relatos</button></div>`,
  mount(el, r) { $('#m', el).onclick = () => r.reset('home', {}, 'fade'); $('#r', el).onclick = () => { filter = 'mine'; r.reset('reports', {}, 'fade'); }; }
}));

/* ---------------- rede de apoio ---------------- */
const fmtPhone = p => { const d = p.replace(/^55/, ''); return d.length === 11 ? `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}` : d.length === 10 ? `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}` : p; };
register('support', () => {
  const g = store.get().guardians;
  const em = [['190', 'Polícia Militar', 'Emergência e perigo imediato', 'risk'], ['180', 'Central de Atendimento à Mulher', 'Orientação e denúncia de violência', 'rose'], ['192', 'SAMU', 'Emergência médica', 'safe'], ['100', 'Disque Direitos Humanos', 'Violações de direitos', 'alt']];
  return {
    opts: { tabs: true },
    html: `<div class="scroll tabs" style="gap:1rem">${header('Rede de apoio', { back: false })}
      <div class="over">Emergência · ligação gratuita</div>
      <div class="stack" style="gap:.625rem">${em.map(([n, t, d, tone]) => `<a class="row press" href="tel:${n}"><div class="tile ${tone === 'rose' ? '' : tone}">${ic('phone', 22)}</div><div class="grow"><div class="strong">${n} · ${t}</div><div class="small">${d}</div></div>${ic('right', 18)}</a>`).join('')}</div>
      <div class="hrow" style="margin-top:.5rem"><div class="grow"><div class="over">Pessoas de confiança</div></div><button class="btn soft sm" id="add">${ic('plus', 16)} Adicionar</button></div>
      <div class="stack" style="gap:.625rem">${g.length ? g.map(x => `<div class="row"><div class="avatar rose">${esc(x.name[0].toUpperCase())}</div><div class="grow"><div class="strong">${esc(x.name)}</div><div class="small">${fmtPhone(x.phone)}</div></div><a class="iconbtn" href="tel:+${x.phone}" aria-label="Ligar para ${esc(x.name)}" style="box-shadow:none;background:var(--safe-soft);color:var(--safe)">${ic('phone', 20)}</a><button class="iconbtn" data-del="${x.id}" aria-label="Remover ${esc(x.name)}" style="box-shadow:none;background:var(--risk-soft);color:var(--risk)">${ic('trash', 20)}</button></div>`).join('') : `<div class="card alt" style="box-shadow:none"><div class="head">Nenhum contato ainda</div><div class="small">${T('Adicione quem pode te ajudar. Elas recebem seus avisos pelo WhatsApp.', 'Adicione quem pode ajudar você.')}</div></div>`}</div></div>`,
    mount(el, r) {
      $('#add', el).onclick = () => r.go('guardian-add', {}, { anim: 'up' });
      $$('[data-del]', el).forEach(b => b.onclick = async () => { if (await confirmDialog({ title: 'Remover contato?', body: 'Essa pessoa deixa de aparecer nos avisos e no SOS.', ok: 'Remover', danger: true })) { store.update(s => s.guardians = s.guardians.filter(x => x.id !== b.dataset.del)); r.refresh(); } });
    }
  };
});
register('guardian-add', () => ({
  opts: {},
  html: `<div class="scroll" style="gap:1rem">${header('Nova pessoa de confiança')}
    <p class="lead">${T('Ela vai receber seus avisos e o SOS pelo WhatsApp.', 'Ela recebe seus avisos.')}</p>
    <div class="field"><label for="gn">Nome</label><input id="gn" class="input" autocomplete="off" maxlength="40" placeholder="Ex.: Mãe, Ana"></div>
    <div class="field"><label for="gp">Celular com DDD</label><input id="gp" class="input" type="tel" inputmode="tel" autocomplete="off" placeholder="(11) 91234-5678" aria-describedby="gerr"><div id="gerr" class="small" style="color:var(--risk);min-height:1.2em" role="alert"></div></div>
    <label class="row" style="cursor:pointer"><input type="checkbox" id="gok" style="width:1.5rem;height:1.5rem;accent-color:var(--plum)"><span class="grow small" style="color:var(--ink)">Já avisei essa pessoa que ela é meu contato de confiança.</span></label>
    </div><div class="bar-fixed"><button class="btn primary" id="sv" disabled>Salvar contato</button></div>`,
  mount(el, r) {
    const n = $('#gn', el), p = $('#gp', el), ok = $('#gok', el), b = $('#sv', el), err = $('#gerr', el);
    const digits = () => p.value.replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '');
    const check = () => { b.disabled = !(n.value.trim() && ok.checked); };
    [n, p, ok].forEach(x => x.addEventListener('input', check)); ok.addEventListener('change', check);
    b.onclick = () => {
      const d = digits(); if (d.length < 10 || d.length > 11) { err.textContent = 'Digite o DDD e o número (10 ou 11 dígitos).'; p.focus(); return; }
      store.update(s => s.guardians.push({ id: store.uid(), name: n.value.trim(), phone: '55' + d }));
      toast('Contato salvo', 'check'); r.back();
    };
  }
}));
