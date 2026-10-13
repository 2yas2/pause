import type { AnimeSummary, LatestEntry } from '../../shared/types.js';
import { append, h, icon } from '../dom.js';
import { epLabel, genreFr, isFresh, timeAgo } from '../format.js';
import { fallbackArt, lazyImg } from '../media.js';
import { getProgress, ratio } from '../store.js';

/** Fond d'image (ou dégradé génératif) pour une carte. */
export function art(url: string | null, seed: string, alt: string, cls = 'art'): HTMLElement {
  const box = h('div.' + cls, { style: { background: fallbackArt(seed) } });
  const img = lazyImg(url, alt);
  if (img) box.append(img);
  return box;
}

export function progressBar(value: number, cls = ''): HTMLElement | null {
  if (value <= 0) return null;
  return h('div.progress' + (cls ? '.' + cls : ''), { role: 'progressbar', 'aria-valuenow': Math.round(value * 100), 'aria-valuemin': 0, 'aria-valuemax': 100 },
    h('span', { style: { width: `${Math.max(3, value * 100)}%` } }),
  );
}

/** Jauge d'accumulation « 7 / 28 » : épisodes en ligne vs. prévus. */
export function availability(a: Pick<AnimeSummary, 'available' | 'totalEpisodes'>): HTMLElement {
  const total = a.totalEpisodes;
  const value = total ? Math.min(1, a.available / total) : 1;
  return h('div.availability', null,
    h('div.availability-bar', { '--v': value.toFixed(3), class: total ? '' : 'is-open' }),
    h('span', null, total ? `${a.available} / ${total} ép.` : `${a.available} ép. · en cours`),
  );
}

/** Carte affiche (format 2:3). */
export function posterCard(a: AnimeSummary, index = 0): HTMLElement {
  const fresh = isFresh(a.latestAddedAt);
  const artBox = art(a.poster, a.slug, a.title, 'poster-art');
  append(artBox, [
    h('div.poster-badges', null,
      fresh ? h('span.badge.badge--new', null, icon('sparkle'), 'Nouveau') : null,
      a.available === 0 ? h('span.badge.badge--soon', null, 'Bientôt') : null,
    ),
    a.score ? h('span.poster-score', null, icon('star'), a.score.toFixed(1)) : null,
    h('div.poster-hover', null,
      h('div.poster-genres', null, a.genres.slice(0, 3).map(genreFr).join(' · ')),
      availability(a),
      a.latestEpisode !== null ? h('span.poster-play', null, icon('play')) : null,
    ),
  ]);
  return h('a.poster', { href: `/anime/${a.slug}`, '--i': index, 'aria-label': a.title },
    artBox,
    h('div.poster-meta', null,
      h('h3', null, a.title),
      h('p', null,
        a.latestEpisode !== null ? h('span.mono', null, `ÉP ${epLabel(a.latestEpisode)}`) : h('span.mono', null, 'À VENIR'),
        a.latestAddedAt ? h('span', null, timeAgo(a.latestAddedAt)) : null,
      ),
    ),
  );
}

/** Carte épisode (format 16:9). */
export function episodeCard(entry: LatestEntry, index = 0, opts: { showTime?: boolean } = {}): HTMLElement {
  const ep = entry.episode;
  const p = ratio(getProgress(entry.slug, ep.number));
  const fresh = isFresh(ep.addedAt, 24);
  const artBox = art(entry.banner ?? entry.poster, entry.slug, entry.title, 'epcard-art');
  if (!entry.banner) artBox.classList.add('is-poster');
  append(artBox, [
    h('span.epcard-num', { 'aria-hidden': 'true' }, epLabel(ep.number)),
    fresh ? h('span.badge.badge--new.epcard-badge', null, 'Nouveau') : null,
    h('span.epcard-play', null, icon('play')),
    progressBar(p, 'epcard-progress'),
  ]);
  return h('a.epcard', { href: `/watch/${entry.slug}/${ep.number}`, '--i': index },
    artBox,
    h('div.epcard-meta', null,
      h('span.eyebrow', null, `Épisode ${ep.number}`, opts.showTime === false ? null : h('span.dot-sep'), opts.showTime === false ? null : timeAgo(ep.addedAt)),
      h('h3', null, entry.title),
      ep.title ? h('p', null, ep.title) : null,
    ),
  );
}

/** Squelettes de chargement. */
export const skeletonRow = (n = 6, kind: 'poster' | 'epcard' = 'poster') =>
  h('div.row-track', null, Array.from({ length: n }, () => h(`div.skeleton.skeleton--${kind}`)));
