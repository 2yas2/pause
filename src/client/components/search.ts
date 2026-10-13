import type { AnimeSummary } from '../../shared/types.js';
import { api } from '../api.js';
import { h, icon } from '../dom.js';
import { epLabel, genreFr, statusFr } from '../format.js';
import { fallbackArt, imgUrl } from '../media.js';
import { navigate } from '../router.js';

/** Palette de recherche instantanée (Ctrl/⌘ K ou « / »). */

const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

/** Score de pertinence : préfixe > mot > contenu > sous-séquence. */
export function matchScore(query: string, a: AnimeSummary): number {
  const q = norm(query.trim());
  if (!q) return 0;
  let best = 0;
  for (const raw of [a.title, ...a.altTitles]) {
    const t = norm(raw);
    if (t === q) return 100;
    if (t.startsWith(q)) best = Math.max(best, 80);
    else if (t.split(/[^a-z0-9]+/).some((w) => w.startsWith(q))) best = Math.max(best, 60);
    else if (t.includes(q)) best = Math.max(best, 40);
    else {
      let i = 0;
      for (const ch of t) if (ch === q[i]) i++;
      if (i === q.length) best = Math.max(best, 15);
    }
  }
  if (a.genres.some((g) => norm(genreFr(g)).startsWith(q) || norm(g).startsWith(q))) best = Math.max(best, 25);
  return best;
}

let open = false;

export async function openSearch() {
  if (open) return;
  open = true;
  const library = await api.library().catch(() => null);
  const animes = library?.animes ?? [];
  let results: AnimeSummary[] = [];
  let active = 0;

  const input = h<HTMLInputElement>('input.search-input', {
    type: 'search',
    placeholder: 'Rechercher un anime, un genre…',
    'aria-label': 'Rechercher',
    autocomplete: 'off',
    spellcheck: 'false',
  });
  const list = h('ul.search-results', { role: 'listbox' });
  const hint = h('div.search-hint', null,
    h('span', null, h('kbd', null, '↑'), h('kbd', null, '↓'), ' naviguer'),
    h('span', null, h('kbd', null, '↵'), ' ouvrir'),
    h('span', null, h('kbd', null, 'Échap'), ' fermer'),
  );

  const render = () => {
    const q = input.value;
    results = q.trim()
      ? animes
          .map((a) => ({ a, s: matchScore(q, a) }))
          .filter((x) => x.s > 0)
          .sort((x, y) => y.s - x.s || x.a.title.localeCompare(y.a.title))
          .slice(0, 8)
          .map((x) => x.a)
      : animes.slice(0, 6);
    active = Math.min(active, Math.max(0, results.length - 1));
    list.replaceChildren(
      ...(results.length
        ? results.map((a, i) =>
            h('li', { role: 'option', 'aria-selected': String(i === active), class: i === active ? 'is-active' : '', onmousemove: () => setActive(i), onclick: () => go(a) },
              h('span.search-thumb', { style: { background: fallbackArt(a.slug) } }, a.poster ? h('img', { src: imgUrl(a.poster), alt: '', loading: 'lazy' }) : null),
              h('span.search-text', null,
                h('strong', null, a.title),
                h('small', null, [a.year, statusFr(a.status), a.genres.slice(0, 2).map(genreFr).join(', ')].filter(Boolean).join(' · ')),
              ),
              a.latestEpisode !== null ? h('span.search-ep.mono', null, `ÉP ${epLabel(a.latestEpisode)}`) : null,
            ),
          )
        : [h('li.search-empty', null, animes.length ? `Aucun résultat pour « ${q} »` : 'Bibliothèque vide pour le moment.')]),
    );
    if (!q.trim() && results.length) list.prepend(h('li.search-label', null, 'Récemment mis à jour'));
  };

  const setActive = (i: number) => {
    if (i === active) return;
    active = i;
    list.querySelectorAll('li[role=option]').forEach((li, j) => {
      li.classList.toggle('is-active', j === active);
      li.setAttribute('aria-selected', String(j === active));
    });
  };

  const close = () => {
    open = false;
    overlay.classList.add('is-leaving');
    document.removeEventListener('keydown', onKey, true);
    window.setTimeout(() => overlay.remove(), 200);
  };
  const go = (a: AnimeSummary) => {
    close();
    navigate(`/anime/${a.slug}`);
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((active + 1) % Math.max(1, results.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((active - 1 + results.length) % Math.max(1, results.length));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const a = results[active];
      if (a) go(a);
      else if (input.value.trim()) {
        close();
        navigate(`/bibliotheque?q=${encodeURIComponent(input.value.trim())}`);
      }
    }
  };

  input.addEventListener('input', () => {
    active = 0;
    render();
  });

  const overlay = h('div.search-overlay', { onclick: (e: MouseEvent) => e.target === overlay && close() },
    h('div.search-panel', { role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Recherche' },
      h('div.search-field', null, icon('search'), input, h('kbd', null, 'Échap')),
      list,
      hint,
    ),
  );
  document.addEventListener('keydown', onKey, true);
  document.body.append(overlay);
  render();
  input.focus();
}

export function bindSearchShortcuts() {
  document.addEventListener('keydown', (e) => {
    const target = e.target as HTMLElement;
    const typing = target.matches('input, textarea, select, [contenteditable]');
    if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || (e.key === '/' && !typing)) {
      e.preventDefault();
      void openSearch();
    }
  });
  document.querySelectorAll('#search-open, [data-search-open]').forEach((b) => b.addEventListener('click', () => void openSearch()));
}
