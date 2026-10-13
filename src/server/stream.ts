import type { IncomingMessage, ServerResponse } from 'node:http';

/**
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║  🎬  VOTRE PARTIE — Diffusion des épisodes (ffmpeg, HLS, MP4…)        ║
 * ╚══════════════════════════════════════════════════════════════════════╝
 *
 * Tout le reste du site est prêt : le lecteur vidéo attend simplement une URL.
 * Deux points d'entrée sont à compléter ici, rien d'autre à toucher ailleurs.
 *
 * Le lecteur sait déjà lire :
 *   • les fichiers .mp4 / .webm (lecture directe par le navigateur) ;
 *   • les playlists HLS .m3u8 (hls.js est chargé automatiquement si besoin).
 */

export interface StreamContext {
  /** Identifiant de l'anime dans les URL du site, ex. "frieren-beyond-journey-s-end". */
  slug: string;
  /** Numéro de l'épisode. */
  episode: number;
  /** Chemin du fichier relatif au dossier média, ex. "Frieren/Episode 05.mkv". */
  file: string;
  /** Chemin absolu du fichier sur le disque. */
  absolutePath: string;
}

/**
 * ① Renvoie l'URL que le lecteur doit charger pour cet épisode.
 *    Tant que cette fonction renvoie `null`, le site affiche un écran
 *    « Flux en préparation » à la place de la vidéo.
 *
 * Exemples possibles :
 *   return `/stream/${ctx.slug}/${ctx.episode}/index.m3u8`;   // servi par handleStreamRequest
 *   return `https://cdn.mon-domaine.fr/${encodeURI(ctx.file)}`; // CDN / serveur externe
 */
export function resolveStreamUrl(ctx: StreamContext): string | null {
  void ctx;
  // TODO : à compléter
  return null;
}

/**
 * ② Optionnel : servez vous-même les fichiers depuis ce serveur.
 *    Appelé pour toute requête dont l'URL commence par /stream/.
 *    Renvoyez `true` si vous avez répondu, `false` pour laisser une 404.
 */
export async function handleStreamRequest(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  void req;
  void res;
  // TODO : à compléter
  return false;
}
