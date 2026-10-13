import type { AnimeDetail, EpisodeInfo } from '../../shared/types.js';
import { api } from '../api.js';
import { h, icon } from '../dom.js';
import { clock, compact, dateFr, durationFr, epLabel, genreFr, isFresh, plural, ratingFr, seasonFr, statusFr, timeAgo } from '../format.js';
import { applyTint, dominantColor, fallbackArt, imgUrl } from '../media.js';
import type { RouteContext, View } from '../router.js';
import { getProgress, isWatched, markWatched, onStoreChange, ratio } from '../store.js';
import { progressBar } from '../components/cards.js';
import { button, listButton, modal, observeReveal } from '../components/ui.js';
import { nextUp } from './home.js';

/* ---------- Frise d'accumulation ---------- */

/** Une case par épisode prévu : vu, en ligne, ou pas encore arrivé. */
function timeline(a: AnimeDetail): HTMLElement {
  const total = Math.max(a.totalEpisodes ?? 0, a.latestEpisode ?? 0, a.available);
  const available = new Set(a.episodes.map((e) => e.number));
  const cells: HTMLElement[] = [];
  const unknownTail = a.totalEpisodes === null;
  for (let n = 1; total <= 160 && n <= Math.max(1, Math.ceil(total)); n++) {
    const has = available.has(n);
    const seen = has && isWatched(a.slug, n);
    const cls = seen ? 'is-seen' : has ? 'is-on' : 'is-off';
    const cell = has
      ? h('a.tl-cell.' + cls, { href: `/watch/${a.slug}/${n}`, title: `Épisode ${n}${seen ? ' · vu' : ''}`, '--i': n })
      : h('span.tl-cell.' + cls, { title: `Épisode ${n} · pas encore en ligne`, '--i': n });
    cells.push(cell);
  }
  if (unknownTail) for (let i = 0; i < 3; i++) cells.push(h('span.tl-cell.is-ghost'));

  const seenCount = a.episodes.filter((e) => isWatched(a.slug, e.number)).length;
  return h('section.tl.reveal', null,
    h('div.tl-head', null,
      h('div', null,
        h('span.kicker', null, 'Diffusion sur pause.'),
        h('p.tl-figure', null,
          h('strong', null, String(a.available)),
          h('span', null, a.totalEpisodes ? ` / ${a.totalEpisodes} épisodes en ligne` : ` ${a.available > 1 ? 'épisodes en ligne' : 'épisode en ligne'} · série en cours`),
        ),
      ),
      h('ul.tl-legend', null,
        h('li', null, h('i.is-seen'), `Vus (${seenCount})`),
        h('li', null, h('i.is-on'), 'Disponibles'),
        h('li', null, h('i.is-off'), 'À venir'),
      ),
    ),
    total > 160
      ? h('div.tl-track', { '--v': (a.available / Math.max(1, total)).toFixed(4) }, h('span'))
      : h('div.tl-cells', { '--n': String(Math.min(cells.length, 26)) }, cells),
    a.latestAddedAt ? h('p.tl-foot', null, icon('clock'), `Dernier ajout ${timeAgo(a.latestAddedAt)} — l’épisode ${a.latestEpisode} est l’épisode actuel.`) : null,
  );
}

/* ---------- Liste des épisodes ---------- */

function episodeRow(a: AnimeDetail, e: EpisodeInfo, current: boolean): HTMLElement {
  const p = getProgress(a.slug, e.number);
  const watched = isWatched(a.slug, e.number);
  const fresh = isFresh(e.addedAt, 48);
  const toggle = h('button.ep-check' + (watched ? '.is-on' : ''), {
    type: 'button',
    'aria-label': watched ? 'Marquer comme non vu' : 'Marquer comme vu',
    title: watched ? 'Marquer comme non vu' : 'Marquer comme vu',
    onclick: (ev: MouseEvent) => {
      ev.preventDefault();
      ev.stopPropagation();
      markWatched(a.slug, e.number, !isWatched(a.slug, e.number));
    },
  }, icon('check'));

  return h('a.ep' + (current ? '.is-current' : '') + (watched ? '.is-watched' : ''), { href: `/watch/${a.slug}/${e.number}` },
    h('span.ep-num.mono', null, epLabel(e.number)),
    h('span.ep-thumb', { style: { background: fallbackArt(a.slug + e.number) } },
      a.banner || a.poster ? h('img', { src: imgUrl(a.banner ?? a.poster), alt: '', loading: 'lazy', class: a.banner ? '' : 'is-poster' }) : null,
      h('span.ep-play', null, icon('play')),
      progressBar(ratio(p), 'ep-progress'),
    ),
    h('span.ep-body', null,
      h('span.ep-tags', null,
        current ? h('span.badge.badge--accent', null, 'Épisode actuel') : null,
        fresh ? h('span.badge.badge--new', null, 'Nouveau') : null,
        e.filler ? h('span.badge', null, 'Hors-série') : null,
        e.recap ? h('span.badge', null, 'Récap') : null,
      ),
      h('strong.ep-title', null, e.title ?? `Épisode ${e.number}`),
      h('span.ep-sub', null,
        e.titleRomanji && e.titleRomanji !== e.title ? h('span', null, e.titleRomanji) : null,
        e.aired ? h('span', null, `Diffusé le ${dateFr(e.aired)}`) : null,
        h('span', null, `Ajouté ${timeAgo(e.addedAt)}`),
        p && !watched ? h('span.ep-resume', null, `Reprendre à ${clock(p.t)}`) : null,
      ),
    ),
    toggle,
  );
}

function episodeList(a: AnimeDetail, ctx: RouteContext): HTMLElement {
  let desc = true;
  let hideSeen = false;
  let chunk = 0;
  const CHUNK = 50;
  const list = h('div.ep-list');
  const chunks = h('div.ep-chunks');

  const draw = () => {
    let eps = [...a.episodes];
    if (hideSeen) eps = eps.filter((e) => !isWatched(a.slug, e.number));
    if (desc) eps.reverse();
    const pages = Math.ceil(eps.length / CHUNK);
    chunk = Math.min(chunk, Math.max(0, pages - 1));
    chunks.replaceChildren(
      ...(pages > 1
        ? Array.from({ length: pages }, (_, i) => {
            const slice = eps.slice(i * CHUNK, (i + 1) * CHUNK);
            const label = `${slice[0]!.number}–${slice.at(-1)!.number}`;
            return h('button.chip' + (i === chunk ? '.is-active' : ''), { type: 'button', onclick: () => ((chunk = i), draw()) }, label);
          })
        : []),
    );
    const visible = eps.slice(chunk * CHUNK, (chunk + 1) * CHUNK);
    list.replaceChildren(
      ...(visible.length
        ? visible.map((e) => episodeRow(a, e, e.number === a.latestEpisode))
        : [h('p.ep-empty', null, a.episodes.length ? 'Tous les épisodes sont vus. Bravo !' : 'Aucun épisode pour le moment — ils apparaîtront ici dès leur arrivée.')]),
    );
  };

  const sortBtn = h('button.tool', { type: 'button', onclick: () => {
    desc = !desc;
    sortBtn.querySelector('span:last-child')!.textContent = desc ? 'Plus récents' : 'Plus anciens';
    draw();
  } }, icon('sort'), h('span', null, 'Plus récents'));
  const seenBtn = h('button.tool', { type: 'button', 'aria-pressed': 'false', onclick: () => {
    hideSeen = !hideSeen;
    seenBtn.setAttribute('aria-pressed', String(hideSeen));
    seenBtn.classList.toggle('is-active', hideSeen);
    draw();
  } }, icon('eye'), h('span', null, 'Masquer les vus'));

  ctx.onLeave(onStoreChange(draw) as unknown as () => void);
  draw();

  return h('section.episodes.reveal', { id: 'episodes' },
    h('header.episodes-head', null,
      h('div', null, h('span.kicker', null, plural(a.available, 'épisode')), h('h2', null, 'Épisodes')),
      h('div.episodes-tools', null, sortBtn, seenBtn),
    ),
    chunks,
    list,
  );
}

/* ---------- Bande-annonce ---------- */

function openTrailer(id: string, title: string) {
  modal(
    h('div.trailer', null,
      h('iframe', {
        src: `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?autoplay=1&rel=0&modestbranding=1`,
        title: `Bande-annonce — ${title}`,
        allow: 'autoplay; encrypted-media; picture-in-picture; fullscreen',
        allowfullscreen: true,
      }),
    ),
    { label: `Bande-annonce de ${title}`, wide: true },
  );
}

/* ---------- Page ---------- */

export async function animeView(ctx: RouteContext): Promise<View> {
  const a = await api.anime(ctx.params.slug!);
  const up = nextUp(a, a.episodes);
  const resume = up?.resume ? getProgress(a.slug, up.ep) : null;

  const facts: Array<[string, string | null]> = [
    ['Format', a.type],
    ['Saison', [seasonFr(a.season), a.year].filter(Boolean).join(' ') || null],
    ['Statut', statusFr(a.status) || null],
    ['Studio', a.studios.join(', ') || null],
    ['Source', a.source],
    ['Durée', durationFr(a.duration)],
    ['Public', ratingFr(a.rating)],
    ['Diffusion', a.broadcast],
  ];

  const synopsis = h('p.detail-synopsis', null, a.synopsis ?? 'Aucun synopsis disponible pour le moment.');
  const more = h('button.link-btn', { type: 'button', hidden: true, onclick: () => {
    const open = synopsis.classList.toggle('is-open');
    more.textContent = open ? 'Réduire' : 'Lire la suite';
  } }, 'Lire la suite');
  requestAnimationFrame(() => {
    if (synopsis.scrollHeight > synopsis.clientHeight + 4) more.hidden = false;
  });

  const page = h('div.page.page--detail', null,
    h('div.detail-backdrop', { style: { background: fallbackArt(a.slug) }, 'aria-hidden': 'true' },
      a.banner || a.poster ? h('img', { src: imgUrl(a.banner ?? a.poster), alt: '', class: a.banner ? '' : 'is-poster' }) : null,
    ),
    h('div.detail-wrap', null,
      h('div.detail-hero', null,
        h('figure.detail-poster', { style: { background: fallbackArt(a.slug) } },
          a.poster ? h('img', { src: imgUrl(a.poster), alt: `Affiche de ${a.title}` }) : h('span.detail-initial', null, a.title.charAt(0)),
        ),
        h('div.detail-main', null,
          h('p.kicker', null, [a.type, a.year, a.genres.slice(0, 1).map(genreFr)[0]].filter(Boolean).join(' · ')),
          h('h1.detail-title', null, a.title),
          h('p.detail-alt', null, [a.titleJapanese, a.titleEnglish !== a.title ? a.titleEnglish : null].filter(Boolean).join('  ·  ')),
          h('div.detail-scores', null,
            a.score ? h('div.score-block', null, h('span.score-value', null, icon('star'), a.score.toFixed(2)), h('small', null, a.scoredBy ? `${compact(a.scoredBy)} votes` : 'Note MAL')) : null,
            a.rank ? h('div.score-block', null, h('span.score-value', null, `#${a.rank}`), h('small', null, 'Classement')) : null,
            a.popularity ? h('div.score-block', null, h('span.score-value', null, `#${a.popularity}`), h('small', null, 'Popularité')) : null,
            a.members ? h('div.score-block', null, h('span.score-value', null, compact(a.members)), h('small', null, 'Membres')) : null,
          ),
          h('div.detail-actions', null,
            up
              ? button(resume ? `Reprendre l’ép. ${up.ep} · ${clock(resume.t)}` : `Regarder l’ép. ${up.ep}`, { icon: 'play', href: `/watch/${a.slug}/${up.ep}` })
              : button('Bientôt disponible', { icon: 'clock', attrs: { disabled: true } }),
            listButton(a.slug),
            a.trailerYoutubeId ? button('Bande-annonce', { variant: 'glass', icon: 'film', onclick: () => openTrailer(a.trailerYoutubeId!, a.title) }) : null,
          ),
          h('div.detail-genres', null,
            [...a.genres, ...a.themes, ...a.demographics].map((g) => h('a.chip', { href: `/bibliotheque?genre=${encodeURIComponent(g)}` }, genreFr(g))),
          ),
        ),
      ),

      h('div.detail-grid', null,
        h('div.detail-story.reveal', null,
          h('span.kicker', null, 'Synopsis'),
          synopsis,
          more,
          a.malUrl ? h('a.detail-source', { href: a.malUrl, target: '_blank', rel: 'noopener' }, 'Fiche MyAnimeList', icon('external')) : null,
        ),
        h('dl.detail-facts.reveal', null,
          facts.filter(([, v]) => v).map(([k, v]) => h('div', null, h('dt', null, k), h('dd', null, v))),
        ),
      ),

      timeline(a),
      episodeList(a, ctx),
    ),
  );

  void dominantColor(a.poster).then((rgb) => applyTint(page, rgb));
  requestAnimationFrame(() => observeReveal(page));
  return { el: page, name: 'anime', title: a.title };
}
