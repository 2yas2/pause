import type { AnimeStatus } from '../shared/types.js';

/** Traductions et formats en français. */

const GENRES: Record<string, string> = {
  Action: 'Action',
  Adventure: 'Aventure',
  'Avant Garde': 'Avant-garde',
  'Award Winning': 'Primé',
  'Boys Love': 'Boys Love',
  Comedy: 'Comédie',
  Drama: 'Drame',
  Ecchi: 'Ecchi',
  Fantasy: 'Fantasy',
  'Girls Love': 'Girls Love',
  Gourmet: 'Gastronomie',
  Horror: 'Horreur',
  Mystery: 'Mystère',
  Romance: 'Romance',
  'Sci-Fi': 'Science-fiction',
  'Slice of Life': 'Tranche de vie',
  Sports: 'Sport',
  Supernatural: 'Surnaturel',
  Suspense: 'Suspense',
  Shounen: 'Shōnen',
  Shoujo: 'Shōjo',
  Seinen: 'Seinen',
  Josei: 'Josei',
  School: 'École',
  Mythology: 'Mythologie',
  Gore: 'Gore',
  Music: 'Musique',
  Mecha: 'Mecha',
  Historical: 'Historique',
  Isekai: 'Isekai',
  Psychological: 'Psychologique',
  'Super Power': 'Super-pouvoirs',
  'Martial Arts': 'Arts martiaux',
  Military: 'Militaire',
  Space: 'Espace',
  Childcare: 'Famille',
};
export const genreFr = (g: string) => GENRES[g] ?? g;

const SEASONS: Record<string, string> = { winter: 'Hiver', spring: 'Printemps', summer: 'Été', fall: 'Automne' };
export const seasonFr = (s: string | null) => (s ? (SEASONS[s] ?? s) : null);

const STATUS: Record<AnimeStatus, string> = { airing: 'En cours', finished: 'Terminé', upcoming: 'À venir', unknown: '' };
export const statusFr = (s: AnimeStatus) => STATUS[s];

export function ratingFr(r: string | null): string | null {
  if (!r) return null;
  if (r.startsWith('G')) return 'Tous publics';
  if (r.startsWith('PG-13')) return '13+';
  if (r.startsWith('PG')) return 'Enfants';
  if (r.startsWith('Rx')) return '18+';
  if (r.startsWith('R')) return '17+';
  return r.split(' - ')[0] ?? r;
}

export const durationFr = (d: string | null) =>
  d ? d.replace(/ per ep\.?/, '').replace(/hr\.?/, 'h').replace(/min\.?/, 'min').replace(/sec\.?/, 's') : null;

const rtf = new Intl.RelativeTimeFormat('fr', { numeric: 'auto' });

/** « il y a 3 h », « hier », « il y a 2 semaines » */
export function timeAgo(iso: string | null): string {
  if (!iso) return '';
  const diff = (Date.parse(iso) - Date.now()) / 1000;
  const abs = Math.abs(diff);
  if (abs < 60) return 'à l’instant';
  if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), 'hour');
  if (abs < 86400 * 7) return rtf.format(Math.round(diff / 86400), 'day');
  if (abs < 86400 * 30) return rtf.format(Math.round(diff / (86400 * 7)), 'week');
  if (abs < 86400 * 365) return rtf.format(Math.round(diff / (86400 * 30)), 'month');
  return rtf.format(Math.round(diff / (86400 * 365)), 'year');
}

export const isFresh = (iso: string | null, hours = 48) => !!iso && Date.now() - Date.parse(iso) < hours * 3600_000;

export const dateFr = (iso: string | null, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long', year: 'numeric' }) =>
  iso ? new Intl.DateTimeFormat('fr-FR', opts).format(new Date(iso)) : '';

/** Libellé de groupe pour la timeline : « Aujourd'hui », « Hier », « lundi 12 octobre » */
export function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOf(today) - startOf(d)) / 86400_000);
  if (days === 0) return 'Aujourd’hui';
  if (days === 1) return 'Hier';
  const opts: Intl.DateTimeFormatOptions =
    days < 7 ? { weekday: 'long' } : { weekday: 'long', day: 'numeric', month: 'long', ...(d.getFullYear() !== today.getFullYear() ? { year: 'numeric' } : {}) };
  const label = new Intl.DateTimeFormat('fr-FR', opts).format(d);
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export const dayKey = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
};

/** 754 → « 12:34 », 3720 → « 1:02:00 » */
export function clock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
  const s = Math.floor(seconds % 60);
  const m = Math.floor((seconds / 60) % 60);
  const hh = Math.floor(seconds / 3600);
  const pad = (n: number) => String(n).padStart(2, '0');
  return hh ? `${hh}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

export const epLabel = (n: number) => (Number.isInteger(n) ? String(n).padStart(2, '0') : String(n));

export const compact = (n: number | null) =>
  n === null ? '—' : new Intl.NumberFormat('fr-FR', { notation: 'compact', maximumFractionDigits: 1 }).format(n);

export const plural = (n: number, one: string, many = one + 's') => `${n} ${n > 1 ? many : one}`;
