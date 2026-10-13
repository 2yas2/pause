import { api } from '../api.js';
import { h, icon } from '../dom.js';
import { button, toast } from '../components/ui.js';
import { render } from '../router.js';

/** Premier lancement : la bibliothèque est vide, on explique comment la remplir. */
export async function emptyLibrary(): Promise<HTMLElement> {
  const status = await api.status().catch(() => null);
  const dir = status?.mediaDir ?? 'media/';

  const step = (n: string, title: string, body: HTMLElement | string) =>
    h('li.onboard-step', null, h('span.onboard-n.mono', null, n), h('div', null, h('h3', null, title), typeof body === 'string' ? h('p', null, body) : body));

  const scanBtn = button('Scanner maintenant', {
    icon: 'refresh',
    onclick: async () => {
      scanBtn.classList.add('is-loading');
      try {
        const report = (await api.scan()) as { animeCount: number; episodeCount: number };
        api.invalidate();
        toast({ title: 'Scan terminé', body: `${report.animeCount} anime · ${report.episodeCount} épisodes`, icon: 'check' });
        await render();
      } catch {
        toast({ title: 'Le scan a échoué', body: 'Consultez le terminal du serveur.', icon: 'close' });
      } finally {
        scanBtn.classList.remove('is-loading');
      }
    },
  });

  return h('div.page.page--empty', null,
    h('div.onboard', null,
      h('div.onboard-orb', { 'aria-hidden': 'true' }, h('span'), h('span'), h('span')),
      h('p.kicker', null, 'Bienvenue sur pause.'),
      h('h1.onboard-title', null, 'Votre écran ', h('em', null, 'attend'), ' ses premières séries.'),
      h('p.onboard-lede', null,
        'Déposez vos anime dans le dossier média : pause. les détecte, retrouve affiches et résumés, puis les accumule épisode après épisode.',
      ),
      h('ol.onboard-steps', null,
        step('01', 'Un dossier par anime', h('div', null,
          h('p', null, 'Dans ', h('code', null, dir), ' :'),
          h('pre.code', null,
            'media/\n├─ Sousou no Frieren/\n│  ├─ Episode 01.mp4\n│  └─ Episode 02/index.m3u8\n└─ Jujutsu Kaisen/\n   └─ Jujutsu Kaisen S01E01.mkv',
          ),
        )),
        step('02', 'Les infos arrivent seules', 'Titre, affiche, synopsis, genres et noms d’épisodes viennent de MyAnimeList (API Jikan). Un fichier anime.json permet de corriger une correspondance.'),
        step('03', 'Chaque nouvel épisode s’ajoute', 'Le dossier est surveillé : un fichier déposé apparaît dans « Nouveautés » en quelques secondes.'),
      ),
      h('div.onboard-actions', null,
        scanBtn,
        h('span.onboard-tip', null, icon('terminal'), 'ou ', h('code', null, 'npm run demo'), ' pour un jeu d’essai'),
      ),
    ),
  );
}
