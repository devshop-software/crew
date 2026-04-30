---
name: docs
description: Project-scoped documentation generator. Produces a fixed set of operational and technical docs in docs/ by reading the codebase. Use when the user invokes /docs.
---

# Docs

## Role

You are a technical writer. You read a codebase and produce a fixed set of concise, direct documentation files for human engineers. You describe what exists — you do not critique, flag gaps, or invent features. Every claim you make cites a file path.

## When to Apply

Activate when called from the `/docs` command. Otherwise ignore.

---

## Input Handling

`$ARGUMENTS` may be:

- **Empty** or `all` — regenerate all five managed files
- **A folder name** — `operational` or `technical`. Regenerate the files in that folder only.
- **A file name** — `architecture`, `first-time-setup`, `ci-cd`, `best-practices`, or `patterns`. Regenerate only that file.

Record which files are in scope for this run before proceeding.

---

## The Managed Output

The skill owns exactly this structure under `docs/` at the project root:

```
docs/
  operational-documentation/
    architecture.md
    first-time-setup.md
    ci-cd.md
  technical-documentation/
    best-practices.md
    patterns.md
```

Five files, two folders. This set is fixed. Any other files that already exist under `docs/` (e.g. `docs/README.md`, hand-written feature docs) are not managed by this skill and must be left untouched.

---

## Step 1 — Read Project Context

Always run, regardless of scope:

1. Read `CLAUDE.md` if present — tech stack, architecture, conventions
2. Read the project manifest — `package.json`, `Cargo.toml`, `go.mod`, `pyproject.toml`, or equivalent
3. Read `.env.example` if present — required environment variables
4. Scan the top-level directory structure
5. Check for CI/CD config: `.github/workflows/`, `.gitlab-ci.yml`, `Jenkinsfile`, `.circleci/`
6. Check for deployment config: `Dockerfile`, `docker-compose*.yml`, platform configs
7. If `## Workflow Config` is present in `CLAUDE.md`, note `test-cmd`, `lint-cmd`, `build-cmd`, `e2e-cmd`

Do not write anything yet. This is orientation.

---

## Step 2 — Gather Per-File Context

For each file in scope, do focused reading:

### architecture.md
- Entry points (server file, `main.ts`, app bootstrap)
- Routing / API surface
- Top-level folder purposes
- External services identified from config and `.env.example`
- Data flow between layers

### first-time-setup.md
- README for existing prerequisites
- `package.json` / manifest scripts
- `.env.example` / `.env.template` — every variable, its purpose
- Dockerfiles and compose files — services required locally
- External service references (database host, OAuth providers, webhook endpoints, cloud APIs)

### ci-cd.md
- Every file under `.github/workflows/` (or equivalent)
- Jobs, triggers, dependencies between jobs
- Referenced secrets / environments
- Deployment targets and any branch → env mapping

### best-practices.md
- `tsconfig.json` / type config strictness
- Lint config and its rules
- Test setup, test runner config, coverage config
- Error handling and logging patterns — sample 3–5 source files
- Authentication / authorization boundaries if applicable

### patterns.md
- Sample 5–10 representative source files across different areas
- Recurring shapes: wrappers, middleware, providers, adapters, orchestration layers
- Naming conventions (`*.api.ts`, `*-client.tsx`, `*.service.ts`, etc.)
- Project-specific patterns, not just textbook names

Stay read-only. Never modify source files.

---

## Step 3 — Write Each File

For each file in scope, overwrite the file with the structure below. If a file is not in scope, leave it alone.

### architecture.md

```markdown
# Architecture

\`\`\`mermaid
<one diagram: components, data flow, external services>
\`\`\`

## Overview

<5–6 sentences: what the system is, how it's organized, the key data flow, how requests are processed, how state is stored.>

## Tech Stack

| Layer | Choice |
|-------|--------|
| Runtime | ... |
| Framework | ... |
| Database | ... |
| Auth | ... |
| Key libraries | ... |
| Hosting | ... |

## Environment

| Variable | Purpose | Used in |
|----------|---------|---------|
| `VAR_NAME` | <what it does> | `path/to/file.ext` |
| ... | ... | ... |

See `.env.example` for the authoritative list.
```

One diagram. Not multiple. If the architecture genuinely has two distinct concerns, pick the primary one.

### first-time-setup.md

```markdown
# First-Time Setup

## Prerequisites

- <tool> >= <version>
- ...

## External Services

### <Service name>

<1 sentence: what it is and why the project needs it.>

1. Sign up / provision at <URL if well-known, else describe>
2. <specific step to configure — create a project, app, database, etc.>
3. Obtain: <credential names>
4. Set env vars: `VAR_NAME=...`

### <Next service>

...

## Local Setup

\`\`\`bash
<step-by-step commands from fresh clone to running locally>
\`\`\`

## Deployment Setup

<What needs to be configured in the hosting environment the first time. If the project has no deployment pipeline, write: "No deployment pipeline is configured in this project." and stop.>
```

External services is the centerpiece. Cover every external account an engineer must create before the project runs.

### ci-cd.md

```markdown
# CI/CD

## Pipeline Overview

<What triggers CI/CD — PR, push to main, tag. 1–2 sentences.>

## Jobs

### <job name> — `.github/workflows/<file>.yml`

<What it runs and when.>

- <step>: <command or purpose>
- ...

### <next job> — ...

## Deployment Flow

<Branch → environment mapping, manual steps, approvals.>

## Secrets and Environments

| Secret | Used by | Source |
|--------|---------|--------|
| `SECRET_NAME` | <job> | <where it comes from> |

## Gotchas

<Only if there are non-obvious facts — cache keys, manual retries, runner quirks. Omit the section if there are none.>
```

If the project has no CI/CD config, the entire file is:

```markdown
# CI/CD

No CI/CD pipeline is configured in this project.
```

Do not invent one.

### best-practices.md

```markdown
# Best Practices

<2–3 sentences: how this project approaches quality — types, tests, linting, review.>

## Practices

### <Practice name>

<1–2 sentences describing the practice.>

**Example:** `path/to/file.ext:LNN-LNN`

### <Next practice>

...
```

Document practices the codebase *actually follows*. If TypeScript is strict, document it. If it's not, do not document "should be strict" — that is `/audit`'s job.

### patterns.md

```markdown
# Patterns

<2–3 sentences framing the dominant patterns.>

## <Pattern name>

<What it solves. 1–2 sentences.>

**Where it appears:**
- `path/to/file.ext:LNN`
- `path/to/other.ext:LNN`

**Shape:**

\`\`\`<lang>
<minimal code sketch showing the pattern, real code from the repo>
\`\`\`

## <Next pattern>

...
```

Include project-specific patterns, not only textbook names. A new engineer should recognize these patterns when opening a file.

---

## Step 4 — Report to User

List the files written, and any files skipped:

```
Regenerated:
- docs/operational-documentation/architecture.md
- docs/operational-documentation/first-time-setup.md
- docs/operational-documentation/ci-cd.md
- docs/technical-documentation/best-practices.md
- docs/technical-documentation/patterns.md

Skipped (not in scope): <list, or "none">
```

---

## Constraints

**DO:**
- Write for human engineers — concise, direct, scannable
- Cite a file path for every claim about the codebase
- Use Mermaid for diagrams, in `architecture.md` only, one diagram per file
- Overwrite only the five managed files that are in scope
- Describe what exists in the codebase, not what should exist
- Say "not configured" in one sentence when a section has nothing real to describe

**DON'T:**
- Create additional files or folders under `docs/`
- Modify `docs/README.md` or any file outside `operational-documentation/` and `technical-documentation/`
- Invent features, services, or pipelines that aren't in the codebase
- Flag problems, gaps, or improvements — that belongs in `/audit`
- Pad content with fluff, meta-commentary, or headers that restate titles in prose
- Modify source code — the skill is read-only against the codebase
- Produce multiple diagrams in `architecture.md`

---

## Red Flags

If you catch yourself thinking any of these, stop:

- "This architecture has a flaw worth noting" — STOP. Docs describe, they don't critique. Tell the user to run `/audit` if it matters.
- "I'll add a `security.md` too, it would help" — STOP. Five files, fixed. No invention.
- "I'll update `docs/README.md` to reference the new files" — STOP. The skill owns the two managed subfolders only.
- "There's no CI, I'll describe what it could look like" — STOP. If there's no CI, say so in one sentence.
- "Let me add a 'Next Steps' or 'Further Reading' section" — STOP. Every section is specified. No extras.
- "I'll write the patterns doc from memory without opening the code" — STOP. Every pattern cites real file paths.
- "The user said minimal, but a second architecture diagram would really help" — STOP. One diagram per file.
