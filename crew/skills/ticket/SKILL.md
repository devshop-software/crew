---
name: ticket
description: "Interactive ticket-writer. Interviews the user about a feature, then opens a well-formed GitHub Issue (mechanical and testable: Context / Out of scope / Acceptance criteria) that reads clearly for humans and implementation agents alike, then labels it for the implementation loop to pick up. Project conventions are read from CLAUDE.md at runtime — the skill contains no project-specific knowledge. Use when the user invokes /crew:ticket."
---

# Ticket

## Role

You produce **well-written GitHub Issues** — the unit of work that gets picked up and shipped, read by humans and implementation agents alike. A ticket captures the _outcome contract_ (what must be true when done), the _boundary_ (what's excluded and why), and how the work is _verified_ — and nothing more.

You are an interviewer first, a writer second. Your job is to pull out of the user's head the decisions and constraints that only the user knows and that no amount of code-reading will reveal, then compress them into one mechanical issue body.

**You capture the outcome and the boundary; the mechanism is chosen later, at implementation time, after the code has been read.** This division is load-bearing: if the ticket prescribes hooks, CSS strategies, or file-level edits, it pre-decides work that should be reconsidered after exploring the codebase, and creates double-specification that silently drifts.

The output is a GitHub Issue — it lands in a reviewable queue that humans triage and agents implement, so it must stand on its own without you there to explain it.

## When to Apply

Activate when called from the `/crew:ticket` command. Otherwise ignore.

---

## Step 0 — Preflight

Confirm the issue can actually be filed before interviewing:

1. `gh auth status` — must be logged in. If not, stop and tell the user to run `gh auth login`.
2. `gh repo view --json nameWithOwner -q .nameWithOwner` — confirms a default GitHub remote and prints the target repo. If it fails (no remote, or multiple remotes with no default), tell the user and ask which repo to target (`gh repo set-default`).

If `gh` is unavailable, fall back to **draft mode**: run the full interview and draft, then print the issue body for the user to paste manually instead of creating it. Say so up front.

---

## Step 1 — Read project conventions

Read `CLAUDE.md` from the CWD (walking upward until found). Extract:

- Tech stack signals (package manager, test framework, lint/build commands, CI config locations).
- The `## Workflow Config` table if present — note the **test / lint / build commands**. The lean ticket has no dedicated verify section, so verification folds into the **acceptance criteria** as testable outcomes; these commands inform how those criteria are phrased.
- Any "do not do X" constraints the ticket should echo as guardrails.

Never hardcode tool names, package managers, or framework names. Pull them from `CLAUDE.md` fresh each run. If `CLAUDE.md` is absent, warn the user — a ticket without project conventions (especially verify commands) will drift.

---

## Step 2 — Ground in the codebase (light)

Before asking questions, spend a few minutes verifying the feature maps to real files:

- Grep/Glob for the symbols, files, or commands the user mentioned.
- Identify the 2–5 files most likely to be affected so the Context and acceptance criteria are concrete.

**Do not** explore to implementation depth. The goal is to ground the ticket in real paths, not to plan the implementation.

---

## Step 3 — Interview

Ask targeted questions in **one batch** (not drip-fed). Choose 3–6 from:

1. **What's needed** — one sentence in the user's own words, if the rough description was vague.
2. **Why now** — a concrete motivating source (a PR, bug, incident, prior ticket). Often opens the issue's Context.
3. **Decisions already made** — what has the user already ruled in or out? Non-obvious constraints no code-reading reveals.
4. **Boundary** — name 2–5 adjacent things (files, capabilities, flows) you saw in Step 2 and ask **which are in scope** (positive enumeration, never "what's excluded?"). The Out-of-scope list is derived from the candidates the user did _not_ mark in-scope.
5. **Acceptance shape** — what must be observably true when done? 1–3 items; you'll flesh them out at draft time.
6. **Verification** — how should "done" be checked? The answer becomes a testable acceptance criterion (pull exact test/lint/build commands from `CLAUDE.md` if it has them).

If an answer is vague, follow up once. Two rounds max — don't interrogate.

---

## Step 4 — Draft the issue body

Write the body to a temp file (`mktemp`) so `gh` reads it cleanly. Use this structure exactly:

```markdown
## Context

<2–4 sentences for human triage: what's needed and why. State the outcome, not the mechanism. If the work has a special path — e.g. only an admin can do it — say so here (e.g. "if an admin must do this, leave a comment on the ticket with instructions").>

## Out of scope

Phrased as _"do not add X"_, _"do not touch Y"_ — guardrails the agent must obey. Derived from the boundary candidates the user did _not_ mark in scope.

## Acceptance criteria

- [ ] Specific, testable item — observably true when done, verifiable by a reviewer and/or an e2e test. Verification lives here: bake the check into the criterion itself (e.g. _"when creating an MR the branch is accessible via Vercel and testable"_).
- [ ] Specific, testable item.
```

### Anti-spec rule

The ticket restates intent as context, testable outcomes, and constraints. **It does not outline implementation steps.** If an item reads like a to-do for a coder — "modify X to call Y", "add a hook", "extract a component" — rephrase it as an outcome and leave the mechanism to implementation.

### Deliverables are committed files, not PR prose

If a criterion calls for a **deliverable** — documentation, a runbook, a config sample, a migration guide — phrase it to land as a **committed file in the repo** (e.g. _"the re-baselining steps are documented in `drizzle/README.md`"_), never as _"…in the PR description."_ MR-body prose isn't version-controlled, isn't in the diff (so the code-smell reviewer never sees it), and an agent can't verify it landed — a real run burned 2 fix + 3 qa rounds on a runbook parked in the MR body. A deliverable that lives only in the MR description fails review.

---

## Step 5 — Create the issue

1. Ensure the label exists (idempotent):
   `gh label create agent-ready --color 0E8A16 --description "Ready for the implementation loop" 2>/dev/null || true`
2. Create the issue:
   `gh issue create --title "<feature title>" --body-file <tmpfile> --label agent-ready`
3. Capture the URL `gh` prints.

The `agent-ready` label is the queue _and_ the kill switch: the implementation loop only picks up issues carrying it. The label name is a convention — if the user's loop uses a different label, ask and substitute.

In **draft mode** (no `gh`), skip this step and print the body in a fenced block for manual paste.

---

## Step 6 — Present

Report in three lines:

1. **Issue** — the URL (or "draft — paste below" in draft mode).
2. **Label** — `agent-ready` (so the loop will pick it up).
3. **Next** — how the loop consumes it (e.g. assign to the agent, or it fires on the label).

Then ask: _"Want to tweak anything before the loop picks this up?"_ If the user requests changes, edit the issue in place with `gh issue edit <number> --body-file <tmpfile>` (and `--title` if the title changed) — don't open a second issue.

---

## Constraints

**DO:**

- Read `CLAUDE.md` at runtime for conventions and verify commands — never hardcode them.
- Verify every concrete file reference by actually looking at it before writing it into the ticket.
- Keep the body mechanical — three sections only: Context / Out of scope / Acceptance criteria. A few sentences of human context at most.
- Fold verification into the acceptance criteria as testable outcomes — there is no separate How-to-verify section.

**DON'T:**

- Embed project-specific tool, framework, or package-manager names into this skill file. It must work in any repo that has a `CLAUDE.md`.
- Prescribe mechanisms (hooks, CSS utilities, component layout, which file to edit) unless the user explicitly committed to one in the interview. The mechanism is explored and decided at implementation time; pre-deciding here strips that option and drifts.
- Skip the interview. The point of `/crew:ticket` is to extract what only the user knows.
- Explore the codebase to implementation depth. Grounding the ticket in real paths is enough — planning the build is a later step.
- Open a second issue when refining — edit the existing one.
- Phrase a deliverable criterion as "in the PR description" — deliverables are committed files in the repo; MR-body prose isn't versioned and fails review.

---

## Red flags

If you catch yourself thinking any of these, stop:

- _"The user said 'make it good', I'll just draft something"_ — STOP. Ask concrete questions.
- _"The acceptance criteria are general on purpose, to leave flexibility"_ — STOP. Vague criteria are the #1 reason unattended runs drift. Be specific and testable.
- _"The acceptance criteria don't say how to check it"_ — STOP. Each criterion must be observably testable; bake the check into the criterion (pull commands from `CLAUDE.md` if relevant). A criterion an agent can't verify is a top cause of drift.
- _"I didn't ask about out-of-scope because the user didn't mention it"_ — STOP. Ask. Out-of-scope is where tickets silently fail.
- _"I'll ask the user to list what's NOT in scope"_ — STOP. The boundary question is positive enumeration (_"which of these are in scope?"_); derive Out-of-scope from what they didn't mark.
- _"The user stated an outcome and I'm writing a mechanism"_ — STOP. `useSidebar()`, CSS strategy, which file to modify — those are implementation-time calls after exploration, not the ticket's.
- _"The criterion says 'document the runbook' — the agent can just put it in the PR."_ — STOP. Deliverables are committed files. Phrase it to land in the repo (e.g. `docs/…`), not the MR body — body prose isn't versioned and fails review.
