import { promises as fs } from 'node:fs';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import type {
  AnimeDetail,
  AnimeStatus,
  AnimeSummary,
  EpisodeInfo,
  LatestEntry,
  LibraryResponse,
  LiveEvent,
  StatusResponse,
} from '../shared/types.js';
import { config } from './config.js';
import { getAnime, getEpisodes, searchAnime, youtubeIdOf, type JikanAnime, type JikanEpisode } from './jikan.js';
import { slugify } from './parse.js';
import { scanMediaDir, type AnimeOverride, type ScannedAnime } from './scanner.js';
import { resolveStreamUrl } from './stream.js';

/**
 * La bibliothèque est la mémoire du site : elle est enregistrée dans data/library.json.
 *
 * Principe d'accumulation : chaque épisode reçoit une date `addedAt` le jour où son
 * fichier apparaît pour la première fois dans le dossier média. Les épisodes déjà
 * connus gardent leur date. Le site affiche donc la série telle qu'elle se construit
 * à partir d'aujourd'hui, épisode après épisode, et « l'épisode actuel » est le
 * dernier arrivé.
 */

interface StoredEpisode {
  number: number;
  file: string;
  addedAt: string;
}

interface StoredAnime {
  slug: string;
  folder: string;
  addedAt: string;
  override: AnimeOverride;
  malId: number | null;
  meta: JikanAnime | null;
  metaFetchedAt: string | null;
  metaError: string | null;
  episodeMeta: Record<string, JikanEpisode>;
  episodeMetaFetchedAt: string | null;
  episodes: Record<string, StoredEpisode>;
}

interface StoredLibrary {
  version: 1;
  scannedAt: string | null;
  animes: Record<string, StoredAnime>;
}

const LIBRARY_FILE = () => path.join(config.dataDir, 'library.json');
const DAY = 86_400_000;

let library: StoredLibrary = { version: 1, scannedAt: null, animes: {} };
let scanning: Promise<ScanReport> | null = null;
let lastError: string | null = null;

/** Émet les évènements temps réel (scan démarré / terminé, nouveaux épisodes). */
export const events = new EventEmitter<{ live: [LiveEvent] }>();

export interface ScanReport {
  animeCount: number;
  episodeCount: number;
  added: Array<{ slug: string; title: string; episode: number }>;
  durationMs: number;
}

/* ---------- Persistance ---------- */

export async function loadLibrary(): Promise<void> {
  try {
    const raw = await fs.readFile(LIBRARY_FILE(), 'utf8');
    const parsed = JSON.parse(raw) as StoredLibrary;
    if (parsed?.version === 1) library = parsed;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') console.warn('⚠  library.json illisible, on repart de zéro.');
  }
}

async function saveLibrary(): Promise<void> {
  await fs.mkdir(config.dataDir, { recursive: true });
  const tmp = `${LIBRARY_FILE()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(library, null, 2));
  await fs.rename(tmp, LIBRARY_FILE()); // écriture atomique
}

/* ---------- Scan ---------- */

const isStale = (iso: string | null, days: number) => !iso || Date.now() - Date.parse(iso) > days * DAY;

async function refreshMeta(entry: StoredAnime, scanned: ScannedAnime): Promise<void> {
  const forcedId = scanned.override.malId ?? null;
  const idChanged = forcedId !== null && forcedId !== entry.malId;
  const ttl = entry.meta?.status === 'Currently Airing' ? 1 : config.metaTtlDays;
  // Après un échec, on réessaie au bout d'une heure.
  const retryAfterError = entry.metaError && isStale(entry.metaFetchedAt, 1 / 24);

  if (entry.meta && !idChanged && !isStale(entry.metaFetchedAt, ttl) && !retryAfterError) return;
  if (!entry.meta && entry.metaError && !retryAfterError && !idChanged) return;

  try {
    let malId = forcedId ?? entry.malId;
    if (!malId) {
      const found = await searchAnime(scanned.query);
      if (!found) throw new Error(`aucun résultat pour « ${scanned.query} »`);
      malId = found.mal_id;
    }
    entry.meta = await getAnime(malId);
    entry.malId = malId;
    entry.metaError = null;
    entry.episodeMetaFetchedAt = null; // force le rafraîchissement des titres d'épisodes
    console.log(`  ✓ ${scanned.folder} → ${entry.meta.title} (MAL #${malId})`);
  } catch (err) {
    entry.metaError = (err as Error).message;
    console.warn(`  ✗ ${scanned.folder} : ${entry.metaError}`);
  } finally {
    entry.metaFetchedAt = new Date().toISOString();
  }
}

async function refreshEpisodeMeta(entry: StoredAnime): Promise<void> {
  if (!entry.malId || !entry.meta) return;
  const numbers = Object.values(entry.episodes).map((e) => e.number);
  const highest = Math.max(0, ...numbers);
  if (highest === 0) return;
  const missing = numbers.some((n) => Number.isInteger(n) && !entry.episodeMeta[String(n)]);
  if (!missing && !isStale(entry.episodeMetaFetchedAt, config.metaTtlDays)) return;
  if (missing && !isStale(entry.episodeMetaFetchedAt, 0.25)) return; // max une fois toutes les 6 h

  try {
    const list = await getEpisodes(entry.malId, Math.ceil(highest));
    for (const ep of list) entry.episodeMeta[String(ep.mal_id)] = ep;
  } catch (err) {
    console.warn(`  ✗ titres d'épisodes pour ${entry.slug} :`, (err as Error).message);
  } finally {
    entry.episodeMetaFetchedAt = new Date().toISOString();
  }
}

async function doScan(): Promise<ScanReport> {
  const started = Date.now();
  const now = new Date().toISOString();
  events.emit('live', { type: 'scan-start' });
  console.log(`🔎 Scan de ${config.mediaDir}`);

  const scanned = await scanMediaDir(config.mediaDir);
  const next: Record<string, StoredAnime> = {};
  const added: ScanReport['added'] = [];
  const bySlugOfFolder = new Map(Object.values(library.animes).map((a) => [a.folder, a]));

  for (const item of scanned) {
    const previous = bySlugOfFolder.get(item.folder);
    let slug = previous?.slug ?? slugify(item.override.title ?? item.query);
    while (next[slug] && next[slug] !== previous) slug = `${slug}-2`;

    const entry: StoredAnime = previous ?? {
      slug,
      folder: item.folder,
      addedAt: now,
      override: item.override,
      malId: item.override.malId ?? null,
      meta: null,
      metaFetchedAt: null,
      metaError: null,
      episodeMeta: {},
      episodeMetaFetchedAt: null,
      episodes: {},
    };
    entry.override = item.override;

    // Accumulation : les épisodes connus gardent leur date, les nouveaux sont datés de maintenant.
    const episodes: Record<string, StoredEpisode> = {};
    for (const ep of item.episodes) {
      const key = String(ep.number);
      const known = entry.episodes[key];
      episodes[key] = { number: ep.number, file: ep.file, addedAt: known?.addedAt ?? now };
      if (!known && library.scannedAt) added.push({ slug, title: entry.meta?.title ?? item.query, episode: ep.number });
    }
    entry.episodes = episodes;
    next[slug] = entry;

    await refreshMeta(entry, item);
    await refreshEpisodeMeta(entry);
  }

  library = { version: 1, scannedAt: now, animes: next };
  await saveLibrary();

  const report: ScanReport = {
    animeCount: scanned.length,
    episodeCount: scanned.reduce((n, a) => n + a.episodes.length, 0),
    added,
    durationMs: Date.now() - started,
  };
  console.log(
    `✨ ${report.animeCount} anime, ${report.episodeCount} épisodes` +
      (added.length ? `, ${added.length} nouveau(x)` : '') +
      ` — ${(report.durationMs / 1000).toFixed(1)} s`,
  );
  events.emit('live', { type: 'scan-end', added });
  return report;
}

/** Lance un scan (ou renvoie celui déjà en cours). */
export function scan(): Promise<ScanReport> {
  if (!scanning) {
    scanning = doScan()
      .then((r) => {
        lastError = null;
        return r;
      })
      .catch((err: Error) => {
        lastError = err.message;
        console.error('✗ Scan échoué :', err);
        throw err;
      })
      .finally(() => {
        scanning = null;
      });
  }
  return scanning;
}

/* ---------- Vues pour l'API ---------- */

const STATUS: Record<string, AnimeStatus> = {
  'Currently Airing': 'airing',
  'Finished Airing': 'finished',
  'Not yet aired': 'upcoming',
};

const names = (list?: Array<{ name: string }>) => (list ?? []).map((g) => g.name);

const posterOf = (a: StoredAnime) =>
  a.override.poster ?? a.meta?.images.webp?.large_image_url ?? a.meta?.images.jpg?.large_image_url ?? null;

const bannerOf = (a: StoredAnime) =>
  a.override.banner ?? a.meta?.trailer?.images?.maximum_image_url ?? a.meta?.trailer?.images?.large_image_url ?? null;

const titleOf = (a: StoredAnime) => a.override.title ?? a.meta?.title_english ?? a.meta?.title ?? a.override.search ?? a.folder;

function sortedEpisodes(a: StoredAnime): StoredEpisode[] {
  return Object.values(a.episodes).sort((x, y) => x.number - y.number);
}

function toSummary(a: StoredAnime): AnimeSummary {
  const eps = sortedEpisodes(a);
  const latest = eps.reduce<StoredEpisode | null>(
    (best, e) => (!best || e.addedAt > best.addedAt || (e.addedAt === best.addedAt && e.number > best.number) ? e : best),
    null,
  );
  const m = a.meta;
  const title = titleOf(a);
  const alt = new Set(
    [m?.title, m?.title_english, m?.title_japanese, ...(m?.title_synonyms ?? []), a.folder].filter(
      (t): t is string => Boolean(t) && t !== title,
    ),
  );
  return {
    slug: a.slug,
    malId: a.malId,
    title,
    titleEnglish: m?.title_english ?? null,
    titleJapanese: m?.title_japanese ?? null,
    altTitles: [...alt],
    poster: posterOf(a),
    banner: bannerOf(a),
    type: m?.type ?? null,
    status: STATUS[m?.status ?? ''] ?? 'unknown',
    year: m?.year ?? (m?.aired?.from ? new Date(m.aired.from).getFullYear() : null),
    season: m?.season ?? null,
    score: m?.score ?? null,
    genres: names(m?.genres),
    studios: names(m?.studios),
    totalEpisodes: m?.episodes ?? null,
    available: eps.length,
    latestEpisode: eps.at(-1)?.number ?? null,
    latestAddedAt: latest?.addedAt ?? null,
    addedAt: a.addedAt,
  };
}

function toEpisode(a: StoredAnime, e: StoredEpisode): EpisodeInfo {
  const meta = a.episodeMeta[String(e.number)];
  return {
    number: e.number,
    title: meta?.title ?? null,
    titleJapanese: meta?.title_japanese ?? null,
    titleRomanji: meta?.title_romanji ?? null,
    aired: meta?.aired ?? null,
    filler: Boolean(meta?.filler),
    recap: Boolean(meta?.recap),
    addedAt: e.addedAt,
    file: e.file,
    streamUrl: resolveStreamUrl({
      slug: a.slug,
      episode: e.number,
      file: e.file,
      absolutePath: path.join(config.mediaDir, e.file),
    }),
  };
}

export function getLibrary(): LibraryResponse {
  const animes = Object.values(library.animes).map(toSummary);
  animes.sort((x, y) => (y.latestAddedAt ?? y.addedAt).localeCompare(x.latestAddedAt ?? x.addedAt));

  const latest: LatestEntry[] = Object.values(library.animes)
    .flatMap((a) =>
      sortedEpisodes(a).map((e) => ({
        slug: a.slug,
        title: titleOf(a),
        poster: posterOf(a),
        banner: bannerOf(a),
        episode: toEpisode(a, e),
      })),
    )
    .sort((x, y) => y.episode.addedAt.localeCompare(x.episode.addedAt) || y.episode.number - x.episode.number)
    .slice(0, 120);

  const genreCount = new Map<string, number>();
  for (const a of animes) for (const g of a.genres) genreCount.set(g, (genreCount.get(g) ?? 0) + 1);
  const genres = [...genreCount.entries()].sort((a, b) => b[1] - a[1]).map(([g]) => g);

  return { animes, latest, genres, scannedAt: library.scannedAt };
}

export function getAnimeDetail(slug: string): AnimeDetail | null {
  const a = library.animes[slug];
  if (!a) return null;
  const m = a.meta;
  return {
    ...toSummary(a),
    synopsis: a.override.synopsis ?? m?.synopsis?.replace(/\s*\[Written by MAL Rewrite\]\s*$/i, '').trim() ?? null,
    background: m?.background ?? null,
    trailerYoutubeId: m ? youtubeIdOf(m) : null,
    malUrl: m?.url ?? null,
    duration: m?.duration ?? null,
    rating: m?.rating ?? null,
    rank: m?.rank ?? null,
    popularity: m?.popularity ?? null,
    members: m?.members ?? null,
    scoredBy: m?.scored_by ?? null,
    source: m?.source ?? null,
    broadcast: m?.broadcast?.string ?? null,
    themes: names(m?.themes),
    demographics: names(m?.demographics),
    episodes: sortedEpisodes(a).map((e) => toEpisode(a, e)),
  };
}

export function getStatus(): StatusResponse {
  const animes = Object.values(library.animes);
  return {
    scanning: scanning !== null,
    scannedAt: library.scannedAt,
    animeCount: animes.length,
    episodeCount: animes.reduce((n, a) => n + Object.keys(a.episodes).length, 0),
    mediaDir: config.mediaDir,
    lastError,
  };
}
