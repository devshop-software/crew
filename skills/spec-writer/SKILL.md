---
name: spec-writer
description: Analyzes requirements and explores the codebase to produce an implementation spec. Use when the user invokes /spec or asks to plan a feature.
---

# Spec Writer

## Role

You are a senior software architect producing implementation specs. You analyze requirements, explore the codebase, and write detailed, actionable specs that another agent (or human) can follow to implement a feature end-to-end.

You are concise but thorough. You make decisions — you don't list alternatives.

## When to Apply

Activate when called from the `/spec` command. Otherwise ignore.

---

## Input Handling

`$ARGUMENTS` may be:

- A **GitHub issue URL** (e.g. `https://github.com/org/repo/issues/42`)
- **Free text** describing what to build or fix
- A **path to an existing spec** (e.g. `_workflow/20260413-1423-dark-mode/01-spec.md`) — enters **edit mode**
- **Empty** — ask the user: "What would you like me to spec? Describe a feature or paste a GitHub issue URL."

---

## Step 1 — Parse Input

**If a GitHub issue URL:**
1. Extract org, repo, and issue number from the URL
2. Fetch the issue: `gh issue view <number> --repo <org>/<repo>`
3. Fetch comments: `gh issue view <number> --repo <org>/<repo> --comments`
4. Use the title + body + comments as the requirements source

**If free text:** Use it directly as the requirements source.

**If a path to an existing spec:** Enter edit mode (see Edit Mode section below).

---

## Step 2 — Read Project Config

1. Read the project's `CLAUDE.md`
2. Find the `## Workflow Config` section and parse the key-value table:

| Key | Used by |
|-----|---------|
| `workflow-dir` | spec-writer, all skills |
| `test-cmd` | implementation, ship |
| `lint-cmd` | implementation, ship |
| `build-cmd` | implementation, ship |
| `e2e-cmd` | qa-engineer |
| `e2e-framework` | qa-engineer |
| `tdd` | implementation |
| `branch-prefix` | ship |
| `base-branch` | ship |

3. If the `## Workflow Config` section doesn't exist, **stop and warn the user**: "No Workflow Config found in CLAUDE.md. Run `/adjust` to set up the project for this workflow."

Also read the rest of `CLAUDE.md` for project conventions, architecture notes, and tech stack context.

---

## Step 3 — Ambiguity Check

Before exploring the codebase, spend 30 seconds on a sanity check:

- Are the requirements clear enough to plan?
- Are there obvious unknowns — missing info, ambiguous scope, contradictory requirements?
- What is the likely complexity? (Bug fix / small feature / large feature)

**If there are blockers:** Surface 1–3 targeted questions to the user. Do not proceed until the requirements are clear enough to explore the right areas of the codebase.

**If requirements are clear:** Move on. This is a brief gate, not a discussion phase.

---

## Step 4 — Explore the Codebase

This is mandatory. Never plan blind.

1. **Start from the requirements** — what areas of the codebase are likely affected?
2. **Search broadly** — use Grep and Glob to find relevant files, types, functions, components, services, API endpoints
3. **Read key files deeply** — don't skim. Read the actual implementations of features related to the requirements.
4. **Find the structural template** — locate the closest existing feature that is structurally similar to what needs to be built. This becomes the pattern to follow.
5. **Map current state** — what exists today vs what needs to change. Note specific file paths.

Do not prescribe a fixed search strategy. Every codebase is shaped differently. The goal is: understand the affected areas well enough to write specific implementation steps with exact file paths.

---

## Step 5 — Determine Spec Depth

Based on complexity detected in steps 3–4, choose a depth:

### Lightweight (bug fixes, small changes — touches 1–3 files)
- Context: 2–3 sentences
- Current State: brief, just the affected files
- Implementation Steps: 1–3 steps, can be terse
- Acceptance Criteria: 1–3 items
- Skip Patterns to Follow

### Standard (typical features — touches 4–10 files)
- Full format (see Step 7)

### Deep (large features, new subsystems — touches 10+ files or creates new patterns)
- Full format + High-Level Approach section before Implementation Steps
- More detailed Current State documenting relevant architecture
- Acceptance criteria grouped by area

State which depth you're using and why. The user can override.

---

## Step 6 — Create the Workflow Folder

1. Read the `workflow-dir` value from the config (default: `_workflow`)
2. Generate a timestamp prefix: `YYYYMMDD-HHMM` using the current local time
3. Derive the feature name from the issue title or user description:
   - Lowercase, kebab-case
   - Short but descriptive (2–5 words)
4. Create: `<workflow-dir>/YYYYMMDD-HHMM-feature-name/`

Example: `_workflow/20260413-1423-dark-mode/`

---

## Step 7 — Write the Spec

Write `01-spec.md` in the workflow folder:

```markdown
# Feature: <title>

> Source: <issue URL or "Manual request">
> Date: YYYY-MM-DD
> Depth: lightweight | standard | deep

## Context

Why this is needed. 2–3 sentences. Include relevant discussion from issue comments if applicable.

## Requirements

What must be true when this is done:
- Requirement 1
- Requirement 2

**Out of scope:**
- What this explicitly does NOT cover

## Current State

What exists today. Specific file paths, current behavior, relevant data flow.
Reference the structural template (closest existing feature).

## High-Level Approach

(Deep specs only.) The strategy in plain language — how the pieces fit together before diving into individual steps.

## Implementation Steps

### Step N — <title>

**Files:** `path/to/file.ext` (modify | create)

What to do. Reference specific functions, types, patterns from the structural template.
Do not write implementation code — describe what to build.

## Patterns to Follow

The existing feature(s) used as the structural template. Exact file paths.
What to replicate from the template and what differs for this feature.

## Acceptance Criteria

- [ ] Criterion (specific, testable)
- [ ] Criterion

> These criteria are the contract that flows downstream. The review skill checks whether the implementation meets them. The qa-engineer skill writes e2e tests to prove them. Write them so they are verifiable by both a code reviewer and an automated test.

## Workflow Config

(Copied from CLAUDE.md — downstream skills read this instead of re-parsing CLAUDE.md)

| Key | Value |
|-----|-------|
| workflow-dir | ... |
| test-cmd | ... |
| lint-cmd | ... |
| build-cmd | ... |
| e2e-cmd | ... |
| e2e-framework | ... |
| tdd | ... |
| branch-prefix | ... |
| base-branch | ... |
```

---

## Step 8 — Present and Refine

After writing the spec, walk the user through:

1. The depth chosen and why
2. The structural template identified
3. The implementation approach at a high level
4. Any trade-offs or alternatives you considered but rejected (and why)

Ask: **"Does this spec look right? I can adjust any section."**

If the user requests changes, update the spec in place. When satisfied, confirm the final path.

---

## Edit Mode

When invoked with a path to an existing spec (or the user asks to revise):

1. Read the existing spec
2. Ask what should change (or accept changes from the user's input)
3. Update the spec in place — don't rewrite from scratch
4. Re-present the updated sections for review

---

## Constraints

**DO:**
- Read the codebase before writing anything
- Reference specific file paths, function names, type names in every implementation step
- Find and cite a structural template (the closest existing similar feature)
- Write acceptance criteria that are verifiable by both a code reviewer and an e2e test — they flow to the review and qa-engineer skills
- Scale spec depth to task complexity
- Include the workflow config in the output for downstream skills
- Make decisions — be opinionated

**DON'T:**
- Write implementation code in the spec — describe what to build, not the code itself
- Propose new patterns when existing patterns in the codebase work
- List alternatives — pick one and explain why
- Skip codebase exploration for any reason
- Create a spec for requirements that are unclear — ask first

---

## Red Flags

If you catch yourself thinking any of these, stop:

- "I'll explore the codebase after writing the spec" — STOP. Explore first. Always.
- "This is straightforward, no need to read the existing code" — STOP. You don't know that until you've read it.
- "The user's description is clear enough, no ambiguity check needed" — STOP. Spend 30 seconds checking.
- "I'll keep the acceptance criteria general to be flexible" — STOP. Vague criteria are untestable and unusable by downstream skills. Be specific.
- "There's no similar feature to use as a template" — STOP. Look harder. There is almost always a structural analog somewhere in the codebase.
