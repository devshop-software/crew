# dev — skill dashboard

Local-only tooling that renders the plugin's skills/agents to HTML and serves a browseable index. It is **not** part of the shipped plugin: the plugin is `../crew` (per `.claude-plugin/marketplace.json`), and everything here lives outside that subtree, adds no plugin dependencies, and is never loaded by Claude Code. The generated `output/` and `node_modules/` are gitignored.

It drives the deterministic renderer in `_config/render.mjs` (moved here from the skill-builder knowledge so the pipeline is self-contained) — set `CREW_RENDER` to override its path. The entire HTML look-and-feel lives in `_config/template.htm`; `render.mjs` only maps Markdown → HTML 1:1 and is never restyled. The dashboard has two tabs — **crew** (the plugin's skills/orchestrators/agents) and **Templates** (the skill-builder templates) — and each component opens in `view.html`, a shell that embeds the untouched rendered page in an iframe with a back tab. The Agents grid carries an **orchestrator filter** (All / pro / pulls / run) that shows only the agents a given orchestrator dispatches — the owner is parsed from each agent's `Dispatched by crew:<name>` description.

## Feedback annotator

Every rendered component page carries a **feedback annotator** — injected by `serve.mjs` at serve time (like the live-reload snippet), so the deterministic renderer and the committed HTML stay untouched, and it only ever loads under `pnpm dev` (never on the index/view chrome). Toggle the **✎ Annotate** button (bottom-right), select any text on the page, and leave a comment — or add a whole-component note. Comments persist to `feedback/annotations.json` (gitignored) via the server's `/__annotate` API; on load they re-anchor to the live text (by quote + occurrence) and show as highlights, so they survive a re-render. You can annotate **anything on the page, including the generated preview** — the frontmatter readout and the per-H2 section notes; each anchor records which `region` it came from (`body` / `frontmatter` / `section-desc`) so the implement step knows a frontmatter quote maps to the file's YAML and a section-desc quote maps to the renderer, not the body prose.

Anchoring is **content-addressed**: each comment stores the selected text + its nearest heading/step + which occurrence it is — no source-line markers are baked into the HTML, so the render stays byte-identical and a comment survives edits above it. To turn the feedback into edits, tell the agent to "implement the feedback" — it reads the sidecar and applies each item to the source (see the workspace `CLAUDE.md` → *Implementing browser feedback*). Resolved/deleted items move to `feedback/resolved.jsonl`. Endpoints: `GET /__annotations?page=`, `POST /__annotate` (create/update), `DELETE /__annotate?id=`, `POST /__resolve`, `GET /__annotator.js`.

## Commands

Run from the repo root (`main/`):

- `pnpm build` — render every skill/agent to `dev/output/` once, plus the index page.
- `pnpm watch` — rebuild whenever a `SKILL.md` / agent `.md` changes on disk.
- `pnpm serve` — static server for `dev/output/` with live reload (watches the output dir). `PORT` env overrides the default `4321`.
- `pnpm dev` — build once, then run the watcher and the server together (the ergonomic loop: edit a skill, see it refresh).

There are no runtime dependencies — `pnpm install` is a near no-op; the scripts run on Node stdlib.
