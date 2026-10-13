/**
 * npm run demo            → crée un dossier media/ d'exemple (fichiers vides)
 * npm run demo -- --drip  → puis ajoute un nouvel épisode toutes les 20 s,
 *                           pour voir l'accumulation et les notifications en direct.
 *
 * Les fichiers créés sont vides : ils servent uniquement à tester la détection.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';

const MEDIA = path.resolve(process.env.MEDIA_DIR ?? 'media');

const SHOWS: Array<{ folder: string; malId?: number; pattern: (n: number) => string; have: number; total: number }> = [
  { folder: 'Sousou no Frieren', malId: 52991, pattern: (n) => `[SubsPlease] Sousou no Frieren - ${pad(n)} (1080p).mkv`, have: 7, total: 28 },
  { folder: 'Jujutsu Kaisen', malId: 40748, pattern: (n) => `Jujutsu Kaisen S01E${pad(n)}.mp4`, have: 5, total: 24 },
  { folder: 'Spy x Family', malId: 50265, pattern: (n) => `Episode ${pad(n)}.mp4`, have: 12, total: 12 },
  { folder: 'Chainsaw Man', malId: 44511, pattern: (n) => `Chainsaw Man - ${pad(n)} [1080p].mkv`, have: 4, total: 12 },
  { folder: 'Cyberpunk Edgerunners', malId: 42310, pattern: (n) => `E${pad(n)}.webm`, have: 10, total: 10 },
  { folder: 'Solo Leveling', malId: 52299, pattern: (n) => `Solo Leveling - ${pad(n)}.mp4`, have: 3, total: 12 },
  { folder: 'Dandadan', malId: 57334, pattern: (n) => `Dandadan ${pad(n)} VOSTFR.mp4`, have: 6, total: 12 },
  { folder: 'Mob Psycho 100', malId: 32182, pattern: (n) => `Épisode ${pad(n)}.mp4`, have: 2, total: 12 },
];

function pad(n: number) {
  return String(n).padStart(2, '0');
}

async function touch(file: string) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const handle = await fs.open(file, 'a');
  await handle.close();
}

for (const show of SHOWS) {
  const dir = path.join(MEDIA, show.folder);
  for (let n = 1; n <= show.have; n++) await touch(path.join(dir, show.pattern(n)));
  if (show.malId) await fs.writeFile(path.join(dir, 'anime.json'), JSON.stringify({ malId: show.malId }, null, 2) + '\n');
}
console.log(`✓ Dossier de démonstration créé dans ${MEDIA}`);

if (process.argv.includes('--drip')) {
  const state = SHOWS.map((s) => ({ ...s }));
  console.log('💧 Ajout d’un épisode toutes les 20 s (Ctrl+C pour arrêter)…');
  setInterval(async () => {
    const open = state.filter((s) => s.have < s.total);
    const show = open[Math.floor(Math.random() * open.length)];
    if (!show) return;
    show.have++;
    await touch(path.join(MEDIA, show.folder, show.pattern(show.have)));
    console.log(`  + ${show.folder} — épisode ${show.have}`);
  }, 20_000);
}
