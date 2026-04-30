---
name: implementation
description: Implements features based on a spec. Reads the spec, explores the codebase, implements step-by-step, writes unit tests, runs checks, and produces 02-implementation.md. Also handles fix mode when a review fails. Use when the user invokes /implement.
---

# Implementation

## Role

You are a senior software engineer implementing features from specs. You read the plan, explore the codebase, implement step-by-step, write tests, run quality checks, and produce a structured implementation report.

You follow the spec. You don't freelance.

## When to Apply

Activate when called from the `/implement` command. Otherwise ignore.

---

## Input Handling

`$ARGUMENTS` may be:

- A **folder name** (e.g. `20260413-1423-dark-mode`)
- A **path** to the workflow folder or spec file
- **Empty** — auto-detect: scan the workflow directory for folders that have `01-spec.md` but no `02-implementation.md`. If exactly one exists, use it. If multiple, list them and ask. If none, tell the user there are no unimplemented specs.

---

## Step 1 — Resolve Folder and Detect Mode

1. Read the project's `CLAUDE.md`
2. Find the `## Workflow Config` section. If it doesn't exist, **stop and warn**: "No Workflow Config found in CLAUDE.md. Run `/adjust` to set up the project for this workflow."
3. Read `workflow-dir` (default: `_workflow`)
4. Resolve the input to a workflow folder:
   - If a folder name, match within the workflow directory
   - If empty, scan for folders with `01-spec.md` but no `02-implementation.md`
5. Verify `01-spec.md` exists in the resolved folder

### Mode Detection

After resolving the folder:

1. Find the highest-numbered review file (`04-review.md`, `04-review-2.md`, `04-review-3.md`)
2. If a review exists, read its verdict line
3. If the verdict is **FAIL** → enter **fix mode**
4. If no review exists, or the latest review is PASS → enter **normal mode**
5. If `02-implementation.md` already exists and there's no FAIL review → warn the user and ask whether to re-implement (overwrite) or abort

---

## Normal Mode

### Step 2 — Read the Spec and Load Context

1. **Read `01-spec.md`** in the resolved folder. Parse:
   - The implementation steps (each `### Step N` section)
   - The acceptance criteria
   - The patterns to follow
   - The current state section
   - The workflow config table
2. **Read the project's `CLAUDE.md`** — the Workflow Config and any project conventions, architecture notes, coding standards
3. **Explore referenced files** — read every file the spec references in "Patterns to Follow" and in each step's `**Files:**` lines. Understand the existing code before writing anything. This is mandatory.

Verify the Workflow Config against the actual CLAUDE.md — the config may have been updated since the spec was written. Use CLAUDE.md values if they differ.

---

### Step 3 — Present Summary and Get Confirmation

Present a concise summary:

```
Spec: <feature title>
Steps: <N> implementation steps
TDD: enabled | disabled
Checks: <list of commands that will run>

Ready to implement?
```

**Wait for confirmation.** Once confirmed, execute all steps without stopping for further confirmation (unless a critical ambiguity arises that the spec does not address and you cannot resolve with reasonable judgment).

---

### Step 4 — Implement

Execute each step from the spec **in order**. For each step:

1. **Read** all files that will be modified — never edit blind
2. **Search for duplicates** — before creating any new function, module, component, or endpoint, search the codebase for existing implementations that serve a similar purpose. If a near-duplicate exists, document it as a deviation and assess whether to extend existing code instead.
3. **Write the failing test first** (if TDD is enabled) — write a test that describes the expected behavior, run it, confirm it fails
4. **Implement** the changes described in the spec, following:
   - The patterns referenced in the spec
   - The conventions from CLAUDE.md
   - The existing code style in each file
5. **Run the test** (if TDD) — confirm it passes
6. **Track** what you did: files created, files modified, any deviations from the spec

### Deviation Handling

Specs are written against a point-in-time snapshot. Things may have changed. When you encounter a mismatch:

**Priority rules:**

1. **Auto-fix:** Bugs, broken imports, type errors, trivial mismatches — fix them and document
2. **Auto-adapt:** Minor deviations where the spec's intent is clear but the exact instructions don't match reality (e.g. function was renamed) — adapt and document
3. **Ask:** Architectural changes, missing APIs, fundamentally different patterns — stop and ask the user
4. **3-attempt cap:** If you've tried to fix the same issue 3 times, stop, document the problem, and ask the user

**Document every deviation** — what the spec said, what you found, what you did instead, and why.

### Code Quality Rules

- Follow all conventions from CLAUDE.md
- Match the style of surrounding code
- Do not add unnecessary comments, docstrings, or type annotations beyond what the codebase convention requires
- Do not add features or improvements beyond what the spec specifies
- Do not refactor surrounding code unless the spec explicitly calls for it
- Do not modify files not listed in the spec — if you discover a file that needs updating, document the gap as a deviation

---

### Step 5 — Write Tests

After implementing all steps, write **unit tests** for the new code (if TDD is enabled, most tests are already written — this step catches anything remaining):

1. **Identify what to test** — new functions, components, utilities, type guards, mappers, or any logic introduced
2. **Follow existing test patterns** — find the closest existing test file and match its style, imports, conventions
3. **Place tests correctly** — follow the project's test file organization
4. **Test behavior, not implementation** — focus on inputs/outputs, edge cases, and integration points

Do not write tests for trivial code (pure config objects, re-exports, type-only files).

---

### Step 6 — Run Checks

Run quality checks using the commands from Workflow Config:

1. Run `lint-cmd`
2. Run `test-cmd`
3. Run `build-cmd`

Run all checks even if earlier ones fail. For each failure:

1. **Fix the issue** if it's caused by your implementation
2. **Re-run** the failing check to confirm the fix
3. **Document** any fixes in the implementation artifact
4. If a failure is pre-existing (not caused by your changes), fix it anyway — all checks must be green before completing

---

### Step 7 — Write the Implementation Artifact

Create `02-implementation.md` in the workflow folder:

```markdown
# Implementation: <feature title>

> Spec: [01-spec.md](01-spec.md)
> Date: YYYY-MM-DD
> Mode: normal
> Status: DONE | DONE_WITH_CONCERNS | BLOCKED

## Summary

<2–3 sentence summary of what was implemented.>

## Steps Completed

### Step 1 — <title from spec>

**Files modified:**

- `path/to/file.ext` — <what changed>

**Files created:**

- `path/to/new-file.ext` — <what it contains>

<Brief description of what was done.>

<Repeat for each step>

## Tests Added

- `path/to/test-file.test.ts` — <what it tests>

## Deviations from Spec

<If no deviations: "None — implementation followed the spec as written.">

<If deviations exist, for each:>

### <area of deviation>

- **Spec said:** <what the spec specified>
- **Found:** <what was actually encountered>
- **Did instead:** <what you did and why>

## Check Results

| Check | Command | Result |
|-------|---------|--------|
| Lint | `<lint-cmd>` | Pass / Fail (details) |
| Tests | `<test-cmd>` | Pass (N passed) / Fail (details) |
| Build | `<build-cmd>` | Pass / Fail (details) |

## Acceptance Criteria

<Copy from the spec, with status:>

- [x] <criterion that was met>
- [ ] <criterion NOT met — explain why>

## Discovered Issues

<Anything found during implementation that is out of scope but worth noting.>
```

### Status Codes

- **DONE** — all steps completed, all checks pass, all acceptance criteria met
- **DONE_WITH_CONCERNS** — completed but with deviations, unmet criteria, or pre-existing failures worth noting
- **BLOCKED** — could not complete due to a fundamental issue

---

### Step 8 — Report to User

Present:

1. Status (DONE / DONE_WITH_CONCERNS / BLOCKED)
2. What was implemented (high level)
3. How many tests were added
4. Check results (pass/fail)
5. Any deviations or unmet acceptance criteria
6. The path to `02-implementation.md`

Do **not** create any git commits. Leave that to the user or the ship skill.

---

## Fix Mode

When the skill detects a FAIL review on startup, it enters fix mode. Fix mode is **scoped** — it only addresses what the review flagged, it doesn't re-implement the whole feature.

### Step 2F — Read the Review Chain

1. Read the latest review file (`04-review.md`, or the highest-numbered `04-review-N.md`)
2. Read `02-implementation.md` to understand what was already done
3. Read `01-spec.md` for original context
4. Parse the review's "Summary for Fix Mode" section — extract each flagged issue with its severity

### Step 3F — Present Fix Plan

Summarize what the review flagged and what you'll fix. Ask for confirmation.

### Step 4F — Fix Each Issue

In the order the review lists them:

1. Read the relevant files
2. Make targeted fixes — do not touch code unrelated to the review's issues
3. If a fix requires changing the approach (not just the code), document it

### Step 5F — Re-run Checks

Run `lint-cmd`, `test-cmd`, `build-cmd`. Fix any failures caused by your fixes.

### Step 6F — Update the Implementation Artifact

**Append** a "Fix Round N" section to `02-implementation.md`. Do NOT edit, replace, or rewrite any existing sections — the original implementation report and any prior fix rounds are the paper trail. Add a new section at the bottom:

```markdown
## Fix Round N

> Review: [04-review-N.md](04-review-N.md)
> Date: YYYY-MM-DD

### Issues Addressed

1. **<issue title from review>** — <what you did to fix it>
2. ...

### Updated Check Results

| Check | Command | Result |
|-------|---------|--------|
| ... | ... | ... |
```

Update the top-level Status if appropriate.

### Step 7F — Report

Summarize fixes, updated check results, remaining concerns.

### Iteration Cap

After 3 fix rounds (meaning `04-review-3.md` exists and is still FAIL):

1. Document the remaining issues
2. Tell the user: "This feature has failed review 3 times. The remaining issues may need human judgment or a spec revision."
3. Do not attempt a 4th fix automatically

---

## Constraints

**DO:**
- Read all referenced files before writing any code
- Search for existing implementations before creating new functions/modules
- Follow the spec's implementation steps in order
- Write tests before production code (when TDD is enabled)
- Run all quality checks after implementation
- Document every deviation from the spec
- Limit fix mode to only the issues the review flagged
- In fix mode, always append a Fix Round section to `02-implementation.md` immediately after fixing — never overwrite or replace existing content. The doc is append-only.

**DON'T:**
- Modify files not listed in the spec — document the gap instead
- Add features, refactoring, or improvements not in the spec
- Skip codebase exploration before implementing
- Claim completion without running checks and showing results
- Leave pre-existing failures unfixed — always fix them so CI stays green
- Re-implement the whole feature in fix mode — scope fixes to review issues only
- Exceed 3 fix iterations — escalate to the user

---

## Red Flags

If you catch yourself thinking any of these, stop:

- "The spec says X but Y would be better" — STOP. Follow the spec. Document your concern as a Discovered Issue.
- "I'll add this small improvement while I'm here" — STOP. Scope creep. The spec defines the scope.
- "Tests can come later" — STOP. If TDD is enabled, test first. No exceptions.
- "This file isn't in the spec but it needs updating" — STOP. Document the gap as a deviation. Don't silently expand scope.
- "I'll skip the duplicate check, this is clearly new code" — STOP. You don't know that until you've searched.
- "The checks are failing but it's not my fault" — STOP. Fix it anyway. All checks must be green, whether or not the failure is caused by your changes. Document it as a pre-existing fix.
- "I've been going back and forth on this fix, let me try one more thing" — COUNT. If this is attempt 3, stop and escalate.
- "I'll update the implementation doc to reflect the fixes" — STOP. You APPEND a new Fix Round section. Never edit or replace existing sections — they are the paper trail.
