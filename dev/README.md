# dev — skill dashboard

Local-only tooling that renders the plugin's skills/agents to HTML and serves a browseable index. It is **not** part of the shipped plugin: the plugin is `../crew` (per `.claude-plugin/marketplace.json`), and everything here lives outside that subtree, adds no plugin dependencies, and is never loaded by Claude Code. The generated `output/` and `node_modules/` are gitignored.

It drives the deterministic renderer in `_config/render.mjs` (moved here from the skill-builder knowledge so the pipeline is self-contained) — set `CREW_RENDER` to override its path. The entire HTML look-and-feel lives in `_config/template.htm`; `render.mjs` only maps Markdown → HTML 1:1 and is never restyled. The dashboard has two tabs — **crew** (the plugin's skills/orchestrators/agents) and **Templates** (the skill-builder templates) — and each component opens in `view.html`, a shell that embeds the untouched rendered page in an iframe with a back tab.

## Commands

Run from the repo root (`main/`):

- `pnpm build` — render every skill/agent to `dev/output/` once, plus the index page.
- `pnpm watch` — rebuild whenever a `SKILL.md` / agent `.md` changes on disk.
- `pnpm serve` — static server for `dev/output/` with live reload (watches the output dir). `PORT` env overrides the default `4321`.
- `pnpm dev` — build once, then run the watcher and the server together (the ergonomic loop: edit a skill, see it refresh).

There are no runtime dependencies — `pnpm install` is a near no-op; the scripts run on Node stdlib.
