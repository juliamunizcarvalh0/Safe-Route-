# SafeRoute — protótipo funcional (IHC · UFABC)

App web (PWA) de navegação a pé pensada para a segurança das mulheres. É o protótipo **real** do design feito no Figma: busca de endereços, mapa interativo, rotas a pé com score de segurança, navegação, SOS, relatos, rede de apoio e acessibilidade de verdade (tamanho de letra, alto contraste, botões grandes, linguagem simples).

Sem build, sem dependências para instalar: HTML + CSS + JavaScript (módulos ES). Leaflet e as fontes já estão em `vendor/` e `fonts/`.

## O que é real
- Mapa interativo (tiles do OpenStreetMap) e busca de endereços (Nominatim, com Photon de reserva).
- Rotas a pé (OSRM), até 3 alternativas.
- Iluminação, comércio aberto e tipo de via vindos do OpenStreetMap (Overpass) alimentam o score.
- GPS real (com sua permissão), voz (Web Speech), vibração, ligação (190/180/192/100) e WhatsApp.
- Preferências, contatos, relatos e histórico salvos só no aparelho; exportar JSON e apagar tudo (LGPD).

## O que é simulado / limites (importante para o relatório)
- **Ocorrências e relatos de exemplo são dados ilustrativos**, não estatísticas oficiais (SSP-SP etc.). Cobrem só a Grande São Paulo; fora dela o score ignora esse critério e avisa.
- **Não há servidor**: avisos e SOS abrem o WhatsApp/telefone com a mensagem pronta e dependem do toque da usuária. Não há áudio/localização ao vivo para terceiros.
- A caminhada começa em **simulação** (×1, ×4, ×10) para poder demonstrar; o **GPS real** é opcional no painel.
- Serviços gratuitos (Nominatim, OSRM, Overpass) têm limites de uso e podem ficar lentos; para uso real, hospede os seus.
- O score é apoio à decisão, não garantia de segurança. O app não substitui o 190.

## Estrutura
`index.html` · `css/app.css` (tokens do Figma) · `js/` (`router`, `store`, `net`, `score`, `map`, `screens/*`) · `sw.js` e `manifest.webmanifest` (PWA).
Modo discreto: abre como calculadora; digite `1234` e toque em "="

Créditos: © OpenStreetMap contributors, Leaflet (BSD-2), fontes DM Sans e Fraunces (OFL).
