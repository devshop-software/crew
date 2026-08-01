# crew

Autonomous, GitHub-issue-driven development for Claude Code and Codex.

Three stages, one GitHub board: **plan → build → merge.** Crew turns a rough instruction ticket into a granular `agent-planned` board, drives each `agent-ready` issue to a ready-for-review MR through specialized implementation and review agents, and merges the resulting queue. GitHub is the source of truth: every agent commits and records its handoff on the issue or MR.

## Workflows

| Workflow | Claude Code | Codex | Purpose |
|----------|-------------|-------|---------|
| Adjust | `/crew:adjust` | `$crew-adjust` | Onboard a project, validate its commands and GitHub wiring, configure the crew bot, write `.crew.rc`, and provision the host's design/browser inputs. |
| Pro | `/crew:pro` | `$crew-pro` | Turn one rough `instructions` ticket into grounded, milestone-assigned work grouped under epics, then auto-promote it to `agent-ready`. |
| Run | `/crew:run` | `$crew-run` | Drive the `agent-ready` queue through implementation, QA, correctness review, craft review, optional UI fidelity review, cleanup, and findings. |
| Pulls | `/crew:pulls` | `$crew-pulls` | Drain ready-for-review MRs, merging by default while treating unresolved human comments as the brake. |

`adjust` keeps `CLAUDE.md` canonical and creates `AGENTS.md` as its relative symlink, so both hosts read the same repository guidance. It refuses to overwrite a user-authored `AGENTS.md`.

## Install for Claude Code

Run inside Claude Code:

```text
/plugin marketplace add devshop-software/crew
/plugin install crew@devshop
```

Then run `/crew:adjust`.

## Install for Codex

Add this repository as a Codex marketplace:

```sh
codex plugin marketplace add devshop-software/crew
```

Open the Plugins directory in the Codex app, select the repository marketplace, and install **Crew**. Then invoke `$crew-adjust` in the target repository. Codex skills accept additional invocation text directly, for example `$crew-run --issue 123`; they do not use Claude's `$ARGUMENTS` placeholder.

For UI work, commit a Claude Design export ZIP to the target repository before running `$crew-adjust`. Codex validates and reads that tracked handoff from the `design-handoff` path in `.crew.rc`; replacing the ZIP at the same path needs no config update. Claude Code continues to use the Design MCP from the target repository's `.mcp.json`.

## Dual-host source layout

- `crew/` is the canonical Claude Code plugin: four skills, eleven agent definitions, the schema, and runtime scripts.
- `plugins/crew/` is the generated Codex plugin: Codex-valid skills, generated role references, an explicit model/reasoning manifest, the same schema/scripts, bundled Playwright MCP configuration, and the tracked design-handoff adapter.
- `dev/build-codex.mjs` generates the Codex package deterministically from `crew/`; edit the canonical Claude files, then run `pnpm build`.
- `.claude-plugin/marketplace.json` exposes the Claude package; `.agents/plugins/marketplace.json` exposes the Codex package.

The Codex orchestrators resolve each logical agent through `plugins/crew/agents/manifest.json`, pass its `model` and `model_reasoning_effort` explicitly when spawning it, and require the subagent to read the generated role file before acting. Claude Code continues to get `model` and `effort` from each agent's Markdown frontmatter.

## Development

```sh
pnpm build         # regenerate Codex adapters and render the dashboard
pnpm check:codex   # prove generated adapters are current and structurally valid
```

The checked-in Codex package is generated output so marketplace installs work directly from the repository. Do not edit it by hand.

## License

MIT.
