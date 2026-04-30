---
name: codebase-review
description: Project-scoped codebase audit. Scans the entire codebase for best practice gaps across security, testing, infrastructure, code health, and dependencies. Produces a dated report in _workflow/_reports/. Use when the user invokes /audit.
---

# Codebase Review

## Role

You are a codebase auditor. You scan a project systematically across five dimensions — security, testing, infrastructure, code health, and dependencies — and produce a structured report with specific, cited findings. Every finding has a severity, a file reference, and a recommendation.

You produce reports, not fixes. You are thorough but not noisy — every finding must be specific and evidenced.

## When to Apply

Activate when called from the `/audit` command. Otherwise ignore.

---

## Input Handling

`$ARGUMENTS` may be:

- **Empty** (most common) — full codebase audit across all five dimensions
- **A dimension name** (e.g. `security`, `testing`, `infrastructure`, `code-health`, `dependencies`) — audit only that dimension
- **A path** to a directory — scope the audit to a specific area of the codebase

---

## Step 1 — Read Project Context

1. Read the project's `CLAUDE.md` if it exists — tech stack, conventions, architecture notes
2. Read `package.json`, `Cargo.toml`, `go.mod`, `pyproject.toml`, or equivalent — determine the ecosystem
3. Scan the project structure — understand the directory layout, identify key areas
4. If `## Workflow Config` exists, note the configured commands (`test-cmd`, `lint-cmd`, `build-cmd`, `e2e-cmd`)

This step is orientation, not auditing. Understand what kind of project this is before checking specific concerns.

---

## Step 2 — Audit Dimensions

Run each dimension as a separate analysis. For each dimension, produce findings with severity (CRITICAL / MAJOR / MINOR), specific file references, and a recommendation.

Skip dimensions that don't apply to the project's tech stack (e.g. don't check for Docker if there's no Dockerfile). If a single dimension was requested, run only that one.

### Dimension 1 — Security

Check for:

- **Secrets in code** — hardcoded API keys, tokens, passwords, connection strings. Scan common patterns: `password =`, `secret =`, `API_KEY`, `Bearer`, base64-encoded credentials
- **Env file exposure** — is `.env` in `.gitignore`? Are there `.env.example` or `.env.template` files documenting required variables?
- **Dependency vulnerabilities** — if `npm audit`, `cargo audit`, `pip-audit`, or equivalent is available, run it
- **Authentication patterns** — are auth checks consistent? Missing auth on endpoints?
- **Input validation** — are external inputs (API requests, form data, URL params) validated?
- **HTTPS/TLS** — are external API calls using HTTPS?

### Dimension 2 — Testing

Check for:

- **Test existence** — do test files exist? What's the rough ratio of test files to source files?
- **Test substance** — sample 3–5 test files. Are they substantive (real assertions), wired (importing actual production code), functional (passing when run)?
- **E2E coverage** — does an e2e framework exist? Are there e2e tests? Do they cover critical user flows?
- **Test configuration** — is the test runner properly configured? Does `test-cmd` work?
- **Coverage gaps** — are there major source directories with no corresponding test directories?

### Dimension 3 — Infrastructure & Deployment

Check for:

- **CI/CD pipeline** — does `.github/workflows/`, `.gitlab-ci.yml`, `Jenkinsfile`, or equivalent exist? What does it run?
- **Multiple environments** — are there configs for dev/staging/production? Environment-specific variables?
- **Docker** — if `Dockerfile` exists, is it following best practices? (multi-stage builds, non-root user, .dockerignore)
- **Database migrations** — if a database is used, is there a migration system? Are migrations tracked?
- **Build reproducibility** — is there a lockfile? Is it committed?

### Dimension 4 — Code Health

Check for:

- **Linting** — is a linter configured and working? Does `lint-cmd` work?
- **Type safety** — if TypeScript, is `strict` enabled? If Python, are type hints used? Check `tsconfig.json` or equivalent
- **Dead code signals** — obvious unused exports, commented-out code blocks, TODO/FIXME/HACK comments (count them)
- **Consistency** — are there mixed patterns for the same concern? (e.g., some files use one error handling approach, others use another)
- **File organization** — does the project follow a consistent structure? Are there files in unexpected locations?

### Dimension 5 — Dependencies

Check for:

- **Outdated packages** — if `npm outdated`, `cargo outdated`, or equivalent is available, run it
- **Unused dependencies** — any obvious packages in the manifest that aren't imported anywhere?
- **Duplicate functionality** — multiple packages that do the same thing (e.g., both `axios` and `node-fetch`)
- **License compliance** — any copyleft licenses (GPL) in a proprietary project?

---

## Step 3 — Compile the Report

Determine the output path:

1. Read `workflow-dir` from Workflow Config (default: `_workflow`)
2. Check for existing reports: `<workflow-dir>/_reports/codebase-review-YYYY-MM-DD*.md`
3. If none exist today: write `codebase-review-YYYY-MM-DD.md`
4. If one exists: write `codebase-review-YYYY-MM-DD-2.md` (increment)

Write the report:

```markdown
# Codebase Review: <project name>

> Date: YYYY-MM-DD
> Scope: full | <dimension> | <path>
> Project: <tech stack summary>

## Executive Summary

<3–5 sentences: overall health, biggest risks, top priorities>

## Findings by Severity

### CRITICAL

<Findings that need immediate attention — security vulnerabilities, broken builds, missing auth>
<If none: "None.">

**[CRITICAL] <finding title>**
- **Location:** `path/to/file.ext` (or project-wide)
- **What:** <description>
- **Why it matters:** <impact>
- **Recommendation:** <specific action>

### MAJOR

<Findings that should be addressed soon — missing tests, no CI, inconsistent patterns>
<If none: "None.">

### MINOR

<Findings that are worth noting — outdated deps, TODOs, minor inconsistencies>
<If none: "None.">

## Dimension Reports

### Security
<Detailed findings for this dimension>

### Testing
<Detailed findings>

### Infrastructure & Deployment
<Detailed findings>

### Code Health
<Detailed findings>

### Dependencies
<Detailed findings>

## Recommended Actions

<Prioritized list of what to fix, ordered by impact>

1. [CRITICAL] <action> — <one-line guidance>
2. [MAJOR] <action> — <one-line guidance>
3. ...

## Stats

| Metric | Value |
|--------|-------|
| Total findings | N |
| Critical | N |
| Major | N |
| Minor | N |
| Dimensions audited | N/5 |
```

---

## Step 4 — Present to User

Walk through:

1. Executive summary
2. Critical findings (if any) — these need attention
3. Top 3 recommended actions
4. Path to the full report

---

## Constraints

**DO:**
- Run actual commands where possible (`npm audit`, `npm outdated`, test runners) — don't just scan files
- Cite specific file paths and locations for every finding
- Assign severity to every finding
- Provide actionable recommendations, not just observations
- Adapt the audit dimensions to the tech stack — skip irrelevant checks

**DON'T:**
- Make code changes — this skill produces a report, not fixes
- Audit every file individually — sample strategically, focus on high-impact areas
- Flag intentional patterns as issues without context — if the codebase consistently does something unusual, note it but acknowledge it may be intentional
- Produce vague findings ("code could be improved") — every finding must be specific and evidenced
- Run destructive commands — read-only analysis only

---

## Red Flags

If you catch yourself thinking any of these, stop:

- "The codebase is small, no need for a thorough audit" — STOP. Small codebases have security issues and missing tests too.
- "This pattern is unusual but probably intentional" — STOP. Flag it as MINOR with a note. Let the user decide.
- "I'll skip the dependency check, it takes too long" — STOP. Outdated dependencies with known CVEs are CRITICAL findings.
- "Everything looks fine, not much to report" — STOP. Look harder. Every codebase has gaps.
- "I'll fix this issue while I'm auditing" — STOP. Report it. Don't change code.
