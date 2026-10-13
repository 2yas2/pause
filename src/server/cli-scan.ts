/** `npm run scan` : scanne le dossier média une fois, sans démarrer le site. */
import { loadLibrary, scan } from './library.js';

await loadLibrary();
const report = await scan();
for (const a of report.added) console.log(`  + ${a.title} — épisode ${a.episode}`);
