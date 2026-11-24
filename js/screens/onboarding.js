import { register } from '../router.js';
import * as store from '../store.js';
import { ic } from '../icons.js';
import { $, $$, T, esc, header, toggle, bindToggle, toast } from '../ui.js';
import { requestGPS } from '../geo.js';

register('splash', () => ({
  opts: { cls: 'splash', darkbar: true },
  html: `<div class="waves"><i style="width:14rem;height:14rem"></i><i style="width:20rem;height:20rem;animation-delay:.6s"></i><i style="width:27rem;height:27rem;animation-delay:1.2s"></i></div>
    <div class="logo">${ic('shield', 56)}</div><h1 class="h-l" style="color:#fff;margin-top:.5rem">SafeRoute</h1>
    <p style="color:#fff;opacity:.85">Seu caminho, com mais cuidado.</p>`,
  mount(el, r) { const t = setTimeout(() => store.get().onboarded ? r.reset('home', {}, 'fade') : r.go('welcome', {}, { anim: 'fade' }), 1700); return () => clearTimeout(t); }
}));

register('welcome', () => ({
  opts: {},
  html: `<div class="scroll bar" style="padding-top:4rem;justify-content:center;gap:1.5rem">
    <div class="tile plum" style="width:4.5rem;height:4.5rem;border-radius:1.5rem">${ic('shield', 36)}</div>
    <h1 class="h-l">${T('Chegar em casa com tranquilidade.', 'Chegar em casa com calma.')}</h1>
    <p class="lead">${T('Rotas a pé pensadas com você: iluminação, movimento, relatos de outras mulheres e uma rede de apoio sempre a um toque.', 'Rotas a pé com mais cuidado e ajuda por perto.')}</p>
    <div class="stack">
      ${[['bulb', 'Score de segurança transparente', 'Você vê o porquê de cada nota.'], ['users', 'Feito com mulheres', 'Relatos e feedback ajudam a melhorar o app.'], ['lock', 'Seus dados são seus', 'Tudo fica só no seu aparelho. Você exporta ou apaga quando quiser.']]
        .map(([i, t, d]) => `<div class="hrow"><div class="tile">${ic(i, 22)}</div><div class="grow"><div class="strong">${t}</div><div class="small">${d}</div></div></div>`).join('')}
    </div></div>
    <div class="bar-fixed"><button class="btn primary" data-next>Começar</button><button class="btn soft" data-skip>Já usei antes · pular</button></div>`,
  mount(el, r) {
    $('[data-next]', el).onclick = () => r.go('consent');
    $('[data-skip]', el).onclick = () => { store.update(s => s.onboarded = true); r.reset('home'); };
  }
}));

register('consent', () => {
  const c = store.get().consent;
  return {
    opts: {},
    html: `<div class="scroll" style="gap:1rem">${header('Você decide o que compartilhar')}
      <p class="lead">${T('Nada é obrigatório. Você pode mudar isso depois em Perfil › Privacidade e dados.', 'Nada é obrigatório. Dá para mudar depois.')}</p>
      <div class="card"><div class="hrow"><div class="tile">${ic('locate', 22)}</div><div class="grow"><div class="strong">Usar minha localização</div><div class="small">Para mostrar onde você está e guiar a rota. Fica só no aparelho.</div></div>${toggle('c-loc', c.location, 'Usar minha localização')}</div></div>
      <div class="card"><div class="hrow"><div class="tile">${ic('flag', 22)}</div><div class="grow"><div class="strong">Contribuir com relatos</div><div class="small">Se ativar, você pode relatar problemas nas ruas. Anônimo por padrão.</div></div>${toggle('c-rep', c.reports, 'Contribuir com relatos')}</div></div>
      <div class="banner alt">${ic('lock', 18)}<span>Seguimos a LGPD: coletamos só o necessário, com sua permissão. Sem anúncios, sem venda de dados, sem contas obrigatórias.</span></div>
    </div>
    <div class="bar-fixed"><button class="btn primary" data-ok>Salvar e continuar</button><button class="btn soft" data-no>Continuar sem permitir</button></div>`,
    mount(el, r) {
      let loc = c.location, rep = c.reports;
      bindToggle($('#c-loc', el), v => loc = v); bindToggle($('#c-rep', el), v => rep = v);
      const save = async (l, p) => { store.update(s => { s.consent.location = l; s.consent.reports = p; s.consent.at = Date.now(); }); if (l) { try { await requestGPS(6000); } catch { toast('Não consegui sua localização. Usaremos um local de demonstração.', 'info', 3800); } } r.go('a11y-setup'); };
      $('[data-ok]', el).onclick = () => save(loc, rep);
      $('[data-no]', el).onclick = () => save(false, false);
    }
  };
});

export const FONT_STEPS = [[.9, 'Pequeno'], [1, 'Padrão'], [1.15, 'Grande'], [1.3, 'Maior'], [1.5, 'Máximo']];
export function fontIndex(v) { let b = 1, d = 9; FONT_STEPS.forEach(([x], i) => { if (Math.abs(x - v) < d) { d = Math.abs(x - v); b = i; } }); return b; }
const tgl = (s, k, i, t, d) => `<div class="row"><div class="tile alt">${ic(i, 22)}</div><div class="grow"><div class="strong">${t}</div><div class="small">${d}</div></div>${toggle('a-' + k, s[k], t)}</div>`;
const chipRow = (s, k, i, t, d, opts) => `<div class="card"><div class="hrow"><div class="tile alt">${ic(i, 22)}</div><div class="grow"><div class="strong">${t}</div><div class="small">${d}</div></div></div><div class="hrow" role="radiogroup" aria-label="${t}" style="flex-wrap:wrap;gap:.5rem;margin-top:.625rem">${opts.map(([v, l]) => `<button class="chip" role="radio" data-opt="${k}" data-v="${v}" aria-checked="${String(s[k] ?? opts[0][0]) === String(v)}">${l}</button>`).join('')}</div></div>`;
const sizeCard = s => `<div class="card"><div class="hrow"><div class="tile">${ic('type', 22)}</div><div class="grow strong">Tamanho da letra</div><span class="badge rose" id="fs-label">${FONT_STEPS[fontIndex(s.fontScale)][1]}</span></div>
    <input class="range" id="fs" type="range" min="0" max="4" step="1" value="${fontIndex(s.fontScale)}" aria-label="Tamanho da letra" aria-valuetext="${FONT_STEPS[fontIndex(s.fontScale)][1]}">
    <div class="card alt flat"><div class="head">Exemplo de texto</div><div class="small">É assim que o app vai aparecer para você. Tudo muda de verdade.</div></div></div>`;
const THEME = [['auto', 'Automático'], ['light', 'Claro'], ['dark', 'Escuro']];
const CONTR = [[0, 'Padrão'], [1, 'Reforçado'], [2, 'Máximo']];
export function a11yControls(s) { // versão curta, usada no início
  return `${sizeCard(s)}${chipRow(s, 'theme', 'contrast', 'Tema de cor', 'Claro, escuro ou igual ao do seu celular.', THEME)}
  ${[['big', 'access', 'Botões grandes', 'Áreas de toque maiores.'], ['simple', 'msg', 'Linguagem simples', 'Textos mais curtos e diretos.'], ['reduce', 'sliders', 'Reduzir movimento', 'Menos animações e nada piscando.']].map(([k, i, t, d]) => tgl(s, k, i, t, d)).join('')}`;
}
export function a11yFull(s) { // versão completa, em Ajustes › Acessibilidade
  const sec = t => `<div class="over" style="margin-top:.5rem">${t}</div>`;
  return `${sec('Ver melhor')}${chipRow(s, 'theme', 'contrast', 'Tema de cor', 'Claro, escuro ou igual ao do seu celular.', THEME)}
  ${chipRow(s, 'tint', 'contrast', 'Filtro de cor da tela', 'Uma película de cor sobre a tela, como uma lente.', [['none', 'Nenhum'], ['yellow', 'Amarelo'], ['sepia', 'Sépia'], ['green', 'Verde']])}
  ${chipRow(s, 'contrastLevel', 'contrast', 'Contraste do texto', 'Quanto mais forte, mais escuro o texto e as bordas.', CONTR)}
  ${tgl(s, 'dim', 'sun', 'Reduzir brilho', 'Deixa as cores claras menos fortes.')}${tgl(s, 'invert', 'contrast', 'Inverter cores', 'Troca claro e escuro para ler com menos brilho.')}${tgl(s, 'reduce', 'sliders', 'Reduzir movimento', 'Menos animações e nada piscando.')}
  ${sec('Ler melhor')}${sizeCard(s)}${chipRow(s, 'font', 'type', 'Tipo de letra', 'A do app ou a do seu celular, mais familiar.', [['brand', 'Do app'], ['system', 'Do celular'], ['legible', 'Bem legível']])}
  ${tgl(s, 'bold', 'type', 'Texto em negrito', 'Letras mais grossas em todo o app.')}${tgl(s, 'spacing', 'type', 'Espaço entre linhas', 'Mais espaço entre linhas, letras e palavras.')}${tgl(s, 'simple', 'msg', 'Linguagem simples', 'Textos mais curtos e diretos.')}
  ${sec('Ouvir')}${tgl(s, 'voice', 'volume', 'Voz de orientação', 'Fala as instruções durante a caminhada.')}${chipRow(s, 'rate', 'volume', 'Velocidade da voz', 'Para ouvir com calma ou mais rápido.', [['slow', 'Devagar'], ['normal', 'Normal'], ['fast', 'Rápida']])}
  <div class="card"><div class="hrow"><div class="tile alt">${ic('volume', 22)}</div><div class="grow"><div class="strong">Qual voz</div><div class="small">Escolha a voz que seu celular tem em português.</div></div></div><select id="vv" class="input" aria-label="Qual voz" style="margin-top:.625rem"><option value="">Automática</option></select></div>
  ${tgl(s, 'confirmVoice', 'msg', 'Confirmar falando', 'Fala em voz alta avisos como "Relato enviado".')}${tgl(s, 'vibrate', 'vibrate', 'Vibração', 'Aviso ao se aproximar da curva (esquerda: 2 toques, direita: 3), na chegada e no SOS. Funciona em Android.')}
  ${sec('Tocar e usar')}${tgl(s, 'big', 'access', 'Botões grandes', 'Áreas de toque maiores.')}${chipRow(s, 'focus', 'access', 'Contorno de foco', 'A borda que mostra onde você está ao usar teclado.', [['normal', 'Padrão'], ['thick', 'Grosso']])}
  ${chipRow(s, 'tapMode', 'access', 'Como tocar nos botões de encerrar e esconder', 'Evita toques sem querer em Encerrar e Esconder. Quem usa teclado não precisa confirmar.', [['simple', 'Toque simples'], ['double', 'Toque duplo'], ['long', 'Segurar']])}
  ${chipRow(s, 'tapMin', 'access', 'Ignorar toques muito rápidos', 'Ajuda a evitar toques por tremor na mão. Só vale quando você toca na tela.', [[0, 'Não ignorar'], [150, '0,15 s'], [300, '0,3 s']])}
  ${chipRow(s, 'sosHold', 'shieldalert', 'Tempo para segurar o SOS', 'Quanto tempo segurar o botão. Há sempre o botão alternativo, sem segurar.', [[1, '1 s'], [2, '2 s'], [4, '4 s']])}
  ${chipRow(s, 'toastMode', 'info', 'Tempo dos avisos', 'Quanto tempo os avisos ficam na tela.', [['short', '3 s'], ['long', '8 s'], ['sticky', 'Até eu fechar']])}`;
}
export function bindA11y(el, r) {
  const fs = $('#fs', el);
  if (fs) fs.oninput = () => { const [v, l] = FONT_STEPS[+fs.value]; store.update(s => s.settings.fontScale = v); store.applySettings(); $('#fs-label', el).textContent = l; fs.setAttribute('aria-valuetext', l); };
  ['big', 'simple', 'reduce', 'invert', 'bold', 'spacing', 'dim', 'confirmVoice'].forEach(k => { const t = $('#a-' + k, el); if (t) bindToggle(t, v => { store.update(s => s.settings[k] = v); store.applySettings(); }); });
  $$('[data-opt]', el).forEach(b => b.onclick = () => {
    const k = b.dataset.opt; let v = b.dataset.v; if (['contrastLevel', 'sosHold', 'tapMin'].includes(k)) v = +v;
    store.update(s => { s.settings[k] = v; if (k === 'contrastLevel') s.settings.contrast = v === 2; }); store.applySettings();
    $$(`[data-opt="${k}"]`, el).forEach(x => x.setAttribute('aria-checked', x === b));
  });
  const vv = $('#vv', el);
  if (vv) {
    const fill = () => { try { const cur = store.get().settings.voiceName; speechSynthesis.getVoices().filter(v => /^pt/i.test(v.lang)).forEach(v => { if (![...vv.options].some(o => o.value === v.name)) { const o = document.createElement('option'); o.value = v.name; o.textContent = v.name; vv.appendChild(o); } }); vv.value = cur || ''; } catch {} };
    fill(); try { speechSynthesis.addEventListener('voiceschanged', fill); } catch {}
    vv.onchange = () => store.update(s => s.settings.voiceName = vv.value);
  }
}
register('a11y-setup', () => ({
  opts: {},
  html: `<div class="scroll" style="gap:1rem">${header('Deixe do seu jeito')}<p class="lead">${T('Ajuste agora para ficar confortável. Você muda quando quiser.', 'Ajuste para ficar confortável.')}</p>${a11yControls(store.get().settings)}</div>
    <div class="bar-fixed"><button class="btn primary" data-ok>Tudo certo, abrir o mapa</button></div>`,
  mount(el, r) { bindA11y(el, r); $('[data-ok]', el).onclick = () => { store.update(s => s.onboarded = true); r.reset('home', {}, 'fade'); }; }
}));
