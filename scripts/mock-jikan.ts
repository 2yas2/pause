/**
 * Faux serveur Jikan, pour développer sans connexion Internet.
 *   npx tsx scripts/mock-jikan.ts
 *   JIKAN_BASE_URL=http://localhost:4010/v4 IMAGE_HOSTS=localhost:4010 npm run dev
 * Les données sont fictives (résumés rédigés pour la démo, images générées).
 */
import { createServer } from 'node:http';

const PORT = Number(process.env.MOCK_PORT ?? 4010);
const BASE = `http://localhost:${PORT}`;

interface Show {
  id: number;
  title: string;
  en: string;
  jp: string;
  eps: number;
  year: number;
  season: string;
  status: string;
  score: number;
  studio: string;
  genres: string[];
  themes: string[];
  colors: [string, string, string];
  synopsis: string;
}

const SHOWS: Show[] = [
  { id: 52991, title: 'Sousou no Frieren', en: "Frieren: Beyond Journey's End", jp: '葬送のフリーレン', eps: 28, year: 2023, season: 'fall', status: 'Finished Airing', score: 9.3, studio: 'Madhouse', genres: ['Adventure', 'Drama', 'Fantasy'], themes: ['Mythology'], colors: ['#1d3b4f', '#7fb3a6', '#e8dcc0'], synopsis: 'Long after the hero party defeated the Demon King, the elf mage Frieren outlives her companions. Realizing how little she knew them, she sets out on a new journey to understand people and the fleeting time she shared with them.' },
  { id: 40748, title: 'Jujutsu Kaisen', en: 'Jujutsu Kaisen', jp: '呪術廻戦', eps: 24, year: 2020, season: 'fall', status: 'Finished Airing', score: 8.6, studio: 'MAPPA', genres: ['Action', 'Award Winning', 'Supernatural'], themes: ['School'], colors: ['#14111f', '#5b3fa8', '#e2445c'], synopsis: 'A high schooler with absurd physical strength swallows a cursed relic to save his friends and becomes host to a powerful curse. He joins a secret school of sorcerers who fight the curses born from human fear.' },
  { id: 50265, title: 'Spy x Family', en: 'Spy x Family', jp: 'SPY×FAMILY', eps: 12, year: 2022, season: 'spring', status: 'Finished Airing', score: 8.5, studio: 'Wit Studio, CloverWorks', genres: ['Action', 'Award Winning', 'Comedy'], themes: ['Childcare'], colors: ['#24331f', '#d8a24a', '#f3e6c4'], synopsis: 'A master spy must build a fake family to complete his mission. He adopts a girl who secretly reads minds and marries a woman who is secretly an assassin — and none of them know the truth about the others.' },
  { id: 44511, title: 'Chainsaw Man', en: 'Chainsaw Man', jp: 'チェンソーマン', eps: 12, year: 2022, season: 'fall', status: 'Finished Airing', score: 8.5, studio: 'MAPPA', genres: ['Action', 'Fantasy'], themes: ['Gore'], colors: ['#1a0f0c', '#c2410c', '#fbbf24'], synopsis: 'Crushed by debt, a young devil hunter merges with his chainsaw-devil dog and is reborn as a hybrid. Recruited by a government agency, he chases a simple dream while the world around him gets stranger and bloodier.' },
  { id: 42310, title: 'Cyberpunk: Edgerunners', en: 'Cyberpunk: Edgerunners', jp: 'サイバーパンク エッジランナーズ', eps: 10, year: 2022, season: 'summer', status: 'Finished Airing', score: 8.6, studio: 'Trigger', genres: ['Action', 'Sci-Fi'], themes: ['Gore'], colors: ['#0b1020', '#14f1d9', '#f72585'], synopsis: 'In a megacity obsessed with body modification, a street kid with nothing left to lose installs military-grade implants and joins a crew of outlaw mercenaries on the edge.' },
  { id: 52299, title: 'Ore dake Level Up na Ken', en: 'Solo Leveling', jp: '俺だけレベルアップな件', eps: 12, year: 2024, season: 'winter', status: 'Currently Airing', score: 8.3, studio: 'A-1 Pictures', genres: ['Action', 'Adventure', 'Fantasy'], themes: [], colors: ['#070b1a', '#2f5cff', '#a5c8ff'], synopsis: 'The weakest hunter alive survives a deadly dungeon and wakes up with a mysterious system that lets him level up — alone. Step by step, he climbs toward a power no one else can reach.' },
  { id: 57334, title: 'Dandadan', en: 'Dan Da Dan', jp: 'ダンダダン', eps: 12, year: 2024, season: 'fall', status: 'Currently Airing', score: 8.6, studio: 'Science SARU', genres: ['Action', 'Comedy', 'Sci-Fi', 'Supernatural'], themes: ['Romance'], colors: ['#1a0b24', '#ff4fa3', '#7cf5c8'], synopsis: 'A girl who believes in ghosts and a boy who believes in aliens make a bet to prove each other wrong. Both turn out to be right, and their chaotic adventure begins.' },
  { id: 32182, title: 'Mob Psycho 100', en: 'Mob Psycho 100', jp: 'モブサイコ100', eps: 12, year: 2016, season: 'summer', status: 'Finished Airing', score: 8.5, studio: 'Bones', genres: ['Action', 'Comedy', 'Supernatural'], themes: ['Super Power'], colors: ['#15151c', '#8b5cf6', '#f9fafb'], synopsis: 'A shy middle schooler with overwhelming psychic powers just wants to live a normal life. Working part-time for a self-proclaimed psychic con man, he learns that emotion is the most dangerous force of all.' },
];

const poster = (s: Show) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 450 640" width="450" height="640">
<defs><linearGradient id="g" x1="0" y1="0" x2=".6" y2="1"><stop offset="0" stop-color="${s.colors[1]}"/><stop offset="1" stop-color="${s.colors[0]}"/></linearGradient>
<radialGradient id="r" cx=".7" cy=".3" r=".6"><stop offset="0" stop-color="${s.colors[2]}" stop-opacity=".85"/><stop offset="1" stop-color="${s.colors[2]}" stop-opacity="0"/></radialGradient></defs>
<rect width="450" height="640" fill="url(#g)"/><circle cx="310" cy="210" r="260" fill="url(#r)"/>
<circle cx="120" cy="470" r="140" fill="none" stroke="${s.colors[2]}" stroke-opacity=".35" stroke-width="2"/>
<text x="36" y="560" font-family="Georgia,serif" font-size="44" fill="#fff" font-style="italic">${s.en.replace(/&/g, '&amp;').replace(/'/g, '&#39;').slice(0, 18)}</text>
<text x="36" y="600" font-family="monospace" font-size="18" fill="#fff" fill-opacity=".7">${s.jp}</text></svg>`;

const banner = (s: Show) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720" width="1280" height="720">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${s.colors[0]}"/><stop offset=".55" stop-color="${s.colors[1]}"/><stop offset="1" stop-color="${s.colors[0]}"/></linearGradient>
<radialGradient id="r" cx=".72" cy=".38" r=".5"><stop offset="0" stop-color="${s.colors[2]}" stop-opacity=".9"/><stop offset="1" stop-color="${s.colors[2]}" stop-opacity="0"/></radialGradient></defs>
<rect width="1280" height="720" fill="url(#g)"/><circle cx="920" cy="280" r="420" fill="url(#r)"/>
${Array.from({ length: 14 }, (_, i) => `<circle cx="920" cy="280" r="${60 + i * 34}" fill="none" stroke="#fff" stroke-opacity="${0.12 - i * 0.007}"/>`).join('')}
<text x="1210" y="660" text-anchor="end" font-family="monospace" font-size="30" fill="#fff" fill-opacity=".5">${s.jp}</text></svg>`;

const toJikan = (s: Show) => ({
  mal_id: s.id,
  url: `https://myanimelist.net/anime/${s.id}`,
  images: { jpg: { large_image_url: `${BASE}/img/poster/${s.id}.svg` }, webp: { large_image_url: `${BASE}/img/poster/${s.id}.svg` } },
  trailer: { youtube_id: null, embed_url: null, images: { maximum_image_url: `${BASE}/img/banner/${s.id}.svg` } },
  title: s.title,
  title_english: s.en,
  title_japanese: s.jp,
  title_synonyms: [],
  type: 'TV',
  source: 'Manga',
  episodes: s.status === 'Currently Airing' ? null : s.eps,
  status: s.status,
  duration: '24 min per ep',
  rating: 'R - 17+ (violence & profanity)',
  score: s.score,
  scored_by: 812345,
  rank: Math.round((10 - s.score) * 120),
  popularity: Math.round((10 - s.score) * 300),
  members: 1_534_000,
  synopsis: `${s.synopsis}\n\n[Written by MAL Rewrite]`,
  background: null,
  season: s.season,
  year: s.year,
  aired: { from: `${s.year}-01-01T00:00:00+00:00` },
  broadcast: { string: 'Fridays at 23:00 (JST)' },
  studios: s.studio.split(', ').map((name) => ({ name })),
  genres: s.genres.map((name) => ({ name })),
  themes: s.themes.map((name) => ({ name })),
  demographics: [{ name: 'Shounen' }],
});

const EP_TITLES = ['The Journey’s End', 'A New Beginning', 'The Rain of Stars', 'Shadows at Dawn', 'The Promise', 'Echoes', 'The Long Road', 'A Quiet Town', 'Embers', 'The Test', 'Winter Light', 'Return'];

createServer((req, res) => {
  const url = new URL(req.url ?? '/', BASE);
  const send = (status: number, body: unknown, type = 'application/json') => {
    res.writeHead(status, { 'content-type': type });
    res.end(typeof body === 'string' ? body : JSON.stringify(body));
  };
  let m: RegExpExecArray | null;
  if ((m = /^\/img\/(poster|banner)\/(\d+)\.svg$/.exec(url.pathname))) {
    const show = SHOWS.find((s) => s.id === Number(m![2]));
    return show ? send(200, m[1] === 'poster' ? poster(show) : banner(show), 'image/svg+xml') : send(404, {});
  }
  if (url.pathname === '/v4/anime') {
    const q = (url.searchParams.get('q') ?? '').toLowerCase();
    return send(200, { data: SHOWS.filter((s) => `${s.title} ${s.en}`.toLowerCase().includes(q.split(' ')[0]!)).map(toJikan) });
  }
  if ((m = /^\/v4\/anime\/(\d+)\/full$/.exec(url.pathname))) {
    const show = SHOWS.find((s) => s.id === Number(m![1]));
    return show ? send(200, { data: toJikan(show) }) : send(404, { error: 'not found' });
  }
  if ((m = /^\/v4\/anime\/(\d+)\/episodes$/.exec(url.pathname))) {
    const show = SHOWS.find((s) => s.id === Number(m![1]));
    if (!show) return send(404, {});
    const data = Array.from({ length: show.eps }, (_, i) => ({
      mal_id: i + 1,
      title: EP_TITLES[i % EP_TITLES.length],
      title_japanese: null,
      title_romanji: null,
      aired: new Date(Date.UTC(show.year, 0, 1 + i * 7)).toISOString(),
      filler: false,
      recap: i === 6,
    }));
    return send(200, { data, pagination: { has_next_page: false } });
  }
  send(404, { error: 'not found' });
}).listen(PORT, () => console.log(`Mock Jikan sur ${BASE}/v4`));
