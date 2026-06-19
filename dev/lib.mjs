// lib.mjs — shared plumbing for the crew dev app.
//
// Discovers the plugin's skills + agents AND the skill-builder templates on disk,
// drives the deterministic render.mjs renderer (the workspace's own script) to
// turn each into a standalone HTML page under dev/output/, and generates two
// chrome pages around them: a tabbed index (crew / Templates) and a viewer shell
// (view.html) that embeds a rendered page in an iframe with a back tab — so the
// rendered files themselves stay untouched. Dependency-free (Node stdlib only).

import { readFileSync, readdirSync, existsSync, mkdirSync, writeFileSync, unlinkSync, statSync } from 'node:fs';
import { join, dirname, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url)); // main/dev

// ── paths ─────────────────────────────────────────────────────────────────────

export const REPO = resolve(HERE, '..');        // the git repo: main/
export const WORKSPACE = resolve(REPO, '..');    // crew workspace root (outside the repo)
export const SKILLS_DIR = join(REPO, 'crew', 'skills');
export const AGENTS_DIR = join(REPO, 'crew', 'agents');
export const OUT_DIR = join(HERE, 'output');

// Skill-builder design knowledge (the template.md sources live here). Outside the repo.
const SKILL_BUILDER = join(WORKSPACE, 'context', 'knowledge', 'skill-builder');

// The renderer + HTML shell (template.htm) now live inside the dev tooling, so
// the whole pipeline is self-contained in the repo. Override with CREW_RENDER.
const CONFIG_DIR = join(HERE, '_config');
export const RENDER = process.env.CREW_RENDER || join(CONFIG_DIR, 'render.mjs');

// Watch the skill/agent sources, the template sources, and the renderer/shell
// itself (so editing template.htm or render.mjs re-renders everything).
export const WATCH_PATHS = [SKILLS_DIR, AGENTS_DIR, SKILL_BUILDER, CONFIG_DIR];

const TYPE_LABEL = { skill: 'Skill', orchestrator: 'Orchestrator', agent: 'Agent' };

// The skill-builder templates — one per type. They carry no top-of-file
// frontmatter (the renderer's --name/--description fill in for it), so name and
// blurb are supplied here. Ordered skill → orchestrator → agent to match crew.
const TEMPLATES = [
  {
    type: 'skill',
    outName: 'skill-template',
    src: join(SKILL_BUILDER, 'skills', 'template.md'),
    description: 'The structural skeleton every regular crew skill follows — Role, When to Apply, Input Handling, Steps, and Constraints.',
  },
  {
    type: 'orchestrator',
    outName: 'orchestrator-template',
    src: join(SKILL_BUILDER, 'orchestrators', 'template.md'),
    description: 'The skeleton for a looping orchestrator — the loop it drives end to end by dispatching subagents, ticket to merged.',
  },
  {
    type: 'agent',
    outName: 'agent-template',
    src: join(SKILL_BUILDER, 'agents', 'template.md'),
    description: 'The skeleton for a dispatched subagent — its role, inputs, ordered steps, and the durable output it hands back.',
  },
];

// ── discovery ───────────────────────────────────────────────────────────────

// Pull name / description / metadata.type out of a file's YAML frontmatter with
// a tiny line-based parse — enough for the index; the renderer does its own.
function readFrontmatter(file) {
  const text = readFileSync(file, 'utf8');
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  const fm = m ? m[1] : '';
  const get = (key) => {
    const mm = fm.match(new RegExp('^\\s*' + key + ':\\s*(.*)$', 'm'));
    if (!mm) return '';
    let v = mm[1].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    return v;
  };
  return { name: get('name'), description: get('description'), metaType: get('type') };
}

// Map a file + its frontmatter type to one of render.mjs's --type values.
// Skills carry metadata.type (regular | orchestrator); agents have none.
function renderType(file, metaType) {
  if (file.startsWith(AGENTS_DIR)) return 'agent';
  if (metaType === 'orchestrator') return 'orchestrator';
  return 'skill'; // regular
}

// Find every skill (crew/skills/<name>/SKILL.md) and agent (crew/agents/*.md).
export function discover() {
  const out = [];

  if (existsSync(SKILLS_DIR)) {
    for (const entry of readdirSync(SKILLS_DIR)) {
      const file = join(SKILLS_DIR, entry, 'SKILL.md');
      if (existsSync(file)) {
        const fm = readFrontmatter(file);
        out.push({ file, type: renderType(file, fm.metaType), ...fm });
      }
    }
  }

  if (existsSync(AGENTS_DIR)) {
    for (const entry of readdirSync(AGENTS_DIR)) {
      if (!entry.endsWith('.md')) continue;
      const file = join(AGENTS_DIR, entry);
      if (statSync(file).isFile()) {
        const fm = readFrontmatter(file);
        out.push({ file, type: renderType(file, fm.metaType), ...fm });
      }
    }
  }

  // stable: type group, then name
  const order = { skill: 0, orchestrator: 1, agent: 2 };
  out.sort((a, b) => (order[a.type] - order[b.type]) || a.name.localeCompare(b.name));
  return out;
}

// ── render ──────────────────────────────────────────────────────────────────

function runRender(args, label) {
  const res = spawnSync(process.execPath, [RENDER, ...args], { encoding: 'utf8' });
  if (res.status !== 0) {
    const why = (res.stderr || res.error?.message || `exit ${res.status}`).trim();
    throw new Error(`render failed for ${label}: ${why}`);
  }
}

// Crew skill/agent: name + description come from frontmatter, so just pass type.
function renderOne(entry) {
  runRender([entry.file, '--type', entry.type, '--out', OUT_DIR], entry.file);
  return `${entry.name}.html`;
}

// Template: no frontmatter, so name + description are supplied explicitly.
function renderTemplate(t) {
  runRender([t.src, '--type', t.type, '--name', t.outName, '--description', t.description, '--out', OUT_DIR], t.src);
  return `${t.outName}.html`;
}

// Remove .html files in OUT_DIR that no longer correspond to a discovered page
// (e.g. a renamed/deleted skill) — but keep the chrome pages, and never remove
// the directory itself (the server watches it; removing it would break the watch).
function pruneStale(keep) {
  if (!existsSync(OUT_DIR)) return;
  const expected = new Set([...keep, 'index.html', 'view.html']);
  for (const f of readdirSync(OUT_DIR)) {
    if (f.endsWith('.html') && !expected.has(f)) unlinkSync(join(OUT_DIR, f));
  }
}

// Render everything and (re)write the chrome pages. Returns the card list.
export function buildAll({ quiet = false } = {}) {
  if (!existsSync(RENDER)) {
    throw new Error(
      `renderer not found at ${RENDER}\n` +
      `set CREW_RENDER to the path of render.mjs if your workspace layout differs.`,
    );
  }
  mkdirSync(OUT_DIR, { recursive: true });

  const crew = discover();
  for (const e of crew) {
    renderOne(e);
    if (!quiet) console.log(`  rendered ${e.type.padEnd(12)} ${basename(e.file)} → ${e.name}.html`);
  }

  const templates = TEMPLATES.filter((t) => existsSync(t.src));
  for (const t of templates) {
    renderTemplate(t);
    if (!quiet) console.log(`  rendered ${('template/' + t.type).padEnd(12)} ${basename(t.src)} → ${t.outName}.html`);
  }

  // normalize to card descriptors the chrome pages share
  const crewCards = crew.map((e) => ({
    file: `${e.name}.html`, display: e.name, badge: TYPE_LABEL[e.type], type: e.type, description: e.description, tab: 'crew',
  }));
  const tplCards = templates.map((t) => ({
    file: `${t.outName}.html`, display: t.type, badge: 'Template', type: t.type, description: t.description, tab: 'templates',
  }));

  pruneStale([...crewCards, ...tplCards].map((c) => c.file));
  writeFileSync(join(OUT_DIR, 'index.html'), renderIndex(crewCards, tplCards));
  writeFileSync(join(OUT_DIR, 'view.html'), renderViewer([...crewCards, ...tplCards]));
  if (!quiet) console.log(`  chrome   index.html + view.html (${crewCards.length} crew · ${tplCards.length} templates)`);

  return [...crewCards, ...tplCards];
}

// ── shared CSS: Swiss Modernism tokens + reset ────────────────────────────────

const escapeHtml = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const ROOT_CSS = `
    :root {
      --paper: #ffffff; --ink: #111111; --muted: #6b6b6b; --red: #e2231a; --rule: #111111;
      --sans: "Helvetica Neue", Helvetica, Arial, "Liberation Sans", sans-serif;
    }
    @media (prefers-color-scheme: dark) {
      :root { --paper: #0d0d0d; --ink: #f2f2f2; --muted: #9b9b9b; --red: #ff3b30; --rule: #f2f2f2; }
    }
    * { box-sizing: border-box; }
    a { color: inherit; text-decoration: none; }`;

// ── index page (tabbed: crew / Templates) ─────────────────────────────────────

function renderIndex(crewCards, tplCards) {
  const pad = (n) => String(n).padStart(2, '0');

  const cell = (c, n) => {
    const link = `view.html?p=${encodeURIComponent(c.file)}&amp;tab=${c.tab}`;
    return `
            <li class="cell">
              <a class="cell__link" href="${link}">
                <div class="cell__top">
                  <span class="cell__num">${n}</span>
                  <span class="cell__type">${escapeHtml(c.badge)}</span>
                </div>
                <h3 class="cell__name">${escapeHtml(c.display)}</h3>
                <p class="cell__desc">${escapeHtml(c.description)}</p>
                <span class="cell__cta">Read &rarr;</span>
              </a>
            </li>`;
  };

  const group = (title, range, items) => `
        <section class="group">
          <div class="group__head">
            <h2 class="group__title">${escapeHtml(title)}</h2>
            <span class="group__range">${range}</span>
          </div>
          <ul class="grid">${items}
          </ul>
        </section>`;

  // crew panel — numbered across the whole crew list, grouped by type
  const crewNum = new Map(crewCards.map((c, i) => [c, pad(i + 1)]));
  const crewSections = ['skill', 'orchestrator', 'agent']
    .map((t) => ({ t, items: crewCards.filter((c) => c.type === t) }))
    .filter((g) => g.items.length)
    .map((g) => {
      const range = `${crewNum.get(g.items[0])}–${crewNum.get(g.items[g.items.length - 1])}`;
      return group(`${TYPE_LABEL[g.t]}s`, range, g.items.map((c) => cell(c, crewNum.get(c))).join(''));
    })
    .join('\n');

  // templates panel — single grid numbered 01..n
  const tplSection = tplCards.length
    ? group('Templates', `${pad(1)}–${pad(tplCards.length)}`, tplCards.map((c, i) => cell(c, pad(i + 1))).join(''))
    : '<p class="empty">No templates found under context/knowledge/skill-builder.</p>';

  const total = crewCards.length + tplCards.length;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>crew · component index</title>
  <style>
${ROOT_CSS}
    html { -webkit-text-size-adjust: 100%; }
    body {
      margin: 0; background: var(--paper); color: var(--ink); font-family: var(--sans);
      line-height: 1.4; -webkit-font-smoothing: antialiased; text-rendering: optimizeLegibility;
    }
    .page { max-width: 1180px; margin: 0 auto; padding: clamp(24px, 5vw, 64px); }

    .masthead { display: grid; grid-template-columns: 1fr auto; align-items: baseline; gap: 24px; border-bottom: 4px solid var(--rule); padding-bottom: 18px; }
    .masthead__title { margin: 0; font-size: clamp(3rem, 11vw, 7.5rem); font-weight: 700; letter-spacing: -0.045em; line-height: 0.88; }
    .masthead__title b { color: var(--red); font-weight: 700; }
    .masthead__meta { text-align: right; text-transform: uppercase; letter-spacing: 0.16em; font-size: 0.7rem; font-weight: 700; line-height: 1.7; color: var(--muted); }
    .masthead__meta .count { color: var(--red); }
    .lede { margin: 18px 0 0; max-width: 52ch; font-size: 1rem; color: var(--muted); line-height: 1.5; }

    /* tabs */
    .tabs { display: flex; margin-top: 30px; border-bottom: 1px solid var(--rule); }
    .tab { appearance: none; background: none; border: 0; border-bottom: 3px solid transparent; margin: 0 30px -1px 0; padding: 10px 0; font-family: inherit; font-size: 0.82rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.14em; color: var(--muted); cursor: pointer; }
    .tab:hover { color: var(--ink); }
    .tab.is-active { color: var(--ink); border-bottom-color: var(--red); }
    .panel.is-hidden { display: none; }

    .group { margin-top: clamp(36px, 5vw, 60px); }
    .group__head { display: flex; align-items: baseline; justify-content: space-between; border-bottom: 1px solid var(--rule); padding-bottom: 8px; }
    .group__title { margin: 0; font-size: 0.92rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.14em; }
    .group__range { font-size: 0.92rem; font-weight: 700; letter-spacing: 0.08em; color: var(--red); font-variant-numeric: tabular-nums; }

    .grid { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(3, 1fr); gap: 1px; background: var(--rule); border: 1px solid var(--rule); border-top: 0; }
    @media (max-width: 860px) { .grid { grid-template-columns: repeat(2, 1fr); } }
    @media (max-width: 560px) { .grid { grid-template-columns: 1fr; } }

    .cell { margin: 0; }
    .cell__link { display: flex; flex-direction: column; height: 100%; min-height: 220px; background: var(--paper); color: var(--ink); padding: 18px 18px 16px; transition: background-color .12s linear, color .12s linear; }
    .cell__link:hover, .cell__link:focus-visible { background: var(--ink); color: var(--paper); outline: none; }
    .cell__top { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 14px; }
    .cell__num { font-size: 0.92rem; font-weight: 700; color: var(--red); font-variant-numeric: tabular-nums; letter-spacing: 0.04em; }
    .cell__type { font-size: 0.64rem; text-transform: uppercase; letter-spacing: 0.16em; font-weight: 700; color: var(--muted); }
    .cell__link:hover .cell__type, .cell__link:focus-visible .cell__type { color: var(--paper); }
    .cell__name { margin: 0 0 10px; font-size: clamp(1.5rem, 2.6vw, 1.9rem); font-weight: 700; letter-spacing: -0.025em; line-height: 1.02; }
    .cell__desc { margin: 0 0 16px; font-size: 0.8rem; line-height: 1.45; color: var(--muted); display: -webkit-box; -webkit-line-clamp: 5; -webkit-box-orient: vertical; overflow: hidden; }
    .cell__link:hover .cell__desc, .cell__link:focus-visible .cell__desc { color: var(--paper); }
    .cell__cta { margin-top: auto; font-size: 0.7rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.14em; color: var(--red); }
    .empty { margin-top: 28px; color: var(--muted); font-size: 0.9rem; }

    .colophon { margin-top: clamp(48px, 7vw, 88px); border-top: 4px solid var(--rule); padding-top: 16px; display: flex; justify-content: space-between; gap: 24px; flex-wrap: wrap; font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.12em; color: var(--muted); }
  </style>
</head>
<body>
  <main class="page">
    <header class="masthead">
      <h1 class="masthead__title">crew<b>.</b></h1>
      <div class="masthead__meta">
        Component Index<br />
        <span class="count">${pad(total)}</span> Entries
      </div>
    </header>
    <p class="lede">Skills, orchestrators, and agents of the crew plugin — plus the skill-builder templates — rendered deterministically from the source on disk.</p>

    <nav class="tabs" role="tablist" aria-label="Views">
      <button class="tab is-active" type="button" role="tab" data-tab="crew" aria-selected="true">crew</button>
      <button class="tab" type="button" role="tab" data-tab="templates" aria-selected="false">Templates</button>
    </nav>

    <div class="panel" data-panel="crew" role="tabpanel">
${crewSections}
    </div>
    <div class="panel is-hidden" data-panel="templates" role="tabpanel">
${tplSection}
    </div>

    <footer class="colophon">
      <span>Generated · dev/build.mjs</span>
      <span>pnpm watch — rebuild on change</span>
    </footer>
  </main>
  <script>
    (function () {
      var tabs = ['crew', 'templates'];
      function show(tab) {
        if (tabs.indexOf(tab) < 0) tab = 'crew';
        document.querySelectorAll('.tab').forEach(function (t) {
          var on = t.dataset.tab === tab;
          t.classList.toggle('is-active', on);
          t.setAttribute('aria-selected', on);
        });
        document.querySelectorAll('.panel').forEach(function (p) {
          p.classList.toggle('is-hidden', p.dataset.panel !== tab);
        });
      }
      document.querySelectorAll('.tab').forEach(function (t) {
        t.addEventListener('click', function () {
          show(t.dataset.tab);
          history.replaceState(null, '', '#' + t.dataset.tab);
        });
      });
      window.addEventListener('hashchange', function () { show((location.hash || '').slice(1)); });
      show((location.hash || '').slice(1));
    })();
  </script>
</body>
</html>
`;
}

// ── viewer shell (view.html) ──────────────────────────────────────────────────
// One shell for every component. Reads ?p=<file>&tab=<tab>, validates the file
// against an embedded allowlist (so the iframe only ever loads a page we built),
// and shows a back tab. The rendered file in the iframe is never modified.

function renderViewer(cards) {
  const map = {};
  for (const c of cards) map[c.file] = { display: c.display, badge: c.badge, tab: c.tab };

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>crew · viewer</title>
  <style>
${ROOT_CSS}
    html, body { height: 100%; }
    body { margin: 0; display: flex; flex-direction: column; background: var(--paper); color: var(--ink); font-family: var(--sans); -webkit-font-smoothing: antialiased; }
    .bar { flex: 0 0 auto; display: flex; align-items: baseline; gap: 16px; padding: 13px clamp(16px, 4vw, 40px); border-bottom: 1px solid var(--rule); }
    .bar__back { font-size: 0.8rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.12em; color: var(--ink); border-bottom: 3px solid var(--red); padding-bottom: 3px; }
    .bar__back:hover { color: var(--red); }
    .bar__spacer { flex: 1 1 auto; }
    .bar__badge { font-size: 0.62rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.16em; color: var(--muted); border: 1px solid var(--rule); padding: 2px 7px; }
    .bar__name { margin: 0; font-size: 1.1rem; font-weight: 700; letter-spacing: -0.02em; }
    .frame { flex: 1 1 auto; width: 100%; border: 0; background: var(--paper); }
    .empty { padding: 48px clamp(16px, 4vw, 40px); color: var(--muted); font-size: 0.95rem; }
  </style>
</head>
<body>
  <header class="bar">
    <a id="back" class="bar__back" href="index.html">&larr; crew</a>
    <span class="bar__spacer"></span>
    <span id="badge" class="bar__badge"></span>
    <h1 id="name" class="bar__name"></h1>
  </header>
  <iframe id="frame" class="frame" title="rendered component"></iframe>
  <script>
    (function () {
      var PAGES = ${JSON.stringify(map)};
      var q = new URLSearchParams(location.search);
      var p = q.get('p') || '';
      var meta = PAGES[p];
      if (!meta) { location.replace('index.html'); return; }
      var tab = q.get('tab') || meta.tab || 'crew';
      document.getElementById('frame').src = p; // validated: p is a known page filename
      document.getElementById('name').textContent = meta.display;
      document.getElementById('badge').textContent = meta.badge;
      var back = document.getElementById('back');
      back.href = 'index.html#' + tab;
      back.textContent = '\\u2190 ' + tab;
      document.title = meta.display + ' \\u00b7 crew';
    })();
  </script>
</body>
</html>
`;
}
