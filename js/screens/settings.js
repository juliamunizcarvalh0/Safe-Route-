import { register } from '../router.js';
import * as store from '../store.js';
import { ic } from '../icons.js';
import { $, $$, T, esc, toast, modal, confirmDialog, header, toggle, bindToggle, download } from '../ui.js';
import { a11yControls, bindA11y } from './onboarding.js';

register('me', () => {
  const st = store.get();
  const items = [['access', 'Acessibilidade', 'Letra, contraste, voz, movimento', 'a11y', ''], ['lock', 'Privacidade e dados', 'Permissões, exportar e apagar', 'privacy', ''], ['bus', 'Transporte', 'Ônibus, metrô e tempo real (Olho Vivo)', 'transit-settings', ''], ['users', 'Participação', 'Ajude a melhorar o SafeRoute', 'participate', ''], ['eyeoff', 'Modo discreto', 'Calculadora. Sair: digite 1234 e toque em =, ou segure =', 'calc', ''], ['info', 'Sobre o SafeRoute', 'Versão, fontes e créditos', 'about', '']];
  return {
    opts: { tabs: true },
    html: `<div class="scroll tabs" style="gap:1rem">${header('Perfil', { back: false })}
      <div class="card" style="background:var(--plum);color:#fff;box-shadow:none"><div class="hrow"><div class="tile" style="background:rgba(255,255,255,.16);color:#fff">${ic('shield', 24)}</div><div class="grow"><div class="head">Seus dados ficam com você</div><div class="small" style="color:var(--on-dark-soft)">Sem conta, sem servidor. ${st.trips.length} caminhada(s), ${st.reports.length} relato(s) neste aparelho.</div></div></div></div>
      <div class="group">${items.map(([i, t, d, to]) => `<button class="row press" data-to="${to}"><div class="tile alt">${ic(i, 22)}</div><div class="grow"><div class="strong">${t}</div><div class="small">${d}</div></div>${ic('right', 18)}</button>`).join('')}</div>
      <div class="over" style="margin-top:.5rem">Minhas caminhadas</div>
      ${st.trips.length ? `<div class="stack" style="gap:.5rem">${st.trips.slice(0, 4).map(t => `<div class="row"><div class="tile ${t.fb === 'bad' ? 'risk' : t.fb === 'meh' ? 'warn' : 'safe'}">${ic(t.fb === 'bad' ? 'frown' : t.fb === 'meh' ? 'meh' : 'smile', 22)}</div><div class="grow"><div class="strong">${esc(t.dest)}</div><div class="small">${new Date(t.ts).toLocaleDateString('pt-BR')} · ${(t.dist / 1000).toFixed(1).replace('.', ',')} km${t.score != null ? ' · score ' + t.score : ''}</div></div></div>`).join('')}</div>` : `<div class="small">Suas caminhadas concluídas aparecem aqui.</div>`}
    </div>`,
    mount(el, r) { $$('[data-to]', el).forEach(b => b.onclick = () => r.go(b.dataset.to, {}, { anim: b.dataset.to === 'calc' ? 'fade' : 'forward' })); }
  };
});

register('a11y', () => ({
  opts: {},
  html: `<div class="scroll" style="gap:1rem">${header('Acessibilidade')}${a11yControls(store.get().settings)}
    ${[['voice', 'volume', 'Voz de orientação', 'Fala as instruções durante a caminhada.'], ['vibrate', 'vibrate', 'Vibração', 'Avisos táteis em curvas e no SOS.']].map(([k, i, t, d]) => `<div class="row"><div class="tile alt">${ic(i, 22)}</div><div class="grow"><div class="strong">${t}</div><div class="small">${d}</div></div>${toggle('a-' + k, store.get().settings[k], t)}</div>`).join('')}
    <div class="banner alt">${ic('info', 18)}<span>Seguimos o WCAG 2.2 AA: contraste, foco visível, alvos de toque e alternativas ao botão de segurar.</span></div></div>`,
  mount(el, r) {
    bindA11y(el, r);
    $('#a-simple', el).addEventListener('click', () => setTimeout(() => r.refresh(), 0));
    ['voice', 'vibrate'].forEach(k => bindToggle($('#a-' + k, el), v => store.update(s => s.settings[k] = v)));
  }
}));

register('privacy', () => {
  const c = store.get().consent;
  return {
    opts: {},
    html: `<div class="scroll" style="gap:1rem">${header('Privacidade e dados')}
      <p class="lead">${T('Você manda nos seus dados (LGPD). Mude de ideia quando quiser.', 'Você manda nos seus dados.')}</p>
      <div class="row"><div class="tile">${ic('locate', 22)}</div><div class="grow"><div class="strong">Usar minha localização</div><div class="small">Só para mostrar onde você está e guiar.</div></div>${toggle('p-loc', c.location, 'Usar minha localização')}</div>
      <div class="row"><div class="tile">${ic('flag', 22)}</div><div class="grow"><div class="strong">Contribuir com relatos</div><div class="small">Permite criar relatos anônimos.</div></div>${toggle('p-rep', c.reports, 'Contribuir com relatos')}</div>
      <div class="card alt" style="box-shadow:none"><div class="strong">O que fica guardado</div><div class="small">Neste aparelho (localStorage): preferências, locais salvos, contatos, relatos e histórico de caminhadas. <b>Nada disso é enviado a um servidor do SafeRoute.</b></div><div class="strong" style="margin-top:.5rem">O que sai do aparelho</div><div class="small">Ao buscar um endereço ou calcular rota, o trecho necessário é consultado em serviços abertos (OpenStreetMap/Nominatim, OSRM, Overpass) — esses serviços podem registrar seu IP. Avisos pelo WhatsApp só acontecem quando você toca em enviar.</div></div>
      <button class="btn soft" id="exp">${ic('download', 18)} Exportar meus dados (JSON)</button>
      <button class="btn dangerline" id="wipe">${ic('trash', 18)} Apagar tudo e recomeçar</button></div>`,
    mount(el, r) {
      bindToggle($('#p-loc', el), v => store.update(s => { s.consent.location = v; s.consent.at = Date.now(); }));
      bindToggle($('#p-rep', el), v => store.update(s => { s.consent.reports = v; s.consent.at = Date.now(); }));
      $('#exp', el).onclick = () => { download('saferoute-meus-dados.json', store.exportData()); toast('Arquivo gerado', 'download'); };
      $('#wipe', el).onclick = async () => { if (await confirmDialog({ title: 'Apagar tudo?', body: 'Locais, contatos, relatos e preferências serão removidos deste aparelho. Não dá para desfazer.', ok: 'Apagar tudo', danger: true })) { store.wipe(); store.applySettings(); toast('Dados apagados', 'trash'); r.reset('splash', {}, 'fade'); } };
    }
  };
});

const QS = ['Sinto que controlo meus dados neste app.', 'Entendi o que o score de segurança significa.', 'Consegui usar o app com o tamanho de letra de que preciso.', 'Confio nas rotas sugeridas.', 'Usaria o app no meu dia a dia.'];
register('participate', () => {
  const sv = store.get().survey || { a: [], t: '' };
  return {
    opts: {},
    html: `<div class="scroll" style="gap:1rem">${header('Participação')}
      <p class="lead">${T('O SafeRoute é construído com mulheres. Responda de 1 (discordo) a 5 (concordo).', 'Responda de 1 a 5.')}</p>
      ${QS.map((q, i) => `<div class="card" role="group" aria-labelledby="q${i}"><div class="strong" id="q${i}">${q}</div><div class="chips">${[1, 2, 3, 4, 5].map(n => `<button class="chip" style="min-width:var(--tap);justify-content:center" role="radio" aria-checked="${sv.a[i] === n}" data-q="${i}" data-n="${n}" aria-label="${n}">${n}</button>`).join('')}</div></div>`).join('')}
      <div class="field"><label for="ft">O que melhoraria?</label><textarea id="ft" class="textarea" maxlength="500">${esc(sv.t)}</textarea></div>
      <div class="banner alt">${ic('lock', 18)}<span>Suas respostas ficam neste aparelho. Para contribuir com a pesquisa, exporte e envie à equipe do projeto.</span></div>
      <button class="btn soft" id="ex">${ic('download', 18)} Exportar respostas</button></div>
      <div class="bar-fixed"><button class="btn primary" id="sv">Salvar respostas</button></div>`,
    mount(el, r) {
      const a = [...sv.a]; $$('[data-q]', el).forEach(b => b.onclick = () => { a[+b.dataset.q] = +b.dataset.n; $$(`[data-q="${b.dataset.q}"]`, el).forEach(x => x.setAttribute('aria-checked', x === b)); });
      const save = () => store.update(s => s.survey = { a, t: $('#ft', el).value, ts: Date.now() });
      $('#sv', el).onclick = () => { save(); toast('Obrigada! Respostas salvas.', 'heart'); r.back(); };
      $('#ex', el).onclick = () => { save(); download('saferoute-respostas.json', JSON.stringify({ perguntas: QS, respostas: a, comentario: $('#ft', el).value }, null, 2)); };
    }
  };
});

register('about', () => ({
  opts: {},
  html: `<div class="scroll" style="gap:1rem">${header('Sobre o SafeRoute')}
    <div class="card"><div class="head">Protótipo funcional · IHC · UFABC</div><div class="small">Versão 1.0. Projeto acadêmico de navegação urbana segura para mulheres. <b>Não substitui serviços de emergência</b> — em perigo, ligue 190.</div></div>
    <div class="card"><div class="head">Sobre os dados</div><div class="small"><b>Mapa, busca e rotas</b>: OpenStreetMap (ODbL), Nominatim e OSRM. <b>Iluminação e comércio</b>: OpenStreetMap via Overpass. <b>Ocorrências e relatos de exemplo</b>: dados ilustrativos criados para a demonstração — não são estatísticas oficiais. A cobertura do score de risco é apenas da Grande São Paulo.</div></div>
    <div class="card"><div class="head">Limites desta versão</div><div class="small">Sem servidor: avisos a contatos e SOS são abertos no WhatsApp/telefone e dependem do seu toque. Não há transmissão de áudio nem compartilhamento ao vivo. A caminhada usa simulação por padrão; o GPS real é opcional.</div></div>
    <div class="small center">Mapas © OpenStreetMap contributors · Leaflet · Fontes: DM Sans e Fraunces (OFL)</div></div>`,
  mount() {}
}));
