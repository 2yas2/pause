import type { LiveEvent } from '../shared/types.js';
import { api } from './api.js';
import { fallback, render, route, startRouter } from './router.js';
import { seenLatest } from './store.js';
import { imgUrl } from './media.js';
import { bindSearchShortcuts } from './components/search.js';
import { toast } from './components/ui.js';
import { homeView } from './views/home.js';
import { animeView } from './views/anime.js';
import { watchView } from './views/watch.js';
import { latestView } from './views/latest.js';
import { libraryView } from './views/library.js';
import { notFoundView } from './views/notfound.js';

/* ---------- Routes ---------- */

route('/', homeView);
route('/anime/:slug', animeView);
route('/watch/:slug/:ep', watchView);
route('/nouveautes', latestView);
route('/bibliotheque', libraryView);
fallback(() => notFoundView());

/* ---------- En-tête : transparent en haut, verre dépoli au défilement ---------- */

const topbar = document.getElementById('topbar');
const onScroll = () => topbar?.classList.toggle('is-scrolled', window.scrollY > 24);
window.addEventListener('scroll', onScroll, { passive: true });
onScroll();

/* ---------- Pastille « nouveautés » ---------- */

async function refreshNewDot() {
  const lib = await api.library().catch(() => null);
  const newest = lib?.latest[0]?.episode.addedAt ?? null;
  const seen = seenLatest();
  const show = !!newest && (!seen || newest > seen) && document.body.dataset.route !== 'latest';
  document.querySelectorAll('.nav-dot').forEach((d) => d.toggleAttribute('hidden', !show));
}

/* ---------- Temps réel : nouveaux épisodes ---------- */

function connectLive() {
  if (!('EventSource' in window)) return;
  const pill = document.getElementById('live-pill');
  const source = new EventSource('/api/events');
  source.addEventListener('open', () => pill?.classList.add('is-on'));
  source.addEventListener('error', () => pill?.classList.remove('is-on'));
  source.addEventListener('message', async (msg) => {
    const event = JSON.parse(msg.data as string) as LiveEvent;
    if (event.type === 'scan-start') pill?.classList.add('is-syncing');
    if (event.type !== 'scan-end') return;
    pill?.classList.remove('is-syncing');
    if (!event.added.length) return;

    api.invalidate();
    const lib = await api.library(true).catch(() => null);
    const groups = new Map<string, number[]>();
    for (const a of event.added) (groups.get(a.slug) ?? groups.set(a.slug, []).get(a.slug)!).push(a.episode);

    for (const [slug, eps] of [...groups].slice(0, 3)) {
      const anime = lib?.animes.find((x) => x.slug === slug);
      const last = Math.max(...eps);
      toast({
        title: anime?.title ?? slug,
        body: eps.length > 1 ? `${eps.length} nouveaux épisodes · jusqu’à l’ép. ${last}` : `Nouvel épisode · ép. ${last}`,
        href: `/watch/${slug}/${last}`,
        action: 'Regarder',
        art: imgUrl(anime?.poster),
        timeout: 9000,
      });
    }
    void refreshNewDot();
    // Les pages « liste » se mettent à jour d'elles-mêmes ; on ne coupe jamais une lecture.
    if (['home', 'latest', 'library', 'mylist'].includes(document.body.dataset.route ?? '')) void render();
  });
}

/* ---------- Démarrage ---------- */

bindSearchShortcuts();
startRouter();
connectLive();
void refreshNewDot();
