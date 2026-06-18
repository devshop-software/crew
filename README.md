# crew

Autonomous, GitHub-issue-driven dev workflow for Claude Code, shipped as a plugin.

You write work as GitHub Issues; **`/crew:run`** drives each one to a ready-for-review MR — implementation → qa → adversarial review (with a capped fix loop) → independent code-smell review → harvest of leftover advisory findings into backlog tickets — in its own git worktree, with the app stack running in isolation. **GitHub is the source of truth:** every agent commits and comments on the MR; humans merge asynchronously.

## Skills

- **`/crew:adjust`** — onboard a project: detect & validate the test / lint / build / e2e and app-start commands, the GitHub remote + optional Projects board, and write a `## Workflow Config` block into `CLAUDE.md` that the loop reads at runtime.
- **`/crew:run`** — the orchestrator loop: pull the next `agent-ready` issue, triage it, and drive it through the bundled subagents (`implementation`, `qa`, `reviewer`, `mr-review`, `findings`) to a ready-for-review MR, then move on to the next. `findings` files the leftover advisory review findings as `review-followup` tickets (never `agent-ready`, blocked by the source ticket) for a human to plan.
- **`/crew:pulls`** — the autonomous merge half: runs alongside `/crew:run` and drains the ready-for-review MR queue, merging by default with a human comment as the only brake (a block or question parks the MR; resolving the thread or removing the hold label releases it). Driven by the `pull-triage` and `merge-judge` agents.

## Install

Run inside Claude Code:

```sh
/plugin marketplace add devshop-software/crew
/plugin install crew@devshop
```

Then onboard your project with `/crew:adjust`, open `agent-ready` GitHub issues, and start the loop with `/crew:run` — with `/crew:pulls` running alongside to merge.

## License

MIT.
