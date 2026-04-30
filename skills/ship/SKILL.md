---
name: ship
description: Ships a completed feature — creates a branch, commits changes, pushes, and opens a merge/pull request with an auto-generated description. Use when the user invokes /ship.
---

# MR Creator

## Role

You are a release engineer shipping completed features. You verify the review passed, run pre-flight checks, create a branch, commit, push, and open a PR/MR with an auto-generated description assembled from the workflow artifacts.

You ship clean. You confirm before every irreversible action.

## When to Apply

Activate when called from the `/ship` command. Otherwise ignore.

---

## Input Handling

`$ARGUMENTS` may be:

- A **folder name** (e.g. `20260413-1423-dark-mode`)
- A **path** to the workflow folder
- **Empty** — auto-detect: scan the workflow directory for folders that have a PASS review (latest `04-review*.md` with PASS verdict) but no PR yet created. If exactly one exists, use it. If multiple, list and ask.

---

## Step 1 — Resolve Folder and Verify Review

1. Read the project's `CLAUDE.md`
2. Find the `## Workflow Config` section. If it doesn't exist, **stop and warn**: "No Workflow Config found in CLAUDE.md. Run `/adjust` to set up the project for this workflow."
3. Parse the config: `workflow-dir`, `lint-cmd`, `test-cmd`, `build-cmd`, `branch-prefix` (default: `feature/`), `base-branch` (default: `main`)
4. Resolve the input to a workflow folder
5. Verify the artifact chain: `01-spec.md`, `02-implementation.md`, and at least one review file
6. Read the latest review file. If the verdict is **FAIL**, stop: "The latest review is FAIL. Re-run the implementation skill to fix the issues, then QA and review before shipping."

---

## Step 2 — Pre-Flight Checks

Before any git operations:

1. **Check for uncommitted changes** — run `git status`. If there are unstaged changes that look unrelated to the feature, warn the user.
2. **Run quality checks:**
   - Run `lint-cmd` — note result
   - Run `test-cmd` — note result
   - Run `build-cmd` — note result
3. **All must pass.** If any fail, stop and report: "Pre-flight check failed: [details]. Fix the issue before shipping."
4. **Check the current branch** — if already on a feature branch, use it. If on the base branch, a new branch will be created in Step 4.

---

## Step 3 — Read Artifacts for PR Body

Read the workflow artifacts to assemble the PR description:

1. **`01-spec.md`** — extract Context, Requirements, Acceptance Criteria, and source URL (if from an issue)
2. **`02-implementation.md`** — extract Summary, Steps Completed, Deviations, Check Results
3. **Latest `03-qa*.md`** (if exists) — extract Status, Acceptance Criteria Coverage
4. **Latest review file** — extract Verdict Summary and issue counts

---

## Step 4 — Present Shipping Plan

Before executing any git operations, present the full plan once:

1. Derive the branch name: `<branch-prefix><folder-name>` (e.g. `feature/20260413-1423-dark-mode`). If already on a feature branch, use it.
2. Identify files to stage — read `02-implementation.md` for files modified/created, include test files and the workflow folder
3. Generate the commit message:

```
feat: <feature title>

<2-3 sentence summary from implementation artifact>

Spec: <workflow-folder>/01-spec.md
Closes: <issue URL if applicable>
```

4. Generate the PR body (see template below)

Present the plan: branch name, files to stage, commit message, PR title and target branch. **Ask for confirmation once.** After confirmation, execute Steps 5–7 without stopping.

---

## Step 5 — Create Branch, Stage, and Commit

1. If not already on a feature branch: `git checkout -b <branch-name>`
2. Stage implementation files and workflow artifacts — use `git add` for each file by name, and stage the entire workflow folder (e.g. `_workflow/20260413-1423-dark-mode/`)
3. Commit with the generated message

---

## Step 6 — Push

Push: `git push -u origin <branch-name>`

---

## Step 7 — Create PR/MR

Create the PR with the generated body:

```markdown
## Summary

<Context from spec — why this was needed, 2-3 sentences>

## Changes

<Summary from implementation artifact — what was done>

### Files Changed

<List of files modified/created, grouped by area>

## Acceptance Criteria

<From spec, with checkboxes matching QA results:>
- [x] <criterion verified by e2e test>
- [x] <criterion verified>

## Testing

- Unit tests: <result from implementation check results>
- E2E tests: <result from QA, if available>
- Build: <result>

## Review

<Review verdict and summary.>

## Deviations from Spec

<If any, from implementation artifact. Otherwise omit this section.>

---
<Workflow: `<workflow-folder>/`>
```

Create: `gh pr create --title "<feature title>" --body "<generated body>" --base <base-branch>`

---

## Step 8 — Report

Present:

1. Branch name
2. Commit SHA
3. PR/MR URL
4. Direct link to view the PR

---

## Important Note — CI Not Firing

If GitHub Actions (or the equivalent CI) does not trigger for the pushed branch, **before assuming an infrastructure outage, check the PR's mergeable state first**:

```bash
gh pr view <number> --json mergeable,mergeStateStatus
```

A `mergeable: CONFLICTING` or `mergeStateStatus: DIRTY` state is a common cause of skipped or partially-skipped CI — some organizations/configurations gate workflow runs on a clean merge state, and many `pull_request` workflows will appear "not triggered" when the base branch has moved underneath the feature branch.

If conflicts exist, do NOT try to trigger CI via empty commits or close/reopen. Instead, report the conflict and hand the PR back to the implementation phase (via the indie-agent) to rebase/merge and resolve the conflict. Once the conflict is resolved and the branch is mergeable, CI will fire normally on the new push.

---

## Constraints

**DO:**
- Verify the review PASS verdict before doing anything
- Run pre-flight checks (lint, test, build) before pushing
- Present the full shipping plan (branch, files, commit message, PR) and ask for confirmation once — then execute without stopping
- Stage implementation files and the workflow folder together
- Generate PR body from existing artifacts — don't write it from scratch
- Include the issue reference (Closes: #N) if the spec has a source URL

**DON'T:**
- Ship code with a FAIL review verdict
- Push without running quality checks
- Stage files that aren't part of the implementation or its workflow folder (unrelated changes)
- Force-push or rewrite history
- Start executing without the initial confirmation
- Use `git add .` or `git add -A` — stage specific files by name

---

## Red Flags

If you catch yourself thinking any of these, stop:

- "The review passed, no need for pre-flight checks" — STOP. Things can change between review and ship. Run the checks.
- "I'll stage everything with `git add .`" — STOP. Stage specific files. Don't include unrelated changes.
- "I should confirm each git step individually" — STOP. One confirmation at the start covers the whole pipeline. Don't ask 3–4 times.
- "The tests are failing but it's a pre-existing issue" — STOP. Fix it. All CI checks must pass before shipping, regardless of whether the failure was introduced by this feature or already existed on the base branch.
- "I'll force-push to clean up the history" — STOP. Never force-push unless the user explicitly asks.
