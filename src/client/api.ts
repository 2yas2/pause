import type { AnimeDetail, LibraryResponse, StatusResponse } from '../shared/types.js';

/** Accès à l'API REST du serveur, avec un petit cache mémoire. */

const TTL = 60_000;
const cache = new Map<string, { at: number; data: Promise<unknown> }>();

async function get<T>(url: string, fresh = false): Promise<T> {
  const hit = cache.get(url);
  if (!fresh && hit && Date.now() - hit.at < TTL) return hit.data as Promise<T>;
  const data = fetch(url, { headers: { accept: 'application/json' } }).then(async (res) => {
    if (res.status === 404) throw new NotFoundError();
    if (!res.ok) throw new Error(`Erreur ${res.status}`);
    return (await res.json()) as T;
  });
  cache.set(url, { at: Date.now(), data });
  data.catch(() => cache.delete(url));
  return data;
}

export class NotFoundError extends Error {
  constructor() {
    super('Introuvable');
  }
}

export const api = {
  library: (fresh = false) => get<LibraryResponse>('/api/library', fresh),
  anime: (slug: string, fresh = false) => get<AnimeDetail>(`/api/anime/${encodeURIComponent(slug)}`, fresh),
  status: () => get<StatusResponse>('/api/status', true),
  scan: () => fetch('/api/scan', { method: 'POST' }).then((r) => r.json()),
  invalidate: () => cache.clear(),
};
