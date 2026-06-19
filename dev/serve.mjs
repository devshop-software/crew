// serve.mjs — static dev server for dev/output/ with live reload.
// Run via `pnpm serve`. Serves the generated pages and, by watching dev/output/,
// pushes a reload event over SSE whenever a render lands (so `pnpm watch` in
// another terminal refreshes the browser). Dependency-free.

import { createServer } from 'node:http';
import { watch, readFile, existsSync, mkdirSync } from 'node:fs';
import { readFile as readFileP } from 'node:fs/promises';
import { join, extname, normalize } from 'node:path';
import { OUT_DIR } from './lib.mjs';

const PORT = Number(process.env.PORT) || 4321;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json; charset=utf-8',
};

// Snippet injected into every served HTML page — reconnecting EventSource that
// reloads on a "reload" message. Self-contained; no build step touches it.
const RELOAD_SNIPPET = `
<script>
  (function () {
    function connect() {
      var es = new EventSource('/__reload');
      es.addEventListener('reload', function () { location.reload(); });
      es.onerror = function () { /* server restart — EventSource auto-reconnects */ };
    }
    // Open the stream only AFTER load. A long-lived request started during page
    // parse keeps the browser's loading spinner spinning forever (the "infinite
    // loader"); deferring past load lets the page finish, then we connect.
    if (document.readyState === 'complete') connect();
    else window.addEventListener('load', connect);
  })();
</script>
`;

// Connected SSE clients.
const clients = new Set();
function broadcastReload() {
  for (const res of clients) res.write('event: reload\ndata: 1\n\n');
}

mkdirSync(OUT_DIR, { recursive: true });

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');

  // live-reload stream
  if (url.pathname === '/__reload') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    res.write('retry: 1000\n\n');
    clients.add(res);
    req.on('close', () => clients.delete(res));
    return;
  }

  // resolve path, guarding against traversal outside OUT_DIR
  let rel = decodeURIComponent(url.pathname);
  if (rel === '/' || rel.endsWith('/')) rel += 'index.html';
  const filePath = normalize(join(OUT_DIR, rel));
  if (!filePath.startsWith(OUT_DIR)) {
    res.writeHead(403).end('forbidden');
    return;
  }

  const ext = extname(filePath);
  if (!existsSync(filePath)) {
    res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`<!doctype html><meta charset="utf-8"><body style="font-family:Helvetica,Arial,sans-serif;padding:40px"><h1>404</h1><p>${rel} not found. Run <code>pnpm build</code>.</p>${RELOAD_SNIPPET}`);
    return;
  }

  try {
    if (ext === '.html') {
      let html = await readFileP(filePath, 'utf8');
      html = html.includes('</body>')
        ? html.replace('</body>', RELOAD_SNIPPET + '</body>')
        : html + RELOAD_SNIPPET;
      res.writeHead(200, { 'Content-Type': MIME['.html'] });
      res.end(html);
    } else {
      const buf = await readFileP(filePath);
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
      res.end(buf);
    }
  } catch (err) {
    res.writeHead(500).end(String(err));
  }
});

// reload the browser whenever the output dir changes (debounced)
let timer = null;
watch(OUT_DIR, { recursive: true }, () => {
  clearTimeout(timer);
  timer = setTimeout(broadcastReload, 60);
});

server.listen(PORT, () => {
  console.log(`crew · serving ${OUT_DIR}`);
  console.log(`  → http://localhost:${PORT}`);
  if (!existsSync(join(OUT_DIR, 'index.html'))) {
    console.log('  (no pages yet — run `pnpm build` or `pnpm watch`)');
  }
});
