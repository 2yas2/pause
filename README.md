# pause. — streaming d'anime auto-hébergé

Un site de streaming sombre et soigné pour **vos propres anime**. Le serveur scanne un
dossier, retrouve automatiquement affiche, synopsis, genres, notes et titres
d'épisodes via l'**API REST Jikan** (MyAnimeList, gratuite, sans clé), puis
**accumule les épisodes au fil des jours** : chaque fichier déposé est daté du jour
de son arrivée, et le dernier arrivé devient « l'épisode actuel ».

> La diffusion vidéo (ffmpeg, HLS…) est volontairement laissée vide :
> tout se branche dans **`src/server/stream.ts`** (voir plus bas).

---

## Démarrage

```bash
npm install
npm run demo     # facultatif : crée un dossier media/ d'exemple (fichiers vides)
npm run dev      # http://localhost:3000
```

Production :

```bash
npm run build
npm start
```

Prérequis : Node.js 20.12 ou plus récent.

## Organisation du dossier média

Un sous-dossier par anime, les épisodes dedans. Le numéro est déduit du nom de
fichier (`Episode 05`, `S01E05`, `- 05`, `Ep05`, `[Groupe] Titre - 05 (1080p)`…).

```
media/
├─ Sousou no Frieren/
│  ├─ anime.json                ← facultatif
│  ├─ Episode 01.mp4
│  └─ Episode 02/index.m3u8     ← sortie HLS de ffmpeg (un dossier par épisode)
└─ Jujutsu Kaisen/
   └─ Saison 1/Jujutsu Kaisen S01E01.mkv
```

Si plusieurs formats existent pour un même épisode, le site préfère HLS, puis MP4.

### `anime.json` (facultatif)

Pour forcer la bonne fiche ou personnaliser l'affichage :

```json
{
  "malId": 52991,
  "title": "Frieren",
  "synopsis": "Résumé en français…",
  "search": "Sousou no Frieren"
}
```

`malId` est le numéro dans l'URL MyAnimeList (`myanimelist.net/anime/52991`).
C'est le moyen le plus fiable d'obtenir la bonne correspondance. Les synopsis de
MyAnimeList sont en anglais : `synopsis` permet de les remplacer.

## Accumulation des épisodes

- La bibliothèque est enregistrée dans `data/library.json`.
- Au premier scan, tout ce qui est présent est daté d'aujourd'hui.
- Ensuite, chaque nouveau fichier est daté de son jour d'arrivée. Il apparaît dans
  **Nouveautés**, s'affiche sur l'accueil et déclenche une notification en direct
  dans les navigateurs ouverts.
- Le dossier est surveillé (re-scan ~4 s après un changement) et re-scanné toutes
  les 10 minutes. `npm run scan` force un scan sans lancer le site.
- Sur chaque fiche, une frise montre les épisodes vus, disponibles et à venir.

`npm run demo -- --drip` ajoute un faux épisode toutes les 20 s pour voir le
mécanisme en action.

## 🎬 Brancher la diffusion — `src/server/stream.ts`

Deux fonctions à compléter, rien d'autre à modifier :

1. **`resolveStreamUrl(ctx)`** renvoie l'URL que le lecteur charge pour un épisode
   (`ctx.slug`, `ctx.episode`, `ctx.file`, `ctx.absolutePath`). Tant qu'elle renvoie
   `null`, le lecteur affiche un écran « Flux en préparation ».
2. **`handleStreamRequest(req, res)`** (facultatif) sert vous-même les fichiers sur
   les URL `/stream/...`.

Le lecteur lit nativement le MP4 et le WebM, et le **HLS (`.m3u8`)** via hls.js,
chargé automatiquement si le navigateur en a besoin.

## Configuration (`.env`)

Voir `.env.example` : `PORT`, `MEDIA_DIR`, `DATA_DIR`, `SCAN_INTERVAL`,
`WATCH_MEDIA`, `META_TTL_DAYS`, `JIKAN_DELAY_MS`, `IMAGE_HOSTS`.

## Fonctionnalités

- Accueil : carrousel à la une teinté par la couleur de l'affiche, « Continuer à
  regarder », nouveaux épisodes, statistiques des 14 derniers jours, rangées par genre.
- Fiche anime : notes, classement, synopsis, bande-annonce, frise d'accumulation,
  liste des épisodes (tri, masquer les vus, marquer vu/non vu).
- Lecteur sur mesure : reprise automatique, raccourcis (espace/K, J/L, ←/→, ↑/↓,
  M, F, N, 0–9), vitesse, image dans l'image, plein écran, « Passer l'intro »,
  épisode suivant automatique.
- Nouveautés : le fil des épisodes regroupés par jour.
- Bibliothèque : filtres (genre, Ma liste, en cours de visionnage, séries complètes),
  tri, recherche.
- Recherche instantanée `Ctrl/⌘ K` ou `/`.
- Mobile : barre d'onglets en bas, mise en page adaptée.
- La progression et « Ma liste » sont enregistrées dans le navigateur (localStorage).

## Structure

```
src/
├─ shared/types.ts      types de l'API interne
├─ server/              Node.js + TypeScript, sans framework
│  ├─ index.ts          serveur HTTP, routes /api, fichiers statiques, temps réel (SSE)
│  ├─ scanner.ts        lecture du dossier média
│  ├─ parse.ts          détection des numéros d'épisode, nettoyage des titres
│  ├─ jikan.ts          client de l'API REST Jikan (limite de débit, reprises)
│  ├─ library.ts        accumulation, persistance, vues de l'API
│  ├─ images.ts         proxy d'images avec cache disque
│  └─ stream.ts         ← votre partie
└─ client/              interface en TypeScript, sans framework (compilée dans public/js)
public/                 index.html, css/app.css, bientot.html (ancienne page d'attente)
scripts/                demo.ts, mock-jikan.ts (faux Jikan pour travailler hors ligne)
tests/                  tests du parseur (npm test)
```

### API interne

| Méthode | Route | Rôle |
|---|---|---|
| GET | `/api/library` | anime, derniers épisodes, genres |
| GET | `/api/anime/:slug` | fiche complète et épisodes |
| GET | `/api/status` | état du scan |
| GET | `/api/events` | flux temps réel (Server-Sent Events) |
| POST | `/api/scan` | lance un scan |
| GET | `/img?u=…` | proxy d'images (domaines autorisés uniquement) |
