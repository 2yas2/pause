import path from 'node:path';

// Charge un éventuel fichier .env à la racine (Node ≥ 20.12), sans dépendance.
try {
  process.loadEnvFile();
} catch {
  /* pas de .env : on garde les valeurs par défaut */
}

const env = process.env;
const root = process.cwd();

const list = (value: string | undefined, fallback: string): string[] =>
  (value ?? fallback)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

export const config = {
  port: Number(env.PORT ?? 3000),
  host: env.HOST ?? '0.0.0.0',
  /** Dossier contenant un sous-dossier par anime. */
  mediaDir: path.resolve(root, env.MEDIA_DIR ?? 'media'),
  /** Bibliothèque persistée, cache des métadonnées et des images. */
  dataDir: path.resolve(root, env.DATA_DIR ?? 'data'),
  publicDir: path.resolve(root, 'public'),
  /** API REST de métadonnées : Jikan v4 (MyAnimeList), gratuite et sans clé. */
  jikanBaseUrl: (env.JIKAN_BASE_URL ?? 'https://api.jikan.moe/v4').replace(/\/+$/, ''),
  /** Délai minimal entre deux appels à Jikan (limite publique : 3/s et 60/min). */
  jikanDelayMs: Number(env.JIKAN_DELAY_MS ?? 1000),
  /** Re-scan automatique du dossier média, en minutes (0 = désactivé). */
  scanIntervalMin: Number(env.SCAN_INTERVAL ?? 10),
  /** Surveille le dossier média et re-scanne dès qu'un fichier arrive. */
  watchMedia: env.WATCH_MEDIA !== 'false',
  /** Durée de validité des métadonnées avant rafraîchissement, en jours. */
  metaTtlDays: Number(env.META_TTL_DAYS ?? 7),
  /** Domaines d'images autorisés par le proxy /img (protection SSRF). */
  imageHosts: list(env.IMAGE_HOSTS, 'cdn.myanimelist.net,myanimelist.net,img.youtube.com,i.ytimg.com'),
};

export type Config = typeof config;
