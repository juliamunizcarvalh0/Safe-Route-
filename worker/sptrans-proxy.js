// Proxy do Olho Vivo (SPTrans) para o SafeRoute — Cloudflare Worker.
// O TOKEN fica só aqui, como segredo (wrangler secret put SPTRANS_TOKEN). Nunca vai para o site público.
const BASE = 'https://api.olhovivo.sptrans.com.br/v2.1';
let cookie = null, cookieAt = 0;

async function login(env) {
  const r = await fetch(`${BASE}/Login/Autenticar?token=${encodeURIComponent(env.SPTRANS_TOKEN)}`, { method: 'POST' });
  const ok = (await r.text()).trim() === 'true';
  const sc = r.headers.get('set-cookie');
  if (!ok || !sc) throw new Error('login_falhou');
  cookie = sc.split(';')[0]; cookieAt = Date.now();
}
async function olho(env, path) {
  if (!cookie || Date.now() - cookieAt > 15 * 60e3) await login(env);
  let r = await fetch(BASE + path, { headers: { Cookie: cookie } });
  if (r.status === 401) { await login(env); r = await fetch(BASE + path, { headers: { Cookie: cookie } }); }
  return r;
}
const cors = (env, req) => {
  const allowed = (env.ALLOWED_ORIGIN || '*').split(',').map(s => s.trim());
  const o = req.headers.get('Origin') || '';
  const ok = allowed.includes('*') || allowed.includes(o);
  return { 'Access-Control-Allow-Origin': ok ? (allowed.includes('*') ? '*' : o) : allowed[0], 'Vary': 'Origin', 'Access-Control-Allow-Methods': 'GET,OPTIONS' };
};
const json = (data, status, headers, cache = 0) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': cache ? `public, max-age=${cache}` : 'no-store', ...headers } });

export default {
  async fetch(req, env) {
    const h = cors(env, req);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: h });
    if (req.method !== 'GET') return json({ erro: 'metodo' }, 405, h);
    if (!env.SPTRANS_TOKEN) return json({ erro: 'token_nao_configurado' }, 500, h);
    const u = new URL(req.url), q = u.searchParams;
    try {
      let path;
      if (u.pathname === '/stops') { const t = (q.get('q') || '').trim(); if (t.length < 2 || t.length > 60) return json({ erro: 'q' }, 400, h); path = `/Parada/Buscar?termosBusca=${encodeURIComponent(t)}`; }
      else if (u.pathname === '/arrivals') { const s = q.get('stop') || ''; if (!/^\d{1,10}$/.test(s)) return json({ erro: 'stop' }, 400, h); path = `/Previsao/Parada?codigoParada=${s}`; }
      else if (u.pathname === '/lines') { const t = (q.get('q') || '').trim(); if (t.length < 1 || t.length > 40) return json({ erro: 'q' }, 400, h); path = `/Linha/Buscar?termosBusca=${encodeURIComponent(t)}`; }
      else if (u.pathname === '/positions') { const l = q.get('line') || ''; if (!/^\d{1,10}$/.test(l)) return json({ erro: 'line' }, 400, h); path = `/Posicao/Linha?codigoLinha=${l}`; }
      else if (u.pathname === '/' || u.pathname === '/health') return json({ ok: true, servico: 'saferoute-sptrans-proxy' }, 200, h);
      else return json({ erro: 'rota' }, 404, h);
      const r = await olho(env, path);
      if (!r.ok) return json({ erro: 'upstream', status: r.status }, 502, h);
      return json(await r.json(), 200, h, u.pathname === '/arrivals' ? 10 : 60);
    } catch (e) { return json({ erro: 'falha', detalhe: String(e.message || e) }, 502, h); }
  }
};
