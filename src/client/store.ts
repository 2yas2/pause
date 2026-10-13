/**
 * Données propres à ce navigateur : progression de lecture, « Ma liste », réglages.
 * Stockées dans localStorage (toujours protégé par try/catch : navigation privée…).
 */

export interface Progress {
  /** Position en secondes. */
  t: number;
  /** Durée totale en secondes. */
  d: number;
  /** Horodatage de la dernière lecture. */
  at: number;
}

interface Settings {
  volume: number;
  muted: boolean;
  speed: number;
  autoplay: boolean;
}

interface State {
  progress: Record<string, Record<string, Progress>>;
  myList: string[];
  settings: Settings;
  seenLatest: string | null;
}

const KEY = 'pause:v1';
const DEFAULT: State = {
  progress: {},
  myList: [],
  settings: { volume: 1, muted: false, speed: 1, autoplay: true },
  seenLatest: null,
};

let state: State = load();

function load(): State {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredClone(DEFAULT);
    const parsed = JSON.parse(raw) as Partial<State>;
    return { ...structuredClone(DEFAULT), ...parsed, settings: { ...DEFAULT.settings, ...parsed.settings } };
  } catch {
    return structuredClone(DEFAULT);
  }
}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* stockage indisponible : on garde l'état en mémoire */
  }
  listeners.forEach((fn) => fn());
}

const listeners = new Set<() => void>();
export const onStoreChange = (fn: () => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

/* ---------- Progression ---------- */

export const WATCHED_RATIO = 0.9;

export function getProgress(slug: string, ep: number): Progress | null {
  return state.progress[slug]?.[String(ep)] ?? null;
}

export function setProgress(slug: string, ep: number, t: number, d: number) {
  if (!Number.isFinite(d) || d <= 0) return;
  (state.progress[slug] ??= {})[String(ep)] = { t: Math.round(t), d: Math.round(d), at: Date.now() };
  save();
}

export function markWatched(slug: string, ep: number, watched: boolean) {
  if (watched) {
    const d = getProgress(slug, ep)?.d || 1440;
    (state.progress[slug] ??= {})[String(ep)] = { t: d, d, at: Date.now() };
  } else {
    delete state.progress[slug]?.[String(ep)];
  }
  save();
}

export const ratio = (p: Progress | null) => (p && p.d > 0 ? Math.min(1, p.t / p.d) : 0);
export const isWatched = (slug: string, ep: number) => ratio(getProgress(slug, ep)) >= WATCHED_RATIO;

/** Dernière activité de lecture par anime (pour « Continuer à regarder »). */
export function recentActivity(): Array<{ slug: string; ep: number; progress: Progress }> {
  const out: Array<{ slug: string; ep: number; progress: Progress }> = [];
  for (const [slug, eps] of Object.entries(state.progress)) {
    let best: { ep: number; progress: Progress } | null = null;
    for (const [ep, p] of Object.entries(eps)) if (!best || p.at > best.progress.at) best = { ep: Number(ep), progress: p };
    if (best) out.push({ slug, ...best });
  }
  return out.sort((a, b) => b.progress.at - a.progress.at);
}

/* ---------- Ma liste ---------- */

export const inMyList = (slug: string) => state.myList.includes(slug);
export function toggleMyList(slug: string): boolean {
  const has = inMyList(slug);
  state.myList = has ? state.myList.filter((s) => s !== slug) : [slug, ...state.myList];
  save();
  return !has;
}
export const myList = () => [...state.myList];

/* ---------- Réglages ---------- */

export const settings = () => state.settings;
export function updateSettings(patch: Partial<Settings>) {
  state.settings = { ...state.settings, ...patch };
  save();
}

/* ---------- Nouveautés vues ---------- */

export const seenLatest = () => state.seenLatest;
export function setSeenLatest(iso: string | null) {
  state.seenLatest = iso;
  save();
}
