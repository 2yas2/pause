/**
 * Types partagés entre le serveur et le navigateur.
 * Ce sont les formes exactes renvoyées par l'API REST interne (/api/...).
 */

export interface EpisodeInfo {
  /** Numéro de l'épisode (peut être décimal pour les spéciaux : 13.5). */
  number: number;
  /** Titre officiel (via l'API), null si inconnu. */
  title: string | null;
  titleJapanese: string | null;
  titleRomanji: string | null;
  /** Date de première diffusion au Japon (ISO). */
  aired: string | null;
  filler: boolean;
  recap: boolean;
  /** Date à laquelle le fichier a été détecté pour la première fois sur le disque (ISO). */
  addedAt: string;
  /** Chemin du fichier, relatif au dossier média. */
  file: string;
  /** URL de lecture fournie par src/server/stream.ts — null tant que la diffusion n'est pas branchée. */
  streamUrl: string | null;
}

export type AnimeStatus = 'airing' | 'finished' | 'upcoming' | 'unknown';

export interface AnimeSummary {
  slug: string;
  malId: number | null;
  title: string;
  titleEnglish: string | null;
  titleJapanese: string | null;
  /** Tous les titres connus, pour la recherche. */
  altTitles: string[];
  poster: string | null;
  banner: string | null;
  type: string | null;
  status: AnimeStatus;
  year: number | null;
  season: string | null;
  score: number | null;
  genres: string[];
  studios: string[];
  /** Nombre total d'épisodes prévus par la série (null si inconnu / en cours). */
  totalEpisodes: number | null;
  /** Nombre d'épisodes réellement présents dans votre dossier. */
  available: number;
  latestEpisode: number | null;
  latestAddedAt: string | null;
  /** Date d'arrivée de l'anime dans la bibliothèque. */
  addedAt: string;
}

export interface AnimeDetail extends AnimeSummary {
  synopsis: string | null;
  background: string | null;
  trailerYoutubeId: string | null;
  malUrl: string | null;
  duration: string | null;
  rating: string | null;
  rank: number | null;
  popularity: number | null;
  members: number | null;
  scoredBy: number | null;
  source: string | null;
  broadcast: string | null;
  themes: string[];
  demographics: string[];
  episodes: EpisodeInfo[];
}

export interface LatestEntry {
  slug: string;
  title: string;
  poster: string | null;
  banner: string | null;
  episode: EpisodeInfo;
}

export interface LibraryResponse {
  animes: AnimeSummary[];
  latest: LatestEntry[];
  genres: string[];
  scannedAt: string | null;
}

export interface StatusResponse {
  scanning: boolean;
  scannedAt: string | null;
  animeCount: number;
  episodeCount: number;
  mediaDir: string;
  lastError: string | null;
}

/** Évènements poussés en temps réel par le serveur (Server-Sent Events, /api/events). */
export type LiveEvent =
  | { type: 'scan-start' }
  | { type: 'scan-end'; added: Array<{ slug: string; title: string; episode: number }> }
  | { type: 'hello'; scannedAt: string | null };
