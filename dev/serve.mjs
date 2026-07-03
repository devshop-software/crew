// serve.mjs — static dev server for dev/output/ with live reload.
// Run via `pnpm serve`. Serves the generated pages and, by watching dev/output/,
// pushes a reload event over SSE whenever a render lands (so `pnpm watch` in
// another terminal refreshes the browser). Dependency-free.

import { createServer } from 'node:http';
import { watch, existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, appendFileSync } from 'node:fs';
import { readFile as readFileP } from 'node:fs/promises';
import { dirname, join, extname, normalize, basename } from 'node:path';
import { randomUUID } from 'node:crypto';
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
//
// Two rules keep this stream from ever hanging the browser:
//
//   1. Only the TOP-LEVEL document connects. view.html embeds each skill page in an
//      iframe, and every served page carries this snippet — so a skill view would
//      otherwise hold TWO streams (shell + iframe). A reload broadcast reloads the
//      shell, which re-creates the iframe from its src anyway, so the iframe's own
//      stream is redundant. Skipping it halves the sockets a view holds.
//
//   2. The stream is OPENED on pageshow and CLOSED on pagehide. An EventSource is a
//      long-lived request that holds one of the browser's ~6-per-origin sockets. Left
//      open across a back/forward (bfcache) navigation it is frozen, not closed — so
//      its socket leaks. After a few skill views the pool is exhausted and the NEXT
//      navigation has no free socket, hanging forever on an "infinite loader". Closing
//      on pagehide frees the socket the instant you leave; opening on pageshow (which
//      fires on first load AND on bfcache restore — where 'load' does not — and always
//      AFTER load, so it never spins the initial loader) reconnects when the page
//      comes back.
const RELOAD_SNIPPET = `
<script>
  (function () {
    if (window.top !== window.self) return; // iframe → rely on the shell's stream
    var es = null;
    function connect() {
      if (es) return;
      es = new EventSource('/__reload');
      es.addEventListener('reload', function () { location.reload(); });
      es.onerror = function () { /* server restart — EventSource auto-reconnects */ };
    }
    function disconnect() { if (es) { es.close(); es = null; } }
    window.addEventListener('pageshow', connect);
    window.addEventListener('pagehide', disconnect);
  })();
</script>
`;

// Connected SSE clients.
const clients = new Set();
function broadcastReload() {
  for (const res of clients) res.write('event: reload\ndata: 1\n\n');
}

// ── feedback store (the annotation sidecar the browser writes and the agent reads) ──
// Lives at dev/feedback/ (gitignored, like dev/output/). annotations.json holds the
// open items; resolved.jsonl archives the ones the agent (or the user) has closed.
const DEV_DIR = dirname(OUT_DIR);
const CONFIG_DIR = join(DEV_DIR, '_config');
const FEEDBACK_DIR = join(DEV_DIR, 'feedback');
const STORE = join(FEEDBACK_DIR, 'annotations.json');
const RESOLVED = join(FEEDBACK_DIR, 'resolved.jsonl');
const MANIFEST = join(OUT_DIR, 'manifest.json');

function readManifest() {
  try { return JSON.parse(readFileSync(MANIFEST, 'utf8')); } catch { return {}; }
}
function readStore() {
  try {
    const data = JSON.parse(readFileSync(STORE, 'utf8'));
    if (data && Array.isArray(data.annotations)) return data;
  } catch { /* missing or malformed → fresh store */ }
  return { version: 1, annotations: [] };
}
function writeStore(data) {
  mkdirSync(FEEDBACK_DIR, { recursive: true });
  const tmp = STORE + '.tmp';
  writeFileSync(tmp, JSON.stringify(data, null, 2));
  renameSync(tmp, STORE); // atomic swap: never leave a half-written store on disk
}
function sendJson(res, code, obj) {
  res.writeHead(code, { 'Content-Type': MIME['.json'] });
  res.end(JSON.stringify(obj));
}
function readBody(req, limit = 64 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { req.destroy(); reject(new Error('payload too large')); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}
// Keep only known fields, each length-capped — the client is trusted (localhost) but
// the store is a durable artifact the agent reads, so bound what lands in it.
function sanitizeAnchor(a) {
  if (!a || typeof a !== 'object') return null;
  const s = (v, n) => String(v == null ? '' : v).slice(0, n);
  return {
    section: s(a.section, 200),
    sectionText: s(a.sectionText, 300),
    region: ['frontmatter', 'section-desc', 'body'].indexOf(a.region) >= 0 ? a.region : 'body',
    quote: s(a.quote, 2000),
    prefix: s(a.prefix, 200),
    suffix: s(a.suffix, 200),
    occurrence: Number.isInteger(a.occurrence) && a.occurrence >= 0 ? a.occurrence : 0,
  };
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

  // ── feedback API — the browser annotator talks to these; all same-origin ──────
  if (url.pathname === '/__annotator.js') {
    try {
      const js = await readFileP(join(CONFIG_DIR, 'annotator.js'), 'utf8');
      res.writeHead(200, { 'Content-Type': MIME['.js'], 'Cache-Control': 'no-cache' });
      res.end(js);
    } catch {
      res.writeHead(404).end('annotator.js not found');
    }
    return;
  }

  if (url.pathname === '/__annotations' && req.method === 'GET') {
    const page = url.searchParams.get('page') || '';
    const items = readStore().annotations.filter((a) => a.page === page);
    sendJson(res, 200, { annotations: items });
    return;
  }

  if (url.pathname === '/__annotate' && req.method === 'POST') {
    let body;
    try { body = JSON.parse(await readBody(req)); }
    catch (err) { sendJson(res, 400, { error: String(err.message || err) }); return; }
    const store = readStore();
    if (body.id) { // update the note on an existing item
      const it = store.annotations.find((a) => a.id === body.id);
      if (!it) { sendJson(res, 404, { error: 'not found' }); return; }
      if (typeof body.note === 'string') it.note = body.note.slice(0, 4000);
      writeStore(store);
      sendJson(res, 200, it);
      return;
    }
    const page = String(body.page || '');
    const meta = readManifest()[page];
    if (!meta) { sendJson(res, 400, { error: 'unknown page: ' + page }); return; }
    const rec = {
      id: randomUUID().slice(0, 8),
      page,
      sourcePath: meta.sourcePath, // resolved server-side from the manifest — never from the client
      createdAt: new Date().toISOString(),
      kind: body.kind === 'note' ? 'note' : 'anchored',
      anchor: body.kind === 'note' ? null : sanitizeAnchor(body.anchor),
      note: String(body.note || '').slice(0, 4000),
      status: 'open',
    };
    store.annotations.push(rec);
    writeStore(store);
    sendJson(res, 200, rec);
    return;
  }

  if (url.pathname === '/__annotate' && req.method === 'DELETE') {
    const id = url.searchParams.get('id') || '';
    const store = readStore();
    const before = store.annotations.length;
    store.annotations = store.annotations.filter((a) => a.id !== id);
    writeStore(store);
    sendJson(res, 200, { ok: store.annotations.length < before });
    return;
  }

  if (url.pathname === '/__resolve' && req.method === 'POST') {
    let body;
    try { body = JSON.parse(await readBody(req)); }
    catch (err) { sendJson(res, 400, { error: String(err.message || err) }); return; }
    const store = readStore();
    const it = store.annotations.find((a) => a.id === body.id);
    if (!it) { sendJson(res, 404, { error: 'not found' }); return; }
    store.annotations = store.annotations.filter((a) => a.id !== body.id);
    writeStore(store);
    mkdirSync(FEEDBACK_DIR, { recursive: true });
    appendFileSync(RESOLVED, JSON.stringify({
      ...it, status: 'resolved', resolvedAt: new Date().toISOString(),
      resolution: String(body.resolution || 'resolved in browser').slice(0, 500),
    }) + '\n');
    sendJson(res, 200, { ok: true });
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
      // Every page gets live-reload. Component pages (those in the manifest) also get
      // the annotator — its bootstrap carries the page's source path, so a saved
      // annotation knows which file it targets. The chrome (index/view) is not in the
      // manifest, so it stays clean.
      let inject = RELOAD_SNIPPET;
      const meta = readManifest()[basename(filePath)];
      if (meta) {
        inject += `\n<script>window.__CREW_FB = ${JSON.stringify({ page: basename(filePath), sourcePath: meta.sourcePath })};</script>\n<script src="/__annotator.js"></script>\n`;
      }
      html = html.includes('</body>')
        ? html.replace('</body>', inject + '</body>')
        : html + inject;
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
