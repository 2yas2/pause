import type { LatestEntry } from '../../shared/types.js';
import { api } from '../api.js';
import { h } from '../dom.js';
import { dayKey, dayLabel, plural } from '../format.js';
import type { View } from '../router.js';
import { setSeenLatest } from '../store.js';
import { episodeCard } from '../components/cards.js';
import { observeReveal } from '../components/ui.js';
import { emptyLibrary } from './empty.js';

/** « Le fil » : tous les épisodes arrivés, regroupés par jour. */
export async function latestView(): Promise<View> {
  const lib = await api.library();
  if (!lib.animes.length) return { el: await emptyLibrary(), name: 'latest', title: 'Nouveautés' };

  const groups = new Map<string, LatestEntry[]>();
  for (const l of lib.latest) {
    const key = dayKey(l.episode.addedAt);
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(l);
  }

  setSeenLatest(lib.latest[0]?.episode.addedAt ?? null);
  document.querySelectorAll('.nav-dot').forEach((d) => d.setAttribute('hidden', ''));

  const page = h('div.page.page--latest', null,
    h('header.page-head', null,
      h('p.kicker', null, 'Le fil'),
      h('h1.page-title', null, 'Nouveautés', h('em', null, '.')),
      h('p.page-lede', null, 'Chaque épisode déposé dans la bibliothèque apparaît ici, le jour de son arrivée. La collection se construit au fil des jours.'),
    ),
    h('div.feed', null,
      [...groups.values()].map((items) =>
        h('section.feed-day.reveal', null,
          h('div.feed-marker', null,
            h('span.feed-dot'),
            h('h2', null, dayLabel(items[0]!.episode.addedAt)),
            h('span.mono', null, plural(items.length, 'épisode')),
          ),
          h('div.ep-grid', null, items.map((l, i) => episodeCard(l, i))),
        ),
      ),
    ),
  );
  requestAnimationFrame(() => observeReveal(page));
  return { el: page, name: 'latest', title: 'Nouveautés' };
}
