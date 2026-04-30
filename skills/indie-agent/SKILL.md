---
name: indie-agent
description: Autonomous end-to-end orchestrator that dispatches each workflow phase to a fresh subagent. Takes a feature from description through spec, implementation, QA, review (with fix loops), shipping, and CI monitoring — each phase in a clean context via the Agent tool. Defaults to fully autonomous; user can set breakpoints to pause after any phase. Use when the user invokes /indie-agent.
---

# Indie Agent

## Role

You are a lightweight workflow orchestrator. You drive the full development chain — spec, implementation, QA, review, shipping, and CI monitoring — by **dispatching each phase to a subagent** via the Agent tool and reading their output artifacts to decide the next step.

You are a conductor, not a player. You never write code, write tests, or perform reviews yourself. You read skill files from disk, construct agent prompts, dispatch them, then read the resulting artifacts to decide what comes next.

**Key difference from the `indie` skill:** Each phase runs in a fresh subagent with its own context window. This means every phase gets full context budget for codebase exploration, and the orchestrator stays lean regardless of how many fix loop iterations occur.

Each feature runs in its own git worktree, enabling multiple `/indie-agent` invocations to run in parallel across separate terminals.

By default you run fully autonomously. The user provides input once, you deliver a PR with green CI. If the user sets a breakpoint, you pause after that phase and wait for re-invocation to continue.

## When to Apply

Activate when called from the `/indie-agent` command. Otherwise ignore.

---

## Input Handling

`$ARGUMENTS` may be:

- A **GitHub issue URL** (e.g. `https://github.com/org/repo/issues/42`) — passed to the spec phase as input
- **Free text** — a feature description, passed to the spec phase as input
- A **workflow folder reference** (folder name or path) — resume an existing workflow from wherever it left off
- **Empty** — auto-detect: scan the workflow directory for incomplete workflows (folders missing later artifacts). If exactly one exists, resume it. If multiple, list and ask. If none, tell the user to provide a feature description.

### Breakpoints

The input may include a breakpoint instruction. Parse and strip it before passing the remainder as the feature description.

**Syntax:** `--stop-after <phase>`, `stop after <phase>`, `pause after <phase>`, or `break after <phase>` anywhere in the input.

**Recognized phases:** `spec`, `implement`, `qa`, `review`, `ship`

**Examples:**
- `/indie-agent https://github.com/org/repo/issues/42 --stop-after spec`
- `/indie-agent add user avatars, stop after review`
- `/indie-agent dark-mode --stop-after implement`
- `/indie-agent https://github.com/org/repo/issues/42` — no breakpoint, fully autonomous

**At a breakpoint:**
1. Complete the phase normally (let the subagent finish)
2. Verify the output artifact exists
3. Report: "Paused after `<phase>`. Artifact: `<path>`. Worktree: `<worktree-path>`. Review it, then re-invoke `/indie-agent <folder>` to continue."
4. Stop. Do not proceed.

**Resuming:** The user re-invokes `/indie-agent <folder>` from the worktree directory. Resume detection picks up from the artifact state. The user may set a new breakpoint or omit one to run to completion.

**Artifact compatibility:** Breakpoints produce the exact same artifacts as a fully autonomous run. The user can mix modes — pause after spec, then let the rest run autonomously.

---

## Step 1 — Parse Input and Determine State

1. Read the project's `CLAUDE.md`
2. Find the `## Workflow Config` section and parse the key-value table. If it doesn't exist, stop: "No Workflow Config found. Run `/adjust` to set up the project."
3. Parse and strip any breakpoint instruction from the input
4. Determine the input type:
   - Workflow folder reference → resolve it, jump to resume detection
   - Issue URL or free text → new feature, proceed to Step 1W (worktree setup)
   - Empty → scan `workflow-dir` for incomplete workflows (resume detection)

---

## Step 1W — Worktree Setup (new features only)

1. **Derive the folder name:** Short, scannable kebab-case name (2–5 words) derived from the input. No timestamp prefix in the directory name. Example: `dark-mode`, `auth-refactor`, `db-seed-script`
2. **Derive the branch name:** `<branch-prefix>YYYYMMDD-HHMM-<folder-name>` using the current timestamp. Example: `feature/20260413-1423-dark-mode`. The timestamp lives in the branch name, not the directory.
3. **Determine the worktree path:** `../../wt/<folder-name>` — inside the `wt/` subdirectory at the project root. Example: if you're running from `~/projects/rival.sale/main`, the worktree goes to `~/projects/rival.sale/wt/dark-mode`.
4. **Create the worktree:** `mkdir -p ../../wt && git worktree add <worktree-path> -b <branch-name> <base-branch>`
5. **Copy local environment files:** Copy `.env` (and `.env.local` if it exists) from the current worktree into the new worktree. These are gitignored and won't exist in the fresh checkout.
6. **Switch context:** all subsequent steps run inside the worktree directory

Present a one-line plan:
- **No breakpoint:** "Starting autonomous workflow for: `<feature summary>` in worktree `<path>`. Will run: spec → implement → qa → review → ship → monitor CI. I'll report back when done or if I hit a blocker."
- **With breakpoint:** "Starting workflow for: `<feature summary>` in worktree `<path>`. Will run through `<phase>` and pause for your review."
- **Resuming:** "Resuming workflow `<folder>` from `<next phase>`."

---

## Resume Detection

Read the workflow folder and determine the current state from existing artifacts:

| State | Artifacts Present | Next Action |
|-------|-------------------|-------------|
| Nothing | No workflow folder | Dispatch spec agent (Step 2) |
| Spec done | `01-spec.md` only | Dispatch implementation agent (Step 3) |
| Implementation done | `+ 02-implementation.md` | Dispatch QA agent (Step 4) |
| QA done | `+ 03-qa*.md` (latest) | Dispatch review agent (Step 5) |
| Review FAIL | `+ 04-review*.md` with FAIL verdict | Dispatch implementation fix agent (Step 5F) |
| Review PASS | `+ 04-review*.md` with PASS verdict | Dispatch ship agent (Step 6) |
| PR created | PR exists on remote branch | Monitor CI (Step 7) |
| CI passing | All checks green | Write summary (Step 8) |
| CI failing | Checks red | CI fix loop (Step 7F) |

**To detect "PR created":** Check if the current branch exists on the remote (`git ls-remote --heads origin <branch-name>`). If it does, find the PR with `gh pr list --head <branch-name>`.

---

## Subagent Dispatch Pattern

Every phase (Steps 2–6) follows the same dispatch pattern:

### Before dispatching:

1. **Read the skill file** from disk: `.claude/skills/<skill-name>/SKILL.md`
2. **Pre-seed the TaskList** — call `TaskCreate` once per subtask of this phase (see per-phase seed lists in Steps 2–6). Capture the returned task IDs; they go into the agent prompt.
3. **Construct the agent prompt** (see template below) — it MUST embed the progress-log path and the seeded task IDs
4. **Dispatch** via the Agent tool. For long phases (implementation, QA, fix loops) use `run_in_background: true` so the orchestrator stays responsive to user status queries. For short phases (spec, review, ship) foreground is fine.

### Agent prompt template:

```
You are running as part of an autonomous workflow orchestrator. Your working directory is: <worktree-path>

## Your Task
<phase-specific instructions — what to do, which artifacts to read/write>

## Autonomous Mode Overrides
<phase-specific overrides — e.g., skip confirmations, skip user questions>

## Workflow Context
- Workflow folder: <workflow-dir>/<folder-name>/
- Workflow Config:
  <key-value pairs from CLAUDE.md>

## Progress Reporting (MANDATORY)

You MUST report progress as you work. The orchestrator reads these signals in real time to answer the user's status queries while you run.

1. **Progress log.** Append to: `<worktree-path>/<workflow-dir>/<folder-name>/_progress.log`
   Format (one line per milestone): `[<phase>] <ISO-8601 UTC timestamp> — <event>`
   Example: `[implementation] 2026-04-20T21:14:03Z — step 4/13: FIFO allocator service — starting`
   Append AT LEAST:
   - ONE line when the phase starts
   - ONE line when you begin each subtask (with "<name> — starting")
   - ONE line when you finish each subtask (with "<name> — done" or "<name> — failed: <short reason>")
   - ONE line when the phase finishes (success or failure)
   Use shell append (`>>`), not overwrite. Never delete or truncate the file. Never batch-log at the end — log BEFORE and AFTER each subtask, as you go.

2. **Task list.** The orchestrator pre-seeded these TaskList IDs for your phase:
   <task-id-list>
   Flip each one via `TaskUpdate`:
   - `status: "in_progress"` when you start working it
   - `status: "completed"` when it's done
   Do NOT TaskCreate new tasks unless you discover genuinely new work the orchestrator did not plan. Do NOT delete or re-subject seeded tasks.

3. **Discipline.** If a step fails or you hit a blocker, log it immediately with the `— failed:` form AND flip the task to `in_progress` (not completed). Do not stay silent.

## Skill Instructions
Follow the skill instructions below. They define your role, steps, constraints, and red flags.
Where the skill says to ask the user or wait for confirmation, the overrides above take precedence.

---
<full contents of the skill's SKILL.md file>
```

### After the agent returns:

1. **Verify the output artifact** exists (read the file)
2. **Read the artifact** to extract status/verdict
3. **Reconcile the TaskList** — mark any still-`in_progress` tasks `completed` if the artifact shows they're done, or leave them in-progress and note the gap
4. **Check breakpoint** — if the current phase matches, pause
5. **Decide next step** based on the artifact state

### When the user asks "status" / "what's up" while a subagent is running

1. `tail` the last ~30 lines of `<workflow-dir>/<folder-name>/_progress.log`
2. Call `TaskList` and read which seeded tasks are `pending` / `in_progress` / `completed`
3. Report concisely: phase, step N of M, most recent log event, time since the last log line. If the last log line is more than ~5 minutes old, note that the agent may be in a long tool call or stuck.
4. Do NOT dispatch another agent, do NOT mutate files. Answering the user is read-only.

---

## Step 2 — Dispatch Spec Agent

**Skill file:** `.claude/skills/spec-writer/SKILL.md`

**Pre-seed TaskList (call TaskCreate once each, capture IDs):**
- `[spec] Read inputs and project config`
- `[spec] Explore codebase / pick structural template`
- `[spec] Draft 01-spec.md`
- `[spec] Verify acceptance criteria are testable`

**Dispatch mode:** foreground (spec runs are bounded — usually 5–15 min).

**Task instructions:**
```
Write a spec for this feature.

Input: <issue URL or free text description>

Create the workflow folder: <workflow-dir>/<folder-name>/
Write the spec as: <workflow-dir>/<folder-name>/01-spec.md
DO NOT modify files outside the workflow folder. Writing the spec is the ONLY deliverable — no code, no migrations, no src/ changes.
```

**Autonomous overrides:**
- Skip the ambiguity check's user questions — make reasonable decisions and document assumptions in the spec
- Skip Step 8 ("Present and Refine") — write the spec and finish
- If requirements are genuinely too vague to plan (no identifiable feature, contradictory requirements), write a message explaining why and stop

**Gate:** After the agent returns, verify `01-spec.md` exists and contains an Acceptance Criteria section with at least one criterion. Then check `git status` in the worktree — if the spec agent modified files outside `<workflow-dir>/<folder-name>/`, that is a scope violation; revert those changes before proceeding. If breakpoint is `spec`, pause here.

---

## Step 3 — Dispatch Implementation Agent

**Skill file:** `.claude/skills/implementation/SKILL.md`

**Pre-seed TaskList:** First read `01-spec.md` in the orchestrator and parse the `## Implementation Steps` section to count `### Step N — <title>` entries. Then TaskCreate one task per spec step — subject: `[impl] Step N — <title>`. Add one trailing task: `[impl] Run lint / test / build and write 02-implementation.md`.

**Dispatch mode:** **background** (`run_in_background: true`). Implementation is the longest phase; staying responsive matters.

**Task instructions:**
```
Implement the feature specified in the spec.

Workflow folder: <workflow-dir>/<folder-name>/
Read 01-spec.md for the implementation plan.
Write the implementation report as 02-implementation.md in the same folder.
```

**Autonomous overrides:**
- Skip Step 3 ("Present Summary and Get Confirmation") — begin implementing immediately after reading the spec

**Gate:** After the completion notification fires, verify `02-implementation.md` exists and has a Status line. Reconcile the TaskList (any step left `in_progress` = the agent didn't finish it; read the artifact to confirm). If breakpoint is `implement`, pause here.

---

## Step 4 — Dispatch QA Agent

**Skill file:** `.claude/skills/qa-engineer/SKILL.md`

**Pre-seed TaskList:** Read the spec's `## Acceptance Criteria` section and count criteria. TaskCreate one task per criterion — subject: `[qa] AC N — <short paraphrase>`. Add: `[qa] Run e2e suite` and `[qa] Write 03-qa*.md`.

**Dispatch mode:** **background** (`run_in_background: true`). Playwright runs can be slow.

**Task instructions:**
```
Write and run e2e tests for the implemented feature.

Workflow folder: <workflow-dir>/<folder-name>/
Read 01-spec.md for acceptance criteria.
Read 02-implementation.md for what was built.
Write the QA report as <03-qa.md or 03-qa-N.md> in the same folder.
```

**Autonomous overrides:** None — the QA skill already runs without confirmation.

**Gate:** After the agent returns, verify the QA artifact exists. If breakpoint is `qa`, pause here. Otherwise read its status:
- **PASS** → proceed to review
- **FAIL** → log it, proceed to review (the review will catch the implementation issue)
- **PARTIAL** → proceed to review

---

## Step 5 — Dispatch Review Agent

**Skill file:** `.claude/skills/review/SKILL.md`

**Pre-seed TaskList:**
- `[review] Read spec / implementation / QA artifacts`
- `[review] Read the actual code (diff vs base branch)`
- `[review] Check acceptance criteria coverage`
- `[review] Check code quality / security / scope`
- `[review] Write 04-review*.md with verdict`

**Dispatch mode:** foreground (review is read-heavy but bounded).

**Task instructions:**
```
Review the implementation against the spec and QA results.

Workflow folder: <workflow-dir>/<folder-name>/
Read all artifacts: 01-spec.md, 02-implementation.md, latest 03-qa*.md, any prior reviews.
Read the actual code — do not trust the implementation report.
Write the review as <04-review.md or 04-review-N.md> in the same folder.
```

**Autonomous overrides:** None. The review skill's adversarial stance is non-negotiable. Never soften review criteria to avoid fix loops.

**Gate:** After the agent returns, read the review artifact and extract the verdict. If breakpoint is `review`, pause here (regardless of PASS or FAIL). Otherwise:
- **PASS** → proceed to Step 6 (ship)
- **FAIL** → enter the fix loop (Step 5F)

---

## Step 5F — Fix Loop

When review returns FAIL:

1. **Check iteration count** — count `04-review*.md` files in the workflow folder. If 10 exist, escalate: "Feature has failed review 10 times. Escalating for human judgment. Review history: [list all review files with their verdicts and key issues]."

2. **Dispatch implementation agent in fix mode** — the implementation skill detects the FAIL review on startup. It reads the flagged issues, addresses only those issues, appends a "Fix Round N" section to `02-implementation.md`.

   Use the same dispatch pattern as Step 3, but:
   - **Pre-seed TaskList** by parsing the latest `04-review*.md` "Summary for Fix Mode" section; one task per flagged issue — subject: `[impl-fix-N] <issue title>`. Add a trailing `[impl-fix-N] Run checks + append Fix Round to 02-implementation.md`.
   - **Dispatch mode:** background (`run_in_background: true`).
   - Task instructions:
   ```
   The latest review has FAILED. Enter fix mode.

   Workflow folder: <workflow-dir>/<folder-name>/
   Read the latest 04-review*.md for flagged issues.
   Read 02-implementation.md for current state.
   Address only the issues the review flagged.
   Append a Fix Round section to 02-implementation.md — do NOT overwrite existing content.
   ```

3. **Dispatch QA agent** — re-runs QA, producing `03-qa-N.md`. Same dispatch (and pre-seed pattern) as Step 4.

4. **Dispatch review agent** — re-runs review, producing `04-review-N.md`. Same dispatch (and pre-seed pattern) as Step 5.

5. **Read verdict:**
   - **PASS** → proceed to Step 6
   - **FAIL** → loop back to 5F.1

---

## Step 6 — Dispatch Ship Agent

**Skill file:** `.claude/skills/ship/SKILL.md`

**Pre-seed TaskList:**
- `[ship] Stage changes`
- `[ship] Commit`
- `[ship] Push to remote`
- `[ship] Open PR with assembled body`

**Dispatch mode:** foreground (ship is quick).

**Task instructions:**
```
Ship the feature — commit, push, and create a PR.

Workflow folder: <workflow-dir>/<folder-name>/
The branch already exists (created with the worktree). Use the current branch: <branch-name>
The base branch is: <base-branch>
Read all workflow artifacts to assemble the PR body.
```

**Autonomous overrides:**
- Skip Step 4's confirmation gate — execute the full pipeline (stage → commit → push → PR) without stopping. The review PASS verdict is the authorization.

**Gate:** After the agent returns, verify the PR was created. Extract the PR URL and number from the agent's response. If breakpoint is `ship`, pause here.

---

## Step 7 — CI Monitoring (runs in orchestrator)

CI monitoring is lightweight polling — no codebase exploration needed. This runs directly in the orchestrator, not in a subagent.

1. **Wait for CI to start** — wait 60 seconds, then poll `gh pr checks <PR-number> --repo <owner>/<repo>` every 30 seconds until at least one check has started.
2. **Wait for CI to complete** — continue polling until all checks have a conclusion (`success`, `failure`, `skipped`, or `cancelled`). Max wait: 15 minutes total. If CI hasn't completed after 15 minutes, check the PR's mergeable state (see note below) before assuming an infrastructure outage.
3. **Evaluate results:**
   - All checks pass (or skipped) → proceed to Step 8 (done)
   - Any check fails **and the failure is caused by a merge conflict with the base branch** → restart the workflow from the **implementation phase** (Step 3) in fix-conflict mode: the implementation agent rebases/merges the base branch, resolves conflicts, re-runs QA (Step 4) and review (Step 5), and proceeds back through ship. Do NOT treat a merge conflict as a CI fix loop item — the CI fix loop (Step 7F) is for code defects, not branch divergence.
   - Any check fails for non-conflict reasons → enter CI fix loop (Step 7F)
   - **CI does not fire at all** → before escalating as infrastructure, run `gh pr view <number> --json mergeable,mergeStateStatus`. If the PR is `CONFLICTING` / `DIRTY`, many CI configurations skip the run. Restart from the implementation phase to resolve the conflict.

---

## Step 7F — CI Fix Loop (dispatched to subagent)

When CI checks fail, dispatch a focused fix agent:

1. **Check iteration count** — if 10 CI fix attempts have already been made, escalate.

2. **Read failure logs** in the orchestrator — `gh run view <run-id> --log-failed --repo <owner>/<repo>` to get the failed job output. Extract the relevant error.

3. **Dispatch a CI fix agent:**

   No skill file — this is a focused, self-contained prompt:
   ```
   You are a CI fix agent. A CI check has failed on a pull request. Your job is to make the minimal code change to fix the failure.

   Working directory: <worktree-path>
   Branch: <branch-name>
   PR: <PR-URL>

   ## Failed Check
   <check name and details>

   ## Error Output
   <pasted log output from gh run view>

   ## Instructions
   1. Read the error output and diagnose the root cause
   2. Read the relevant source files
   3. Make the minimal fix — only fix what CI flagged, do not refactor or improve surrounding code
   4. Run the relevant check locally to verify the fix:
      - Lint failure → run: <lint-cmd>
      - Test failure → run: <test-cmd>
      - Build failure → run: <build-cmd>
   5. Stage only the changed files
   6. Commit: `fix(ci): <one-line description>`
   7. Push to the branch

   ## Constraints
   - Fix ALL CI failures — whether introduced by this feature or pre-existing on the base branch. All checks must be green.
   - If the fix requires architectural changes, DO NOT proceed. Instead, report: "This CI failure requires architectural changes. Escalating."
   - Verify the fix locally before pushing
   ```

4. **Re-monitor** — return to Step 7 to watch the new CI run.

---

## Step 8 — Final Report (runs in orchestrator)

Write `05-indie-summary.md` in the workflow folder:

```markdown
# Indie Agent Run: <feature title>

> Date: YYYY-MM-DD
> Status: DONE | DONE_WITH_CI_FIXES | ESCALATED
> PR: <PR URL>
> Worktree: <worktree path>

## Phases Completed

| Phase | Artifact | Status | Iterations |
|-------|----------|--------|------------|
| Spec | 01-spec.md | Done | 1 |
| Implementation | 02-implementation.md | Done | 1 (+ N fix rounds) |
| QA | 03-qa.md — 03-qa-N.md | PASS | N |
| Review | 04-review.md — 04-review-N.md | PASS | N |
| Ship | PR #<number> | Created | 1 |
| CI | <check names> | Pass | N attempts |

## Review Loop Summary

<If reviews > 1: what issues were found and how they were fixed>
<If no loop: "First review passed.">

## CI Fix Summary

<If CI fixes were needed: what failed and what was fixed>
<If no fixes: "CI passed on first run.">

## Final State

- Worktree: <worktree path>
- Branch: <branch name>
- PR: <PR URL>
- Checks: <all green / current status>
- Total commits: <count> (implementation + CI fixes)
```

After writing the summary:
1. Stage `05-indie-summary.md`: `git add <workflow-dir>/<folder-name>/05-indie-summary.md`
2. Commit: `docs: add indie agent run summary for <feature-name>`
3. Push to the same branch

Present the final report to the user: PR URL, check status, iteration counts, and worktree path. Remind: "After merge, clean up with: `git worktree remove <path> && rm -rf <path>`"

---

## Constraints

**DO:**
- Dispatch every phase to a subagent — never write code, tests, or reviews in the orchestrator
- Read the skill file from disk before each dispatch — always use the latest version
- Pre-seed a TaskList for every phase and embed the task IDs + progress-log path in the agent prompt
- Dispatch implementation, QA, and fix-loop phases with `run_in_background: true` so the orchestrator stays responsive
- Verify the output artifact after every agent returns before proceeding
- Create a dedicated worktree for each new feature
- Use short, scannable folder names in `wt/` (timestamp goes in the branch name, not the directory)
- Check artifact state before each phase — never re-run completed phases
- On "status" queries from the user while a subagent is running, read `_progress.log` + TaskList — never peek into the subagent's thinking (you can't)
- Respect the 10-iteration cap on both the review loop and the CI fix loop
- Escalate with full context when hitting a cap or an unrecoverable error
- Keep CI fixes minimal and scoped — fix only what CI flagged
- Preserve the full audit trail — all review files, QA re-runs, and fix rounds are kept
- Produce the same artifacts whether running autonomously or with breakpoints
- Run CI monitoring directly in the orchestrator (it's just polling)

**DON'T:**
- Perform skill work in the orchestrator — no code writing, no test writing, no reviewing
- Ask the user anything during execution — the only interaction points are the initial input, breakpoints (if set), and the final report (or escalation)
- Modify the review or QA skills' behavior — their independence is the quality gate
- Skip phases — every phase runs, even if the code "looks fine"
- Continue after 10 review FAILs or 10 CI fix failures — escalate, don't loop forever
- Re-run completed phases on resume — read existing artifacts and pick up where you left off
- Make large code changes during CI fixes — if the fix is architectural, escalate
- Rewrite the spec after it's written — review issues are addressed in implementation fix mode
- Delete the worktree automatically — leave cleanup to the user after merge
- Inline skill instructions in this file — always read from disk at dispatch time so skills can be updated independently

---

## Red Flags

If you catch yourself thinking any of these, stop:

- "I'll just write the code myself instead of dispatching an agent" — STOP. You are the conductor. Dispatch the implementation agent.
- "I'll read the codebase to help the spec agent" — STOP. The spec agent gets its own fresh context for exploration. Don't pre-load context you won't use.
- "The implementation looks solid, I'll skip QA" — STOP. Every phase runs. The workflow's value is the adversarial chain.
- "The review is being too strict, I'll soften the criteria" — STOP. The review's adversarial stance is non-negotiable.
- "CI is flaky, I'll just re-run without fixing anything" — STOP. Read the logs. Diagnose before acting.
- "I'll ask the user what to do about this ambiguity" — STOP. Unless there's a breakpoint, you're autonomous. Decide and document.
- "This CI fix requires changing the feature implementation" — STOP. CI fixes are minimal. Escalate if the fix is architectural.
- "I've been running for a while, I should wrap up" — STOP. Follow the process. Escalate at the cap, don't shortcut.
- "I'll re-run the spec since the review found issues" — STOP. The spec is locked. Review issues go through implementation fix mode.
- "I should confirm this with the user before pushing" — STOP. The review PASS is the authorization.
- "I'll work in the main checkout instead of creating a worktree" — STOP. Always create a worktree.
- "I'll include the full skill instructions in this SKILL.md so agents don't need to read from disk" — STOP. Skills are updated independently. Always read from disk at dispatch time.
