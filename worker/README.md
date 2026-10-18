# Proxy do Olho Vivo (SPTrans) — tempo real dos ônibus

O token da SPTrans **não pode ficar no site** (o código do GitHub Pages é público) e a API Olho Vivo não aceita chamadas direto do navegador. Este Worker (Cloudflare, plano gratuito) guarda o token em segredo e libera só os endpoints que o app usa.

## Publicar (uma vez, ~10 min)
1. Crie conta gratuita em https://dash.cloudflare.com e instale o Node.js.
2. No terminal, dentro da pasta `worker/`:
   ```bash
   npm install -g wrangler
   wrangler login
   wrangler secret put SPTRANS_TOKEN     # cole o token quando pedir (não vai para o Git)
   wrangler deploy
   ```
3. O comando mostra o endereço, tipo `https://saferoute-sptrans-proxy.SEU-NOME.workers.dev`.
4. Em `wrangler.toml`, confira `ALLOWED_ORIGIN` (o endereço do seu site no GitHub Pages) e rode `wrangler deploy` de novo se mudar.
5. No app: **Perfil › Transporte › Endereço do proxy** → cole o endereço → **Testar conexão** → **Salvar**.

## Endpoints
`/stops?q=nome` · `/arrivals?stop=codigo` · `/lines?q=texto` · `/positions?line=codigo` · `/health`

## Segurança
- Nunca coloque o token em arquivos do repositório, no Figma ou em mensagens. Se vazou, gere outro no portal SPTrans (https://www.sptrans.com.br/desenvolvedores/).
- `ALLOWED_ORIGIN` limita quais sites podem usar o proxy.
- Teste local da lógica (sem rede): `node test.mjs`.
