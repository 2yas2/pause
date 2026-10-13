import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { ServerResponse } from 'node:http';
import { config } from './config.js';

/**
 * Proxy d'images avec cache disque : GET /img?u=<url>
 *  – les affiches sont téléchargées une seule fois puis servies localement ;
 *  – même origine que le site, ce qui permet d'extraire leur couleur dominante
 *    côté navigateur (canvas) pour teinter l'interface.
 * Seuls les domaines listés dans IMAGE_HOSTS sont acceptés.
 */

const MAX_BYTES = 10 * 1024 * 1024;
const inflight = new Map<string, Promise<{ file: string; type: string } | null>>();

const EXT: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/avif': '.avif',
  'image/svg+xml': '.svg',
};
const TYPE_OF_EXT = Object.fromEntries(Object.entries(EXT).map(([t, e]) => [e, t]));

function isAllowed(raw: string): URL | null {
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    const host = url.hostname.toLowerCase();
    const ok = config.imageHosts.some((h) => host === h || host.endsWith(`.${h}`) || `${host}:${url.port}` === h);
    return ok ? url : null;
  } catch {
    return null;
  }
}

async function fetchToCache(url: URL, base: string): Promise<{ file: string; type: string } | null> {
  const res = await fetch(url, { signal: AbortSignal.timeout(20_000), redirect: 'error' });
  const type = (res.headers.get('content-type') ?? '').split(';')[0]!.trim();
  if (!res.ok || !EXT[type]) return null;
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.byteLength > MAX_BYTES) return null;
  const file = `${base}${EXT[type]}`;
  await fs.writeFile(file, buf);
  return { file, type };
}

export async function serveImage(raw: string | null, res: ServerResponse): Promise<void> {
  const url = raw ? isAllowed(raw) : null;
  if (!url) {
    res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' }).end('Image refusée');
    return;
  }

  const dir = path.join(config.dataDir, 'images');
  await fs.mkdir(dir, { recursive: true });
  const base = path.join(dir, createHash('sha1').update(url.href).digest('hex'));

  let hit: { file: string; type: string } | null = null;
  for (const ext of Object.values(EXT)) {
    try {
      await fs.access(base + ext);
      hit = { file: base + ext, type: TYPE_OF_EXT[ext]! };
      break;
    } catch {
      /* pas en cache dans ce format */
    }
  }

  if (!hit) {
    let job = inflight.get(base);
    if (!job) {
      job = fetchToCache(url, base).catch(() => null);
      inflight.set(base, job);
      job.finally(() => inflight.delete(base));
    }
    hit = await job;
  }

  if (!hit) {
    // L'image n'a pas pu être récupérée : on redirige vers l'original en dernier recours.
    res.writeHead(302, { location: url.href, 'cache-control': 'no-store' }).end();
    return;
  }

  const data = await fs.readFile(hit.file);
  res
    .writeHead(200, {
      'content-type': hit.type,
      'content-length': data.byteLength,
      'cache-control': 'public, max-age=2592000, immutable',
    })
    .end(data);
}
