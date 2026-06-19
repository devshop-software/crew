// build.mjs — one-shot render of every plugin skill/agent to dev/output/.
// Run via `pnpm build`. The watcher (dev/watch.mjs) calls the same buildAll().

import { buildAll, OUT_DIR } from './lib.mjs';

console.log('crew · building skill pages…');
try {
  const entries = buildAll();
  console.log(`done — ${entries.length} page(s) in ${OUT_DIR}`);
} catch (err) {
  console.error(`build failed: ${err.message}`);
  process.exit(1);
}
