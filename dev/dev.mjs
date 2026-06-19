// dev.mjs — the convenience runner: build once, then watch + serve together.
// Run via `pnpm dev`. Equivalent to running `pnpm watch` and `pnpm serve` in two
// terminals; live reload works because the server watches dev/output/.

import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

const procs = ['watch.mjs', 'serve.mjs'].map((script) =>
  spawn(process.execPath, [join(HERE, script)], { stdio: 'inherit' }),
);

function shutdown() {
  for (const p of procs) p.kill('SIGTERM');
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// if either child dies, take the whole dev session down
for (const p of procs) p.on('exit', (code) => shutdown(code ?? 0));
