// DADOS ILUSTRATIVOS — usados só para demonstrar o funcionamento do score e do mapa de relatos.
// Não representam estatísticas reais de segurança pública (SSP-SP ou qualquer outra fonte).
export const COVERAGE = { lat: -23.55, lon: -46.64, radius: 30000 }; // área com dados ilustrativos (Grande São Paulo)
export const HOTSPOTS = [ // intensidade 0..1, raio (m)
  { lat: -23.5434, lon: -46.6429, w: .8, r: 220 }, { lat: -23.5343, lon: -46.6336, w: .9, r: 260 },
  { lat: -23.5405, lon: -46.6490, w: .6, r: 200 }, { lat: -23.5503, lon: -46.6479, w: .5, r: 180 },
  { lat: -23.5530, lon: -46.6575, w: .55, r: 170 }, { lat: -23.5600, lon: -46.6420, w: .45, r: 200 },
  { lat: -23.5640, lon: -46.6520, w: .35, r: 170 }, { lat: -23.5490, lon: -46.6330, w: .7, r: 230 },
  { lat: -23.5700, lon: -46.6610, w: .5, r: 220 }, { lat: -23.5580, lon: -46.6730, w: .4, r: 200 }
];
export const CATS = {
  light:   { label: 'Iluminação ruim', icon: 'bulb', color: '#8F5600', tone: 'warn' },
  harass:  { label: 'Assédio', icon: 'alert', color: '#C92A2A', tone: 'risk' },
  empty:   { label: 'Rua deserta', icon: 'eyeoff', color: '#5C5170', tone: 'alt' },
  block:   { label: 'Calçada bloqueada', icon: 'construction', color: '#8F5600', tone: 'warn' },
  safe:    { label: 'Lugar acolhedor', icon: 'heart', color: '#0F8A62', tone: 'safe' },
  other:   { label: 'Outro', icon: 'msg', color: '#3B1766', tone: 'alt' }
};
const now = Date.now(), H = 3600e3;
export const SEED_REPORTS = [
  { id: 's1', cat: 'light', lat: -23.5572, lon: -46.6640, text: 'Três postes apagados no quarteirão. Passei com medo.', ts: now - 2 * H, seed: true, up: 14 },
  { id: 's2', cat: 'safe', lat: -23.5559, lon: -46.6603, text: 'Farmácia 24h e portaria movimentada. Dá para esperar ali com segurança.', ts: now - 5 * H, seed: true, up: 31 },
  { id: 's3', cat: 'harass', lat: -23.5536, lon: -46.6578, text: 'Grupo de homens mexendo com quem passa na esquina.', ts: now - 26 * H, seed: true, up: 22 },
  { id: 's4', cat: 'block', lat: -23.5600, lon: -46.6580, text: 'Obra ocupando toda a calçada; precisei andar na rua.', ts: now - 30 * H, seed: true, up: 9 },
  { id: 's5', cat: 'empty', lat: -23.5518, lon: -46.6650, text: 'Rua muito vazia depois das 22h.', ts: now - 50 * H, seed: true, up: 11 },
  { id: 's6', cat: 'safe', lat: -23.5613, lon: -46.6559, text: 'Avenida cheia de gente e câmeras. Me senti tranquila.', ts: now - 70 * H, seed: true, up: 18 },
  { id: 's7', cat: 'light', lat: -23.5434, lon: -46.6460, text: 'Praça escura à noite.', ts: now - 90 * H, seed: true, up: 7 }
];
export const LANDMARKS = [ // sugestões locais usadas se a busca online falhar
  { name: 'Avenida Paulista (MASP)', sub: 'Bela Vista, São Paulo', lat: -23.5614, lon: -46.6559 },
  { name: 'Estação Consolação', sub: 'Metrô · São Paulo', lat: -23.5557, lon: -46.6603 },
  { name: 'Praça da República', sub: 'República, São Paulo', lat: -23.5434, lon: -46.6429 },
  { name: 'Estação da Luz', sub: 'Luz, São Paulo', lat: -23.5343, lon: -46.6336 },
  { name: 'Parque Ibirapuera', sub: 'Vila Mariana, São Paulo', lat: -23.5874, lon: -46.6576 },
  { name: 'Largo da Batata', sub: 'Pinheiros, São Paulo', lat: -23.5662, lon: -46.6967 }
];
import * as store from './store.js';
export const REPORT_TTL_DAYS = 30; // relatos perdem peso aos poucos e somem após este prazo, para não estigmatizar um local para sempre
export const freshness = ts => Math.max(0, 1 - (Date.now() - ts) / (REPORT_TTL_DAYS * 864e5));
export const allReports = () => [...store.get().reports.filter(r => freshness(r.ts) > 0), ...SEED_REPORTS];
