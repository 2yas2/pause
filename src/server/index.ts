import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createReadStream, promises as fs, watch } from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { events, getAnimeDetail, getLibrary, getStatus, loadLibrary, scan } from './library.js';
import { serveImage } from './images.js';
import { handleStreamRequest } from './stream.js';
import type { LiveEvent } from '../shared/types.js';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

const json = (res: ServerResponse, status: number, body: unknown) => {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(data),
  });
  res.end(data);
};

/* ---------- Temps réel (Server-Sent Events) ---------- */

const clients = new Set<ServerResponse>();

function openEventStream(req: IncomingMessage, res: ServerResponse) {
  res.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-store',
    connection: 'keep-alive',
    'x-accel-buffering': 'no',
  });
  const hello: LiveEvent = { type: 'hello', scannedAt: getStatus().scannedAt };
  res.write(`retry: 5000\ndata: ${JSON.stringify(hello)}\n\n`);
  clients.add(res);
  req.on('close', () => clients.delete(res));
}

events.on('live', (event) => {
  const frame = `data: ${JSON.stringify(event)}\n\n`;
  for (const res of clients) res.write(frame);
});
setInterval(() => {
  for (const res of clients) res.write(': ping\n\n');
}, 25_000).unref();

/* ---------- Fichiers statiques ---------- */

async function serveStatic(pathname: string, req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const decoded = decodeURIComponent(pathname);
  const file = path.normalize(path.join(config.publicDir, decoded));
  if (!file.startsWith(config.publicDir + path.sep)) return false; // pas de « ../ »

  try {
    const stat = await fs.stat(file);
    if (!stat.isFile()) return false;
    const ext = path.extname(file).toLowerCase();
    const headers = {
      'content-type': MIME[ext] ?? 'application/octet-stream',
      'cache-control': ext === '.html' ? 'no-cache' : 'public, max-age=300',
      'last-modified': stat.mtime.toUTCString(),
      'accept-ranges': 'bytes',
    };

    // Requêtes partielles (Range) : indispensables pour se déplacer dans une vidéo.
    const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? '');
    if (range && (range[1] || range[2])) {
      const start = range[1] ? Number(range[1]) : Math.max(0, stat.size - Number(range[2]));
      const end = range[1] && range[2] ? Math.min(Number(range[2]), stat.size - 1) : stat.size - 1;
      if (start > end || start >= stat.size) {
        res.writeHead(416, { 'content-range': `bytes */${stat.size}` }).end();
        return true;
      }
      res.writeHead(206, { ...headers, 'content-length': end - start + 1, 'content-range': `bytes ${start}-${end}/${stat.size}` });
      createReadStream(file, { start, end }).pipe(res);
      return true;
    }

    res.writeHead(200, { ...headers, 'content-length': stat.size });
    createReadStream(file).pipe(res);
    return true;
  } catch {
    return false;
  }
}

async function serveApp(res: ServerResponse) {
  const html = await fs.readFile(path.join(config.publicDir, 'index.html'));
  res.writeHead(200, { 'content-type': MIME['.html']!, 'cache-control': 'no-cache' }).end(html);
}

/* ---------- Routeur ---------- */

async function handle(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const { pathname } = url;
  const method = req.method ?? 'GET';

  if (pathname.startsWith('/api/')) {
    if (method === 'GET' && pathname === '/api/library') return json(res, 200, getLibrary());
    if (method === 'GET' && pathname === '/api/status') return json(res, 200, getStatus());
    if (method === 'GET' && pathname === '/api/events') return openEventStream(req, res);
    if (method === 'POST' && pathname === '/api/scan') {
      const report = await scan();
      return json(res, 200, report);
    }
    const anime = /^\/api\/anime\/([a-z0-9-]+)$/.exec(pathname);
    if (method === 'GET' && anime) {
      const detail = getAnimeDetail(anime[1]!);
      return detail ? json(res, 200, detail) : json(res, 404, { error: 'Anime introuvable' });
    }
    return json(res, 404, { error: 'Route inconnue' });
  }

  if (pathname === '/img') return serveImage(url.searchParams.get('u'), res);

  if (pathname.startsWith('/stream/')) {
    if (await handleStreamRequest(req, res)) return;
    return json(res, 404, { error: 'Diffusion non configurée (voir src/server/stream.ts)' });
  }

  if (method !== 'GET' && method !== 'HEAD') return json(res, 405, { error: 'Méthode non autorisée' });
  if (await serveStatic(pathname, req, res)) return;
  // Fichier manquant avec extension → vraie 404 ; sinon c'est une page de l'application.
  if (path.extname(pathname)) return json(res, 404, { error: 'Fichier introuvable' });
  return serveApp(res);
}

/* ---------- Démarrage ---------- */

await loadLibrary();

const server = createServer((req, res) => {
  handle(req, res).catch((err: Error) => {
    console.error(err);
    if (!res.headersSent) json(res, 500, { error: 'Erreur interne' });
    else res.end();
  });
});

server.listen(config.port, config.host, () => {
  console.log(`\n  ▶ pause.  http://localhost:${config.port}\n  📁 Médias : ${config.mediaDir}\n`);
});

scan().catch(() => undefined);

if (config.scanIntervalMin > 0) {
  setInterval(() => scan().catch(() => undefined), config.scanIntervalMin * 60_000).unref();
}

// Un fichier arrive dans le dossier média → re-scan quelques secondes plus tard.
if (config.watchMedia) {
  try {
    await fs.mkdir(config.mediaDir, { recursive: true });
    let timer: NodeJS.Timeout | undefined;
    watch(config.mediaDir, { recursive: true }, () => {
      clearTimeout(timer);
      timer = setTimeout(() => scan().catch(() => undefined), 4000);
    });
  } catch (err) {
    console.warn('⚠  Surveillance du dossier média indisponible :', (err as Error).message);
  }
}
