import worker from './sptrans-proxy.js';
const calls = [];
globalThis.fetch = async (url, opt = {}) => {
  calls.push([url, opt.method || 'GET', opt.headers?.Cookie]);
  if (url.includes('Login/Autenticar')) return new Response('true', { headers: { 'set-cookie': 'apiCredentials=abc123; path=/; HttpOnly' } });
  if (url.includes('Parada/Buscar')) return Response.json([{ cp: 1234, np: 'Metrô Consolação', py: -23.55, px: -46.66 }]);
  if (url.includes('Previsao/Parada')) return Response.json({ p: { cp: 1234, l: [{ c: '8700-10', lt0: 'A', lt1: 'B', vs: [{ t: '10:05' }] }] } });
  return new Response('x', { status: 404 });
};
const env = { SPTRANS_TOKEN: 'TESTE', ALLOWED_ORIGIN: 'https://exemplo.github.io' };
const get = p => worker.fetch(new Request('https://w.dev' + p, { headers: { Origin: 'https://exemplo.github.io' } }), env);
let r = await get('/stops?q=Consolação'); console.log(r.status, r.headers.get('access-control-allow-origin'), await r.json());
r = await get('/arrivals?stop=1234'); console.log(r.status, (await r.json()).p.l[0].c);
r = await get('/arrivals?stop=12;drop'); console.log('invalid stop ->', r.status);
r = await get('/stops?q=a'); console.log('short q ->', r.status);
r = await worker.fetch(new Request('https://w.dev/stops?q=ab', { method: 'POST' }), env); console.log('POST ->', r.status);
r = await worker.fetch(new Request('https://w.dev/stops?q=ab'), { }); console.log('sem token ->', r.status);
console.log('logins:', calls.filter(c => c[0].includes('Autenticar')).length, 'cookie usado:', calls.filter(c => c[2]).length);
