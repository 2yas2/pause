import path from 'node:path';

/** Extensions reconnues comme épisodes. `.m3u8` = sortie HLS de ffmpeg. */
export const VIDEO_EXTENSIONS = new Set(['.mp4', '.mkv', '.webm', '.m4v', '.mov', '.avi', '.ts', '.m3u8']);

/** Priorité quand un même épisode existe en plusieurs formats (plus petit = préféré). */
export const EXTENSION_PRIORITY: Record<string, number> = {
  '.m3u8': 0,
  '.mp4': 1,
  '.webm': 2,
  '.m4v': 3,
  '.mkv': 4,
  '.mov': 5,
  '.ts': 6,
  '.avi': 7,
};

export const isVideoFile = (file: string): boolean => VIDEO_EXTENSIONS.has(path.extname(file).toLowerCase());

/** Jetons techniques qui ne doivent jamais être pris pour un numéro d'épisode. */
const NOISE =
  /\b(?:\d{3,4}p|[48]k|x26[45]|h\.?26[45]|hevc|avc|aac(?:2\.0)?|flac|opus|ddp?5\.1|10[- ]?bits?|8[- ]?bits?|bd(?:rip)?|blu-?ray|web(?:-?dl|rip)?|hdtv|dual[- ]?audio|multi|vostfr|vf|vo|sub(?:bed)?|dub(?:bed)?|uncensored|remux)\b/gi;

const stripGroups = (s: string): string => s.replace(/\[[^\]]*\]|\{[^}]*\}|【[^】]*】/g, ' ');

/**
 * Transforme un nom de dossier en titre exploitable pour la recherche.
 *  "[SubsPlease] Sousou no Frieren (2023) [1080p]" → "Sousou no Frieren"
 */
export function cleanTitle(folder: string): string {
  return stripGroups(folder)
    .replace(/\((?:19|20)\d{2}\)/g, ' ')
    .replace(/\([^)]*\)/g, ' ')
    .replace(NOISE, ' ')
    .replace(/_+|(?<!\d)\.|\.(?!\d)/g, ' ')
    .replace(/\s+-\s*$/, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

const NUM = String.raw`(\d{1,4}(?:\.\d)?)`;

const PATTERNS: RegExp[] = [
  // S01E05, s1e5, S01 E05
  new RegExp(String.raw`s\d{1,2}\s*[ex]\s*${NUM}`, 'i'),
  // 1x05
  new RegExp(String.raw`(?<![\d.])\d{1,2}x${NUM}(?!\d)`, 'i'),
  // Episode 5, Épisode 05, Ep.05, EP05, E05
  new RegExp(String.raw`(?<![a-z])(?:[ée]pisode|ep|e)\s*\.?\s*#?\s*${NUM}(?:v\d)?(?!\d)`, 'i'),
  // "Titre - 05", "Titre - 05v2"
  new RegExp(String.raw`(?:^|\s)-\s*${NUM}(?:v\d)?(?=\s|$)`, 'i'),
  // "05 - Titre de l'épisode", "05"
  new RegExp(String.raw`^${NUM}(?:v\d)?(?=\s|$|-)`, 'i'),
];

/**
 * Déduit le numéro d'épisode d'un nom de fichier ou de dossier.
 * Renvoie null si aucun numéro fiable n'est trouvé.
 */
export function parseEpisodeNumber(name: string): number | null {
  const ext = path.extname(name);
  let base = VIDEO_EXTENSIONS.has(ext.toLowerCase()) ? name.slice(0, -ext.length) : name;
  base = stripGroups(base)
    .replace(/\((?:19|20)\d{2}\)/g, ' ')
    .replace(NOISE, ' ')
    .replace(/_+|(?<!\d)\.|\.(?!\d)/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();

  for (const re of PATTERNS) {
    const m = re.exec(base);
    if (m?.[1]) return Number(m[1]);
  }

  // Dernier recours : le dernier nombre isolé qui n'est pas une année.
  const all = [...base.matchAll(/(?<![\d.])(\d{1,4}(?:\.\d)?)(?:v\d)?(?![\d])/g)]
    .map((m) => m[1]!)
    .filter((n) => !/^(?:19|20)\d{2}$/.test(n));
  const last = all.at(-1);
  return last !== undefined ? Number(last) : null;
}

/** "Sousou no Frieren" → "sousou-no-frieren" */
export function slugify(input: string): string {
  return (
    input
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'anime'
  );
}

/** Normalisation agressive pour comparer des titres. */
export const normalizeTitle = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');

/** Similarité de Sørensen–Dice sur les bigrammes, entre 0 et 1. */
export function similarity(a: string, b: string): number {
  const x = normalizeTitle(a);
  const y = normalizeTitle(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  if (x.length < 2 || y.length < 2) return 0;
  const grams = new Map<string, number>();
  for (let i = 0; i < x.length - 1; i++) {
    const g = x.slice(i, i + 2);
    grams.set(g, (grams.get(g) ?? 0) + 1);
  }
  let hits = 0;
  for (let i = 0; i < y.length - 1; i++) {
    const g = y.slice(i, i + 2);
    const n = grams.get(g) ?? 0;
    if (n > 0) {
      grams.set(g, n - 1);
      hits++;
    }
  }
  const dice = (2 * hits) / (x.length - 1 + (y.length - 1));
  // Bonus si l'un contient l'autre (ex. "Frieren" ⊂ "Sousou no Frieren").
  const contains = x.includes(y) || y.includes(x) ? 0.15 : 0;
  return Math.min(1, dice + contains);
}
