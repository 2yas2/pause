import type { AnimeDetail, AnimeSummary, EpisodeInfo, LatestEntry, LibraryResponse } from '../../shared/types.js';
import { api } from '../api.js';
import { h, icon } from '../dom.js';
import { durationFr, epLabel, genreFr, isFresh, plural, seasonFr, statusFr, timeAgo } from '../format.js';
import { applyTint, dominantColor, fallbackArt, imgUrl } from '../media.js';
import type { RouteContext, View } from '../router.js';
import { getProgress, isWatched, myList, recentActivity } from '../store.js';
import { episodeCard, posterCard } from '../components/cards.js';
import { button, listButton, observeReveal, row, sectionHead } from '../components/ui.js';
import { emptyLibrary } from './empty.js';

/** Épisode à proposer pour un anime : reprise en cours, sinon le suivant non vu, sinon le dernier. */
export function nextUp(a: { slug: string; latestEpisode: number | null }, episodes?: EpisodeInfo[]): { ep: number; resume: boolean } | null {
  if (a.latestEpisode === null) return null;
  const numbers = episodes?.map((e) => e.number) ?? [];
  const activity = recentActivity().find((x) => x.slug === a.slug);
  if (activity) {
    if (!isWatched(a.slug, activity.ep)) return { ep: activity.ep, resume: true };
    const after = numbers.find((n) => n > activity.ep);
    if (after !== undefined) return { ep: after, resume: false };
  }
  return { ep: a.latestEpisode, resume: false };
}

function entryFor(lib: LibraryResponse, a: AnimeSummary, ep: number): LatestEntry {
  const found = lib.latest.find((l) => l.slug === a.slug && l.episode.number === ep);
  if (found) return found;
  const episode: EpisodeInfo = {
    number: ep, title: null, titleJapanese: null, titleRomanji: null, aired: null,
    filler: false, recap: false, addedAt: a.latestAddedAt ?? a.addedAt, file: '', streamUrl: null,
  };
  return { slug: a.slug, title: a.title, poster: a.poster, banner: a.banner, episode };
}

/* ---------- Carrousel principal ---------- */

function hero(featured: AnimeDetail[], ctx: RouteContext): HTMLElement {
  const slides = featured.map((a, i) =>
    h('div.hero-slide' + (i === 0 ? '.is-active' : ''), { style: { background: fallbackArt(a.slug) } },
      a.banner || a.poster ? h('img', { src: imgUrl(a.banner ?? a.poster), alt: '', class: a.banner ? '' : 'is-poster', fetchpriority: i === 0 ? 'high' : 'low' }) : null,
    ),
  );
  const content = h('div.hero-content');
  const thumbs = h('div.hero-thumbs', { role: 'tablist', 'aria-label': 'À la une' });
  const section = h('section.hero', { 'aria-roledescription': 'carrousel' },
    h('div.hero-slides', null, slides),
    h('div.hero-shade'),
    content,
    featured.length > 1 ? thumbs : null,
  );

  let current = 0;
  let timer: number | undefined;
  const DURATION = 9000;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const fill = (a: AnimeDetail) => {
    const up = nextUp(a, a.episodes);
    const fresh = isFresh(a.latestAddedAt);
    const meta = [
      a.score ? h('span.hero-score', null, icon('star'), a.score.toFixed(1)) : null,
      a.year ? h('span', null, [seasonFr(a.season), a.year].filter(Boolean).join(' ')) : null,
      a.type ? h('span', null, a.type) : null,
      durationFr(a.duration) ? h('span', null, durationFr(a.duration)) : null,
      a.studios[0] ? h('span', null, a.studios[0]) : null,
      statusFr(a.status) ? h('span.hero-status.is-' + a.status, null, statusFr(a.status)) : null,
    ].filter(Boolean);

    const progress = up?.resume ? getProgress(a.slug, up.ep) : null;
    const block = h('div.hero-inner', { key: a.slug },
      h('p.hero-eyebrow', null,
        h('span.live-dot' + (fresh ? '' : '.is-idle')),
        a.latestEpisode !== null
          ? `${fresh ? 'Nouvel épisode' : 'Dernier épisode'} · ÉP ${epLabel(a.latestEpisode)} · ${timeAgo(a.latestAddedAt)}`
          : 'Bientôt dans la bibliothèque',
      ),
      h('h1.hero-title', null, a.title),
      a.titleJapanese ? h('p.hero-jp', null, a.titleJapanese) : null,
      h('div.hero-meta', null, meta),
      a.synopsis ? h('p.hero-synopsis', null, a.synopsis) : null,
      h('div.hero-actions', null,
        up
          ? button(up.resume ? `Reprendre l’ép. ${up.ep}` : `Regarder l’ép. ${up.ep}`, { icon: 'play', href: `/watch/${a.slug}/${up.ep}` })
          : null,
        button('Détails', { variant: 'glass', href: `/anime/${a.slug}` }),
        listButton(a.slug),
      ),
      progress ? h('div.hero-resume', null, h('span', { style: { width: `${(progress.t / progress.d) * 100}%` } })) : null,
    );
    return block;
  };

  const show = (i: number) => {
    current = (i + featured.length) % featured.length;
    const a = featured[current]!;
    slides.forEach((s, j) => s.classList.toggle('is-active', j === current));
    content.replaceChildren(fill(a));
    thumbs.querySelectorAll('button').forEach((b, j) => {
      b.classList.toggle('is-active', j === current);
      b.setAttribute('aria-selected', String(j === current));
    });
    void dominantColor(a.poster).then((rgb) => applyTint(section, rgb));
    schedule();
  };

  const schedule = () => {
    clearTimeout(timer);
    if (reduced || featured.length < 2 || section.matches(':hover, :focus-within')) return;
    timer = window.setTimeout(() => show(current + 1), DURATION);
  };

  featured.forEach((a, i) => {
    thumbs.append(
      h('button.hero-thumb', { type: 'button', role: 'tab', 'aria-label': a.title, onclick: () => show(i), '--d': `${DURATION}ms` },
        h('span.hero-thumb-art', { style: { background: fallbackArt(a.slug) } }, a.poster ? h('img', { src: imgUrl(a.poster), alt: '' }) : null),
        h('span.hero-thumb-text', null, h('strong', null, a.title), h('small', null, a.latestEpisode !== null ? `ÉP ${epLabel(a.latestEpisode)}` : 'Bientôt')),
        h('span.hero-thumb-timer'),
      ),
    );
  });

  section.addEventListener('mouseenter', () => {
    clearTimeout(timer);
    section.classList.add('is-paused');
  });
  section.addEventListener('mouseleave', () => {
    section.classList.remove('is-paused');
    schedule();
  });
  ctx.onLeave(() => clearTimeout(timer));
  show(0);
  return section;
}

/* ---------- Bandeau « la semaine » ---------- */

function pulse(lib: LibraryResponse): HTMLElement {
  const DAYS = 14;
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() - (DAYS - 1) * 86400_000;
  const perDay = Array.from({ length: DAYS }, () => 0);
  for (const l of lib.latest) {
    const t = Date.parse(l.episode.addedAt);
    if (t >= start) perDay[Math.min(DAYS - 1, Math.floor((t - start) / 86400_000))]!++;
  }
  const week = perDay.slice(-7).reduce((a, b) => a + b, 0);
  const max = Math.max(1, ...perDay);
  const total = lib.animes.reduce((n, a) => n + a.available, 0);
  const airing = lib.animes.filter((a) => a.status === 'airing').length;
  const dayName = (i: number) =>
    new Intl.DateTimeFormat('fr-FR', { weekday: 'narrow' }).format(new Date(start + i * 86400_000));

  const stat = (value: number, label: string) => h('div.pulse-stat', null, h('strong', null, String(value)), h('span', null, label));

  return h('section.pulse.reveal', null,
    h('div.pulse-intro', null,
      h('span.kicker', null, 'Le pouls de pause.'),
      h('p', null, 'La bibliothèque grandit ', h('em', null, 'épisode après épisode'), '. Voici ce qui est arrivé récemment.'),
    ),
    h('div.pulse-stats', null,
      stat(week, week > 1 ? 'épisodes cette semaine' : 'épisode cette semaine'),
      stat(airing, 'séries en cours'),
      stat(total, 'épisodes en ligne'),
    ),
    h('figure.pulse-chart', { 'aria-label': `Épisodes ajoutés par jour sur ${DAYS} jours` },
      h('div.pulse-bars', null,
        perDay.map((n, i) =>
          h('div.pulse-bar' + (i === DAYS - 1 ? '.is-today' : ''), { title: `${n} épisode(s)`, '--v': (n / max).toFixed(3) },
            h('span.pulse-bar-fill'),
            h('span.pulse-bar-label', null, dayName(i)),
          ),
        ),
      ),
      h('figcaption', null, `${DAYS} derniers jours`),
    ),
  );
}

/* ---------- Page ---------- */

export async function homeView(ctx: RouteContext): Promise<View> {
  const lib = await api.library();
  if (!lib.animes.length) return { el: await emptyLibrary(), name: 'home', title: 'Accueil' };

  const featuredSummaries = lib.animes.filter((a) => a.available > 0).slice(0, 5);
  const featured = await Promise.all(
    (featuredSummaries.length ? featuredSummaries : lib.animes.slice(0, 1)).map((a) => api.anime(a.slug)),
  );
  const bySlug = new Map(lib.animes.map((a) => [a.slug, a]));

  const page = h('div.page.page--home');
  page.append(hero(featured, ctx));
  const body = h('div.home-body');
  page.append(body);

  // Continuer à regarder
  const continueItems = recentActivity()
    .map(({ slug, ep }) => {
      const a = bySlug.get(slug);
      if (!a) return null;
      let target = ep;
      if (isWatched(slug, ep)) {
        const next = lib.latest
          .filter((l) => l.slug === slug && l.episode.number > ep)
          .sort((x, y) => x.episode.number - y.episode.number)[0];
        if (!next) return null;
        target = next.episode.number;
      }
      return episodeCard(entryFor(lib, a, target), 0, { showTime: false });
    })
    .filter((x): x is HTMLElement => x !== null)
    .slice(0, 12);
  if (continueItems.length) body.append(row({ title: 'Continuer à regarder', kicker: 'Reprendre', items: continueItems, kind: 'epcard' }));

  // Nouveaux épisodes
  const latest = lib.latest.slice(0, 16).map((l, i) => episodeCard(l, i));
  if (latest.length) {
    body.append(row({ title: 'Nouveaux épisodes', kicker: 'Fraîchement arrivés', link: { href: '/nouveautes', label: 'Le fil complet' }, items: latest, kind: 'epcard' }));
  }

  body.append(pulse(lib));

  // Ma liste
  const mine = myList().map((s) => bySlug.get(s)).filter((a): a is AnimeSummary => !!a);
  if (mine.length) {
    body.append(row({ title: 'Ma liste', kicker: plural(mine.length, 'série'), link: { href: '/bibliotheque?vue=liste', label: 'Tout voir' }, items: mine.map(posterCard), kind: 'poster' }));
  }

  // Rangées par genre
  for (const genre of lib.genres.slice(0, 3)) {
    const items = lib.animes.filter((a) => a.genres.includes(genre));
    if (items.length < 2) continue;
    body.append(row({ title: genreFr(genre), kicker: 'Genre', link: { href: `/bibliotheque?genre=${encodeURIComponent(genre)}`, label: 'Explorer' }, items: items.map(posterCard), kind: 'poster' }));
  }

  // Bibliothèque
  body.append(
    h('section.reveal', null,
      sectionHead('Toute la bibliothèque', plural(lib.animes.length, 'série'), { href: '/bibliotheque', label: 'Parcourir' }),
      h('div.poster-grid', null, lib.animes.slice(0, 12).map(posterCard)),
    ),
  );

  requestAnimationFrame(() => observeReveal(page));
  return { el: page, name: 'home', title: 'Accueil' };
}
