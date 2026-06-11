# crew

Autonomous, GitHub-issue-driven dev workflow for Claude Code, shipped as a plugin.

You write work as GitHub Issues; **`/crew:run`** drives each one to a ready-for-review MR — implementation → qa → adversarial review (with a capped fix loop) → independent code-smell review — in its own git worktree, with the app stack running in isolation. **GitHub is the source of truth:** every agent commits and comments on the MR; humans merge asynchronously.

## Skills

- **`/crew:adjust`** — onboard a project: detect & validate the test / lint / build / e2e and app-start commands, the GitHub remote + optional Projects board, and write a `## Workflow Config` block into `CLAUDE.md` that the loop reads at runtime.
- **`/crew:ticket`** — interview a feature into a well-formed, agent-ready GitHub Issue (Context / Out of scope / Acceptance criteria).
- **`/crew:run`** — the orchestrator loop: pull the next `agent-ready` issue, triage it, and drive it through the bundled subagents (`implementation`, `qa`, `reviewer`, `mr-review`) to a ready-for-review MR, then move on to the next.

## Install

Run inside Claude Code:

```sh
/plugin marketplace add devshop-software/crew
/plugin install crew@devshop
```

Then onboard your project with `/crew:adjust`, write a ticket with `/crew:ticket`, and start the loop with `/crew:run`.

## License

MIT.
