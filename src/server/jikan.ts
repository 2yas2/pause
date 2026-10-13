import { config } from './config.js';
import { similarity } from './parse.js';

/**
 * Client pour l'API REST Jikan v4 (https://docs.api.jikan.moe/) —
 * miroir public et gratuit de MyAnimeList, sans clé d'API.
 * Les appels sont sérialisés pour respecter la limite de débit.
 */

/* ---------- Formes brutes renvoyées par Jikan (partielles) ---------- */

interface JikanImageSet {
  image_url?: string | null;
  small_image_url?: string | null;
  large_image_url?: string | null;
}
interface JikanNamed {
  name: string;
}
export interface JikanAnime {
  mal_id: number;
  url: string;
  images: { jpg?: JikanImageSet; webp?: JikanImageSet };
  trailer?: {
    youtube_id?: string | null;
    embed_url?: string | null;
    images?: { maximum_image_url?: string | null; large_image_url?: string | null };
  };
  title: string;
  title_english?: string | null;
  title_japanese?: string | null;
  title_synonyms?: string[];
  titles?: Array<{ type: string; title: string }>;
  type?: string | null;
  source?: string | null;
  episodes?: number | null;
  status?: string | null;
  duration?: string | null;
  rating?: string | null;
  score?: number | null;
  scored_by?: number | null;
  rank?: number | null;
  popularity?: number | null;
  members?: number | null;
  synopsis?: string | null;
  background?: string | null;
  season?: string | null;
  year?: number | null;
  aired?: { from?: string | null };
  broadcast?: { string?: string | null };
  studios?: JikanNamed[];
  genres?: JikanNamed[];
  themes?: JikanNamed[];
  demographics?: JikanNamed[];
}
export interface JikanEpisode {
  mal_id: number;
  title?: string | null;
  title_japanese?: string | null;
  title_romanji?: string | null;
  aired?: string | null;
  filler?: boolean;
  recap?: boolean;
}
interface Paginated<T> {
  data: T[];
  pagination?: { has_next_page?: boolean; last_visible_page?: number };
}

/* ---------- File d'attente avec limite de débit ---------- */

let queue: Promise<unknown> = Promise.resolve();
let lastCall = 0;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class JikanError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

async function request<T>(pathAndQuery: string, attempt = 0): Promise<T> {
  const wait = lastCall + config.jikanDelayMs - Date.now();
  if (wait > 0) await sleep(wait);
  lastCall = Date.now();

  const url = `${config.jikanBaseUrl}${pathAndQuery}`;
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { accept: 'application/json', 'user-agent': 'pause-stream/1.0' },
      signal: AbortSignal.timeout(20_000),
    });
  } catch (err) {
    if (attempt < 3) {
      await sleep(1500 * 2 ** attempt);
      return request<T>(pathAndQuery, attempt + 1);
    }
    throw new JikanError(`Réseau indisponible pour ${url} (${(err as Error).message})`);
  }

  // 429 = trop de requêtes, 5xx = MyAnimeList surchargé : on réessaie avec un délai croissant.
  if ((res.status === 429 || res.status >= 500) && attempt < 4) {
    const retryAfter = Number(res.headers.get('retry-after')) * 1000;
    await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : 2000 * 2 ** attempt);
    return request<T>(pathAndQuery, attempt + 1);
  }
  if (!res.ok) throw new JikanError(`Jikan a répondu ${res.status} pour ${pathAndQuery}`, res.status);
  return (await res.json()) as T;
}

/** Toutes les requêtes passent par cette file : une seule à la fois. */
function enqueue<T>(pathAndQuery: string): Promise<T> {
  const run = queue.then(() => request<T>(pathAndQuery));
  queue = run.catch(() => undefined);
  return run;
}

/* ---------- API publique ---------- */

const allTitles = (a: JikanAnime): string[] =>
  [a.title, a.title_english, a.title_japanese, ...(a.title_synonyms ?? []), ...(a.titles ?? []).map((t) => t.title)].filter(
    (t): t is string => Boolean(t),
  );

/** Cherche l'anime le plus proche du titre donné. */
export async function searchAnime(query: string): Promise<JikanAnime | null> {
  const params = new URLSearchParams({ q: query, limit: '10' });
  const { data } = await enqueue<Paginated<JikanAnime>>(`/anime?${params}`);
  if (!data?.length) return null;

  let best: JikanAnime | null = null;
  let bestScore = -1;
  data.forEach((anime, index) => {
    const match = Math.max(...allTitles(anime).map((t) => similarity(query, t)));
    // Léger avantage aux séries TV et à l'ordre de pertinence de MyAnimeList.
    const bonus = (anime.type === 'TV' ? 0.04 : 0) + (10 - index) * 0.004;
    const score = match + bonus;
    if (score > bestScore) {
      bestScore = score;
      best = anime;
    }
  });
  return best;
}

export async function getAnime(malId: number): Promise<JikanAnime> {
  const { data } = await enqueue<{ data: JikanAnime }>(`/anime/${malId}/full`);
  return data;
}

/** Récupère la liste des épisodes (titres, dates) jusqu'à couvrir `upTo`. */
export async function getEpisodes(malId: number, upTo: number): Promise<JikanEpisode[]> {
  const out: JikanEpisode[] = [];
  for (let page = 1; page <= 30; page++) {
    const res = await enqueue<Paginated<JikanEpisode>>(`/anime/${malId}/episodes?page=${page}`);
    out.push(...(res.data ?? []));
    const last = out.at(-1)?.mal_id ?? 0;
    if (!res.pagination?.has_next_page || last >= upTo) break;
  }
  return out;
}

export const youtubeIdOf = (anime: JikanAnime): string | null => {
  if (anime.trailer?.youtube_id) return anime.trailer.youtube_id;
  const m = anime.trailer?.embed_url?.match(/embed\/([\w-]{6,})/);
  return m?.[1] ?? null;
};
