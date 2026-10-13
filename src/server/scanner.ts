import { promises as fs } from 'node:fs';
import path from 'node:path';
import { EXTENSION_PRIORITY, cleanTitle, isVideoFile, parseEpisodeNumber } from './parse.js';

/**
 * Fichier optionnel `anime.json` à placer dans le dossier d'un anime
 * pour corriger ou compléter ce que l'API trouve automatiquement.
 */
export interface AnimeOverride {
  /** Force l'identifiant MyAnimeList (le plus fiable : https://myanimelist.net/anime/<ID>). */
  malId?: number;
  /** Texte utilisé pour la recherche si le nom du dossier est ambigu. */
  search?: string;
  /** Remplace le titre affiché. */
  title?: string;
  /** Synopsis personnalisé (ex. en français). */
  synopsis?: string;
  /** URL d'images personnalisées. */
  poster?: string;
  banner?: string;
}

export interface ScannedEpisode {
  number: number;
  /** Chemin relatif au dossier média, séparateurs « / ». */
  file: string;
}

export interface ScannedAnime {
  folder: string;
  query: string;
  override: AnimeOverride;
  episodes: ScannedEpisode[];
}

const isHidden = (name: string) => name.startsWith('.') || name.startsWith('@') || name === '#recycle';

async function readOverride(dir: string): Promise<AnimeOverride> {
  try {
    const raw = await fs.readFile(path.join(dir, 'anime.json'), 'utf8');
    const data = JSON.parse(raw) as AnimeOverride;
    return typeof data === 'object' && data !== null ? data : {};
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.warn(`⚠  anime.json illisible dans « ${path.basename(dir)} » :`, (err as Error).message);
    }
    return {};
  }
}

/**
 * Parcourt le dossier d'un anime et collecte ses épisodes.
 * Formats pris en charge :
 *   Frieren/Episode 01.mp4                → fichier vidéo direct
 *   Frieren/Episode 01/index.m3u8         → dossier HLS produit par ffmpeg
 *   Frieren/Saison 1/Frieren - 01.mkv     → un niveau de sous-dossier
 */
async function collectEpisodes(mediaDir: string, dir: string, depth = 0): Promise<ScannedEpisode[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const found: ScannedEpisode[] = [];
  const rel = (p: string) => path.relative(mediaDir, p).split(path.sep).join('/');

  for (const entry of entries) {
    if (isHidden(entry.name)) continue;
    const full = path.join(dir, entry.name);

    if (entry.isFile() && isVideoFile(entry.name)) {
      const number = parseEpisodeNumber(entry.name);
      if (number !== null) found.push({ number, file: rel(full) });
      continue;
    }

    if (entry.isDirectory()) {
      const inner = await fs.readdir(full).catch(() => [] as string[]);
      const playlist = inner.find((f) => f.toLowerCase().endsWith('.m3u8'));
      const number = parseEpisodeNumber(entry.name);
      if (playlist && number !== null) {
        found.push({ number, file: rel(path.join(full, playlist)) });
      } else if (depth < 1) {
        found.push(...(await collectEpisodes(mediaDir, full, depth + 1)));
      }
    }
  }
  return found;
}

/** Garde un seul fichier par numéro d'épisode (HLS > MP4 > …). */
function dedupe(episodes: ScannedEpisode[]): ScannedEpisode[] {
  const best = new Map<number, ScannedEpisode>();
  const rank = (e: ScannedEpisode) => EXTENSION_PRIORITY[path.extname(e.file).toLowerCase()] ?? 99;
  for (const ep of episodes) {
    const current = best.get(ep.number);
    if (!current || rank(ep) < rank(current)) best.set(ep.number, ep);
  }
  return [...best.values()].sort((a, b) => a.number - b.number);
}

/** Scanne le dossier média : un sous-dossier = un anime. */
export async function scanMediaDir(mediaDir: string): Promise<ScannedAnime[]> {
  await fs.mkdir(mediaDir, { recursive: true });
  const entries = await fs.readdir(mediaDir, { withFileTypes: true });
  const result: ScannedAnime[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory() || isHidden(entry.name)) continue;
    const dir = path.join(mediaDir, entry.name);
    try {
      const [override, episodes] = await Promise.all([readOverride(dir), collectEpisodes(mediaDir, dir)]);
      result.push({
        folder: entry.name,
        query: override.search ?? cleanTitle(entry.name),
        override,
        episodes: dedupe(episodes),
      });
    } catch (err) {
      console.warn(`⚠  Impossible de lire « ${entry.name} » :`, (err as Error).message);
    }
  }
  return result.sort((a, b) => a.folder.localeCompare(b.folder, 'fr'));
}
