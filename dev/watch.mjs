// watch.mjs — re-render the skill pages whenever the source on disk changes.
// Run via `pnpm watch`. Pairs with `pnpm serve` (the server watches dev/output/
// and live-reloads the browser when these renders land).

import { watch } from 'node:fs';
import { existsSync } from 'node:fs';
import { buildAll, WATCH_PATHS } from './lib.mjs';

let timer = null;
function rebuild(reason) {
  clearTimeout(timer);
  timer = setTimeout(() => {
    const at = new Date().toLocaleTimeString();
    console.log(`\n[${at}] change in ${reason} — rebuilding…`);
    try {
      buildAll();
    } catch (err) {
      console.error(`build failed: ${err.message}`);
    }
  }, 80); // debounce bursts (editors fire several events per save)
}

console.log('crew · initial build…');
try {
  buildAll();
} catch (err) {
  console.error(`build failed: ${err.message}`);
  process.exit(1);
}

for (const dir of WATCH_PATHS) {
  if (!existsSync(dir)) {
    console.warn(`(skipping watch — not found: ${dir})`);
    continue;
  }
  watch(dir, { recursive: true }, (_event, file) => rebuild(file || dir));
  console.log(`watching ${dir}`);
}

console.log('\nwatching for changes — Ctrl-C to stop.');
