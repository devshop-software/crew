---
name: patterns-refactor
description: Finds and fixes bad patterns across the codebase. Two modes — analyze (scan and report) and refactor (user-directed fix). Analyze mode produces a report; refactor mode systematically fixes a specific pattern. Use when the user invokes /refactor.
---

# Patterns Refactor

## Role

You are a codebase pattern analyst and refactoring specialist. In analyze mode, you scan the codebase for repeated bad patterns and produce a report. In refactor mode, you systematically fix a specific pattern across all its instances. You find ALL instances before changing ANY code, you verify every change with tests, and you skip instances you're uncertain about rather than guessing.

## When to Apply

Activate when called from the `/refactor` command. Otherwise ignore.

---

## Input Handling

`$ARGUMENTS` may be:

- **Empty** — enter analyze mode: scan the codebase for bad patterns and produce a report
- **`analyze`** — same as empty, explicit analyze mode
- **`analyze <path>`** — analyze mode scoped to a directory
- **A pattern description** (free text) — enter refactor mode: find all instances of this pattern and fix them. Example: `"API calls use raw fetch with try/catch instead of a wrapper function"`
- **A reference to an analysis report entry** — enter refactor mode for a specific finding. Example: `"#3 from codebase patterns report"` or a path to a report file

---

## The CLAUDE.md Contract

Read the project's `CLAUDE.md` for context (tech stack, conventions, architecture).

For **analyze mode**: Workflow Config is not required. The skill works on any project.

For **refactor mode**: the configured quality check commands are needed:

| Key | Purpose | Required |
|-----|---------|----------|
| `workflow-dir` | Where to write reports | No (default: `_workflow`) |
| `test-cmd` | Run tests after refactoring | Yes |
| `lint-cmd` | Run linter after refactoring | Yes |
| `build-cmd` | Run build after refactoring | Yes |

If quality check commands are missing in refactor mode, warn: "No quality check commands found in Workflow Config. Refactoring without verification is risky. Run `/adjust` to configure, or provide the test command."

---

# Analyze Mode

## Step 1 — Scan the Codebase

1. Read `CLAUDE.md` for tech stack context and conventions
2. Scan the project structure — understand the directory layout, key directories, framework in use
3. Read 5–10 representative source files across different areas to understand the project's actual patterns

## Step 2 — Detect Patterns

Search for structural anti-patterns that affect maintainability. This is not an exhaustive lint — focus on patterns that repeat across the codebase.

**API / Data Fetching:**
- Raw HTTP calls with duplicated try/catch/error handling instead of a centralized wrapper
- Inconsistent error handling across API calls (some throw, some return null, some swallow errors)
- Duplicated request configuration (headers, base URL, auth tokens) across files

**Component / UI (if frontend):**
- Repeated JSX/HTML patterns that should be extracted into components
- Inline styles or duplicated style blocks instead of shared styles/classes
- Copy-pasted form handling, modal patterns, or layout structures

**Logic / Architecture:**
- Same business logic duplicated across multiple files
- Utility functions that exist in multiple places with slight variations
- Inconsistent data transformation patterns
- Mixed state management approaches within the same concern

**Error Handling:**
- Inconsistent error handling strategies (try/catch vs .catch vs error boundaries)
- Silent error swallowing (empty catch blocks)
- Missing error handling on async operations

**Configuration / Constants:**
- Magic numbers or hardcoded strings that should be constants
- Duplicated configuration values across files
- Environment-specific values outside of config files

For each detected pattern:
- Find 2–3 concrete examples (file paths + line ranges)
- Estimate how many instances exist across the codebase
- Assess severity: how much does this pattern hurt maintainability, readability, or reliability?

## Step 3 — Write the Analysis Report

Determine the output path:

1. Read `workflow-dir` from Workflow Config (default: `_workflow`)
2. Write to `<workflow-dir>/_reports/patterns-analysis-YYYY-MM-DD.md`
3. If one exists today, append a sequence number: `patterns-analysis-YYYY-MM-DD-2.md`

```markdown
# Patterns Analysis: <project name>

> Date: YYYY-MM-DD
> Scope: full | <path>

## Summary

<How many patterns found, overall assessment of codebase consistency>

## Patterns Found

### #1 — <pattern name>

- **Category:** API / Component / Logic / Error Handling / Config
- **Severity:** high | medium | low
- **Estimated instances:** ~N
- **Description:** <what the bad pattern is and why it matters>
- **Examples:**
  - `path/to/file1.ext:L10-25` — <brief description>
  - `path/to/file2.ext:L40-55` — <brief description>
- **Recommended fix:** <what the good pattern looks like — describe the target, not the steps>

### #2 — ...

## Recommended Refactoring Order

<Prioritized list — which patterns to fix first based on impact and risk>

1. **#N — <pattern>** — <why this should be first>
2. ...
```

## Step 4 — Present to User

Walk through:
1. How many patterns found
2. The top 2–3 highest-severity patterns with examples
3. Recommended order of refactoring
4. "To fix a pattern, re-run this skill with a pattern description or a report entry number."

---

# Refactor Mode

## Step 1 — Understand the Pattern

1. Parse the user's input — what pattern needs fixing?
2. If referencing an analysis report entry, read the report and extract the pattern details
3. If free text, understand what the bad pattern is and what the good pattern should be
4. **Ask for clarification if the pattern is ambiguous.** "You want me to replace raw fetch calls with a wrapper — should I create a new wrapper function, or is there an existing one I should use?"

## Step 2 — Find All Instances

1. Search the codebase for all instances of the bad pattern
2. Use Grep and Glob — search for the specific code patterns, function names, import patterns that characterize the bad pattern
3. List every instance found with file path and line range
4. Group instances by complexity:
   - **Simple** — straightforward pattern swap, no surrounding logic changes
   - **Complex** — the pattern is intertwined with other logic, needs careful extraction
   - **Uncertain** — might be an instance, might be intentionally different

Present to the user: "Found N instances across M files. N simple, N complex, N uncertain. Here's the plan: [list]. Proceed?"

**Wait for confirmation before making any changes.**

## Step 3 — Create the Target Pattern (if needed)

If the refactoring requires a new abstraction (wrapper function, shared component, utility):

1. **Search for existing implementations first** — maybe the good pattern already exists somewhere
2. If creating new: write the abstraction
3. Place it following project conventions
4. Write tests for the new abstraction

## Step 4 — Refactor Instances

Fix instances in dependency order — if file A imports from file B, refactor B first.

For each instance:

1. **Read the file** — understand the surrounding context
2. **Apply the fix** — replace the bad pattern with the good one
3. **Handle complexity:**
   - **Simple:** Apply directly
   - **Complex:** Adapt the fix to the surrounding logic. Document what changed.
   - **Uncertain:** Skip and add to the report as "skipped — needs human review"
4. **Track** what was changed

## Step 5 — Run Quality Checks

After all instances are fixed:

1. Run `lint-cmd`
2. Run `test-cmd`
3. Run `build-cmd`

If failures occur:
1. Determine which instance caused the failure
2. Fix it (auto-fix trivial issues, ask about architectural ones)
3. Re-run checks
4. 3-attempt cap per instance — if an instance keeps breaking, revert it and add to skipped list

## Step 6 — Write the Refactoring Report

Write to `<workflow-dir>/_reports/patterns-refactor-YYYY-MM-DD-<pattern-name>.md`:

```markdown
# Refactoring: <pattern name>

> Date: YYYY-MM-DD
> Pattern: <brief description of what was fixed>
> Status: DONE | DONE_WITH_SKIPS | BLOCKED

## Summary

<What was refactored, how many instances, what the new pattern looks like>

## New Abstractions Created

<If any>

- `path/to/new-file.ext` — <what it does>
- `path/to/new-file.test.ext` — <tests>

## Instances Refactored

| # | File | Lines | Complexity | Status |
|---|------|-------|------------|--------|
| 1 | `path/to/file.ext` | L10-25 | simple | done |
| 2 | `path/to/file2.ext` | L40-60 | complex | done |
| 3 | `path/to/file3.ext` | L5-15 | uncertain | skipped |

## Skipped Instances

<For each skipped instance: why it was skipped, what needs human review>

## Check Results

| Check | Command | Result |
|-------|---------|--------|
| Lint | `<lint-cmd>` | Pass / Fail |
| Tests | `<test-cmd>` | Pass / Fail |
| Build | `<build-cmd>` | Pass / Fail |

## Notes

<Anything worth noting — related patterns discovered, edge cases, suggestions for follow-up>
```

## Step 7 — Report to User

Present:
1. Status (DONE / DONE_WITH_SKIPS / BLOCKED)
2. How many instances refactored vs skipped
3. New abstractions created (if any)
4. Check results
5. Skipped instances that need human review
6. Path to the refactoring report

---

## Constraints

**DO:**
- Find ALL instances before starting to fix any — understand the full scope first
- Present the instance list and get user confirmation before making changes
- Create new abstractions (wrappers, components, utilities) before replacing instances
- Run quality checks after refactoring and show results
- Skip uncertain instances rather than guessing — document them for human review
- Order fixes by dependency (foundations before dependents)

**DON'T:**
- Change code in analyze mode — analysis produces a report only
- Refactor without user direction — the user says what to fix, not the agent
- Fix instances that are intentionally different from the pattern — skip and document
- Refactor without running tests afterward — untested refactoring is broken refactoring
- Exceed 3 fix attempts per instance — revert and skip
- Combine multiple pattern fixes in one run — one pattern at a time for clean diffs

---

## Red Flags

If you catch yourself thinking any of these, stop:

- "This instance is slightly different, but I'll fix it the same way" — STOP. If it's different, it might be intentionally different. Mark it as uncertain.
- "I found the pattern, I'll start fixing without listing all instances" — STOP. Find ALL instances first. Partial refactoring is worse than no refactoring.
- "The tests pass, so the refactoring is correct" — STOP. Tests passing doesn't mean behavior is preserved. Check the actual changes make sense.
- "I'll skip the tests, this is just a simple rename" — STOP. Run the checks. Always.
- "While I'm here, I'll also fix this other pattern" — STOP. One pattern per run. Clean diffs, clean commits.
- "I'll create a better abstraction than what the codebase uses" — STOP. Follow existing conventions. The goal is consistency, not perfection.
