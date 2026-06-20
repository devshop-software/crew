# crew

Autonomous, GitHub-issue-driven dev workflow for Claude Code, shipped as a plugin.

Three stages, one GitHub board: **plan → build → merge.** **`/crew:pro`** turns a rough instruction ticket into a granular `agent-planned` board; **`/crew:run`** drives each `agent-ready` issue to a ready-for-review MR — implementation → qa → adversarial review (with a capped fix loop) → independent code-smell review → harvest of leftover advisory findings into backlog tickets — in its own git worktree, with the app stack running in isolation; **`/crew:pulls`** merges them. **GitHub is the source of truth:** every agent commits and comments on the issue/MR.

## Skills

- **`/crew:adjust`** — onboard a project: detect & validate the test / lint / build / e2e and app-start commands, the GitHub remote + optional Projects board, and write a `.crew.rc` config file at the repo root (with a MUST-READ pointer in `CLAUDE.md`) that the loop reads at runtime.
- **`/crew:pro`** — the attended planner: point it at one rough, milestone-sized `instructions` ticket and it dispatches `gatherer` (read-only codebase survey) → `interpreter` (interviews you, every question leading with a code-grounded recommended option) → `planner` (files granular high-level `agent-planned` tickets, assigned to your existing milestones, grouped by feature, with native `blocked_by` edges). You promote the ones you want to `agent-ready` — blocked-aware, never auto-promoted.
- **`/crew:run`** — the orchestrator loop: pull the next `agent-ready` issue, triage it, and drive it through the bundled subagents (`implementation`, `qa`, `reviewer`, `mr-review`, `findings`) to a ready-for-review MR, then move on to the next. `findings` files the leftover advisory review findings as `review-followup` tickets (never `agent-ready`, blocked by the source ticket) for a human to plan.
- **`/crew:pulls`** — the autonomous merge half: runs alongside `/crew:run` and drains the ready-for-review MR queue, merging by default with a human comment as the only brake (a block or question parks the MR; resolving the thread or removing the hold label releases it). Driven by the `pull-triage` and `merge-judge` agents.

## Install

Run inside Claude Code:

```sh
/plugin marketplace add devshop-software/crew
/plugin install crew@devshop
```

Then onboard your project with `/crew:adjust`. Either open `agent-ready` GitHub issues directly, or file a rough `instructions` ticket and run `/crew:pro` to plan it into a board. Start the build loop with `/crew:run` — with `/crew:pulls` running alongside to merge.

## License

MIT.
