import { api } from '../api.js';
import { h, icon } from '../dom.js';
import { dateFr, epLabel, genreFr, isFresh, timeAgo } from '../format.js';
import { applyTint, dominantColor, fallbackArt, imgUrl } from '../media.js';
import { createPlayer } from '../player.js';
import { navigate, type RouteContext, type View } from '../router.js';
import { getProgress, isWatched, markWatched, ratio, setProgress } from '../store.js';
import { progressBar } from '../components/cards.js';
import { button, listButton } from '../components/ui.js';
import { notFoundView } from './notfound.js';

export async function watchView(ctx: RouteContext): Promise<View> {
  const a = await api.anime(ctx.params.slug!);
  const number = Number(ctx.params.ep);
  const index = a.episodes.findIndex((e) => e.number === number);
  const ep = a.episodes[index];
  if (!ep) return notFoundView(`L’épisode ${ctx.params.ep} de « ${a.title} » n’est pas (encore) dans la bibliothèque.`, `/anime/${a.slug}`);

  const prev = a.episodes[index - 1] ?? null;
  const next = a.episodes[index + 1] ?? null;
  const saved = getProgress(a.slug, ep.number);
  const startAt = saved && ratio(saved) < 0.95 ? saved.t : 0;
  const epTitle = ep.title ?? `Épisode ${ep.number}`;

  const player = createPlayer({
    src: ep.streamUrl,
    poster: a.banner ?? a.poster,
    seed: a.slug,
    title: a.title,
    subtitle: `Épisode ${ep.number}${ep.title ? ` — ${ep.title}` : ''}`,
    file: ep.file,
    startAt,
    next: next ? { href: `/watch/${a.slug}/${next.number}`, label: `Épisode ${next.number}${next.title ? ` · ${next.title}` : ''}`, art: a.banner ?? a.poster } : null,
    onProgress: (t, d) => setProgress(a.slug, ep.number, t, d),
    onNext: () => next && navigate(`/watch/${a.slug}/${next.number}`, { replace: true }),
  });
  ctx.onLeave(player.destroy);

  /* ----- Liste latérale ----- */
  const side = h('ol.watch-list');
  for (const e of a.episodes) {
    const p = ratio(getProgress(a.slug, e.number));
    const current = e.number === ep.number;
    side.append(
      h('li', null,
        h('a.watch-item' + (current ? '.is-current' : '') + (isWatched(a.slug, e.number) ? '.is-watched' : ''), { href: `/watch/${a.slug}/${e.number}`, 'aria-current': current ? 'true' : undefined },
          h('span.watch-item-num.mono', null, current ? h('span.eq', { 'aria-hidden': 'true' }, h('i'), h('i'), h('i')) : epLabel(e.number)),
          h('span.watch-item-text', null,
            h('strong', null, e.title ?? `Épisode ${e.number}`),
            h('small', null, `Ép. ${e.number} · ajouté ${timeAgo(e.addedAt)}`),
          ),
          isFresh(e.addedAt, 24) ? h('span.badge.badge--new', null, 'Nouveau') : null,
          progressBar(p, 'watch-item-progress'),
        ),
      ),
    );
  }

  const watchedBtn = h('button.btn.btn--glass', { type: 'button' });
  const paintWatched = () => {
    const on = isWatched(a.slug, ep.number);
    watchedBtn.classList.toggle('is-on', on);
    watchedBtn.replaceChildren(icon(on ? 'check' : 'eye'), h('span', null, on ? 'Vu' : 'Marquer comme vu'));
  };
  watchedBtn.addEventListener('click', () => {
    markWatched(a.slug, ep.number, !isWatched(a.slug, ep.number));
    paintWatched();
  });
  paintWatched();

  const page = h('div.page.page--watch', null,
    h('div.watch-ambient', { style: { background: fallbackArt(a.slug) }, 'aria-hidden': 'true' },
      a.banner || a.poster ? h('img', { src: imgUrl(a.banner ?? a.poster), alt: '' }) : null,
    ),
    h('div.watch-layout', null,
      h('div.watch-main', null,
        h('nav.watch-crumbs', { 'aria-label': 'Fil d’Ariane' },
          h('a', { href: `/anime/${a.slug}` }, icon('left'), a.title),
          h('span.mono', null, `ÉP ${epLabel(ep.number)} / ${a.totalEpisodes ?? '?'}`),
        ),
        h('div.watch-stage', null, player.el),
        h('div.watch-info', null,
          h('div.watch-heading', null,
            h('p.kicker', null, `Épisode ${ep.number}`, h('span.dot-sep'), `ajouté ${timeAgo(ep.addedAt)}`, ep.aired ? h('span.dot-sep') : null, ep.aired ? `diffusé le ${dateFr(ep.aired)}` : null),
            h('h1.watch-title', null, epTitle),
            ep.titleJapanese || ep.titleRomanji ? h('p.watch-alt', null, [ep.titleRomanji, ep.titleJapanese].filter(Boolean).join('  ·  ')) : null,
          ),
          h('div.watch-actions', null,
            prev ? button('Précédent', { variant: 'glass', icon: 'prev', href: `/watch/${a.slug}/${prev.number}` }) : null,
            next ? button(`Épisode ${next.number}`, { variant: 'primary', icon: 'next', href: `/watch/${a.slug}/${next.number}` }) : null,
            watchedBtn,
          ),
        ),
        h('section.watch-about', null,
          h('a.watch-about-poster', { href: `/anime/${a.slug}`, style: { background: fallbackArt(a.slug) } }, a.poster ? h('img', { src: imgUrl(a.poster), alt: '' }) : null),
          h('div', null,
            h('h2', null, a.title),
            h('p.watch-about-meta', null, [a.year, a.studios[0], ...a.genres.slice(0, 3).map(genreFr)].filter(Boolean).join(' · ')),
            a.synopsis ? h('p.watch-about-text', null, a.synopsis) : null,
            h('div.watch-about-actions', null, button('Fiche de l’anime', { variant: 'ghost', href: `/anime/${a.slug}`, icon: 'arrow' }), listButton(a.slug)),
          ),
        ),
      ),
      h('aside.watch-side', { 'aria-label': 'Épisodes' },
        h('header.watch-side-head', null,
          h('div', null, h('span.kicker', null, 'Épisodes'), h('strong', null, a.title)),
          h('span.mono', null, `${a.available}${a.totalEpisodes ? ` / ${a.totalEpisodes}` : ''}`),
        ),
        side,
      ),
    ),
  );

  void dominantColor(a.poster).then((rgb) => applyTint(page, rgb));
  requestAnimationFrame(() => {
    const current = side.querySelector<HTMLElement>('.is-current');
    if (current) side.scrollTop = current.offsetTop - side.clientHeight / 2 + current.clientHeight / 2;
    player.el.focus({ preventScroll: true });
  });

  return { el: page, name: 'watch', title: `${a.title} · Épisode ${ep.number}` };
}
