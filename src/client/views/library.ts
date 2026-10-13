import type { AnimeSummary } from '../../shared/types.js';
import { api } from '../api.js';
import { debounce, h, icon } from '../dom.js';
import { genreFr, plural } from '../format.js';
import { setQuery, type RouteContext, type View } from '../router.js';
import { inMyList, recentActivity } from '../store.js';
import { posterCard } from '../components/cards.js';
import { chip } from '../components/ui.js';
import { matchScore } from '../components/search.js';
import { emptyLibrary } from './empty.js';

type Sort = 'recent' | 'title' | 'score' | 'year' | 'added';
type Tab = 'tout' | 'liste' | 'encours' | 'termine';

const SORTS: Array<[Sort, string]> = [
  ['recent', 'Mis à jour'],
  ['added', 'Ajout'],
  ['title', 'Titre A→Z'],
  ['score', 'Note'],
  ['year', 'Année'],
];
const TABS: Array<[Tab, string]> = [
  ['tout', 'Tout'],
  ['liste', 'Ma liste'],
  ['encours', 'En cours de visionnage'],
  ['termine', 'Séries complètes'],
];

export async function libraryView(ctx: RouteContext): Promise<View> {
  const lib = await api.library();
  if (!lib.animes.length) return { el: await emptyLibrary(), name: 'library', title: 'Bibliothèque' };

  const q = ctx.query;
  let text = q.get('q') ?? '';
  let genre = q.get('genre');
  let sort = (q.get('tri') as Sort) || 'recent';
  let tab = (q.get('vue') as Tab) || 'tout';

  const grid = h('div.poster-grid.poster-grid--lg');
  const count = h('span.mono.lib-count');
  const genres = h('div.chips');
  const tabs = h('div.tabs', { role: 'tablist' });

  const sortSelect = h<HTMLSelectElement>('select.select', { 'aria-label': 'Trier par' }, SORTS.map(([v, l]) => h('option', { value: v, selected: v === sort }, l)));
  sortSelect.addEventListener('change', () => {
    sort = sortSelect.value as Sort;
    draw();
  });

  const input = h<HTMLInputElement>('input.lib-search', { type: 'search', placeholder: 'Filtrer par titre…', value: text, 'aria-label': 'Filtrer par titre' });
  input.addEventListener('input', debounce(() => {
    text = input.value;
    draw();
  }, 120));

  const watching = new Set(recentActivity().map((x) => x.slug));

  function filtered(): AnimeSummary[] {
    let list = lib.animes.filter((a) => {
      if (genre && !a.genres.includes(genre)) return false;
      if (tab === 'liste' && !inMyList(a.slug)) return false;
      if (tab === 'encours' && !watching.has(a.slug)) return false;
      if (tab === 'termine' && !(a.totalEpisodes && a.available >= a.totalEpisodes)) return false;
      return true;
    });
    if (text.trim()) {
      list = list.map((a) => ({ a, s: matchScore(text, a) })).filter((x) => x.s > 0).sort((x, y) => y.s - x.s).map((x) => x.a);
      return list;
    }
    const by: Record<Sort, (x: AnimeSummary, y: AnimeSummary) => number> = {
      recent: (x, y) => (y.latestAddedAt ?? y.addedAt).localeCompare(x.latestAddedAt ?? x.addedAt),
      added: (x, y) => y.addedAt.localeCompare(x.addedAt),
      title: (x, y) => x.title.localeCompare(y.title, 'fr'),
      score: (x, y) => (y.score ?? 0) - (x.score ?? 0),
      year: (x, y) => (y.year ?? 0) - (x.year ?? 0),
    };
    return list.sort(by[sort]);
  }

  function draw() {
    const params = new URLSearchParams();
    if (text) params.set('q', text);
    if (genre) params.set('genre', genre);
    if (sort !== 'recent') params.set('tri', sort);
    if (tab !== 'tout') params.set('vue', tab);
    setQuery(params);
    document.querySelectorAll<HTMLElement>('[data-nav]').forEach((a) => {
      const active = a.dataset.nav === (tab === 'liste' ? 'mylist' : 'library');
      a.classList.toggle('is-active', active);
    });

    tabs.replaceChildren(
      ...TABS.map(([v, l]) =>
        h('button.tab' + (v === tab ? '.is-active' : ''), { type: 'button', role: 'tab', 'aria-selected': String(v === tab), onclick: () => ((tab = v), draw()) }, l),
      ),
    );
    genres.replaceChildren(
      chip('Tous les genres', !genre, () => ((genre = null), draw())),
      ...lib.genres.map((g) => chip(genreFr(g), genre === g, () => ((genre = genre === g ? null : g), draw()))),
    );

    const list = filtered();
    count.textContent = plural(list.length, 'série');
    grid.replaceChildren(
      ...(list.length
        ? list.map((a, i) => posterCard(a, i))
        : [
            h('div.lib-empty', null,
              icon(tab === 'liste' ? 'bookmark' : 'search'),
              h('strong', null, tab === 'liste' ? 'Votre liste est vide' : 'Rien ne correspond'),
              h('span', null, tab === 'liste' ? 'Ajoutez des séries avec le bouton « Ma liste » sur leur fiche.' : 'Essayez un autre titre ou retirez un filtre.'),
            ),
          ]),
    );
  }

  draw();

  const page = h('div.page.page--library', null,
    h('header.page-head', null,
      h('p.kicker', null, `${plural(lib.animes.length, 'série')} · ${plural(lib.animes.reduce((n, a) => n + a.available, 0), 'épisode')}`),
      h('h1.page-title', null, tab === 'liste' ? 'Ma liste' : 'Bibliothèque', h('em', null, '.')),
    ),
    h('div.lib-toolbar', null,
      tabs,
      h('div.lib-tools', null, h('label.lib-search-wrap', null, icon('search'), input), sortSelect),
    ),
    genres,
    h('div.lib-meta', null, count),
    grid,
  );
  return { el: page, name: tab === 'liste' ? 'mylist' : 'library', title: tab === 'liste' ? 'Ma liste' : 'Bibliothèque' };
}
