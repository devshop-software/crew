---
name: adjust
description: Onboards a project for the agentic workflow — scans the project structure, detects tools and commands, validates them, and writes the Workflow Config section in CLAUDE.md. Use when the user invokes /adjust.
---

# Adjust

## Role

You are a project onboarding engineer. You scan a project's structure, detect its toolchain, validate the commands work, and write the Workflow Config section into CLAUDE.md so all downstream skills can operate.

You detect what's there. You don't assume.

## When to Apply

Activate when called from the `/adjust` command. Otherwise ignore.

---

## Input Handling

`$ARGUMENTS` may be:

- **Empty** (most common) — scan the current project and set up config
- **`update`** — re-scan and update an existing Workflow Config
- **A specific key** (e.g. `test-cmd`) — update just that config value

---

## Step 1 — Check for Existing Config

1. Read the project's `CLAUDE.md` (if it exists)
2. Look for `## Workflow Config` section
3. If it exists and `$ARGUMENTS` is empty, ask: "Workflow Config already exists. Do you want to update it or start fresh?"
4. If `$ARGUMENTS` is `update` or a specific key, proceed to update mode (see Update Mode below)

---

## Step 2 — Scan the Project

Explore the project to detect its toolchain.

**Package managers and build tools:**
- `package.json` → npm/yarn/pnpm (check `packageManager` field and lockfiles: `package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`)
- `Makefile` / `Justfile` → make/just targets
- `Cargo.toml` → Rust/cargo
- `go.mod` → Go
- `pyproject.toml` / `setup.py` / `requirements.txt` → Python
- `*.csproj` / `*.sln` → .NET
- `build.gradle` / `pom.xml` → Java/Kotlin

**Test frameworks:**
- `package.json` scripts: `test`, `test:unit`, `test:e2e`, `test:integration`
- `vitest.config.*`, `jest.config.*` → Vitest/Jest
- `playwright.config.*` → Playwright
- `cypress.config.*` / `cypress/` → Cypress
- `pytest.ini` / `conftest.py` → pytest
- `*_test.go` → Go testing
- `*.test.rs` → Rust testing

**Lint/format tools:**
- `package.json` scripts: `lint`, `format`, `lint:fix`
- `.eslintrc*` → ESLint
- `.prettierrc*` → Prettier
- `biome.json` → Biome
- `ruff.toml` / `pyproject.toml [tool.ruff]` → Ruff

**Build commands:**
- `package.json` scripts: `build`, `compile`, `typecheck`
- `tsconfig.json` → TypeScript
- `next.config.*` → Next.js
- `vite.config.*` → Vite

**E2E frameworks:**
- `playwright.config.*` → Playwright (`npx playwright test`)
- `cypress.config.*` → Cypress (`npx cypress run`)
- `e2e/` or `tests/e2e/` directories

---

## Step 3 — Detect Commands

For each Workflow Config key, determine the best command:

| Key | Detection Strategy |
|-----|-------------------|
| `workflow-dir` | Default `_workflow`. Check if a different workflow directory already exists. |
| `test-cmd` | Read `package.json` scripts → `test` or `test:unit`. Other ecosystems: `cargo test`, `go test ./...`, `pytest`, `just test`, etc. |
| `lint-cmd` | Read `package.json` scripts → `lint`. Fall back to `eslint .`, `ruff check`, etc. |
| `build-cmd` | Read `package.json` scripts → `build` or `typecheck`. Compiled languages: `cargo build`, `go build`, `just build`, etc. |
| `e2e-cmd` | Detect e2e framework → `npx playwright test`, `npx cypress run`, `pytest tests/e2e/`, etc. |
| `e2e-framework` | Detect from config files → `playwright`, `cypress`, `jest`, `pytest`, etc. |
| `tdd` | Default `true` |
| `branch-prefix` | Default `feature/` |
| `base-branch` | Detect from git: `git symbolic-ref refs/remotes/origin/HEAD` → extract `main` or `master` |
| `worktree-layout` | `bare-clone` or `standard`. Default `standard`. If `bare-clone`, the repo uses a bare-clone worktree structure (see Step 6W). |

---

## Step 4 — Validate Commands

For each detected command, run it to verify it works:

1. Run `test-cmd` — does it execute? (It's OK if tests fail — we're checking the command works, not the tests)
2. Run `lint-cmd` — does it execute?
3. Run `build-cmd` — does it execute?
4. If `e2e-cmd` is detected, try a dry run if possible (e.g. `npx playwright test --list`)

Report results: "Detected and validated: [list]. Failed to validate: [list]."

For any command that fails to execute, ask the user: "What command should I use for [purpose]?"

---

## Step 5 — Present Config for Confirmation

Present the detected Workflow Config:

```markdown
## Workflow Config

| Key | Value |
|-----|-------|
| workflow-dir | `_workflow` |
| test-cmd | `npm test` |
| lint-cmd | `npm run lint` |
| build-cmd | `npm run build` |
| e2e-cmd | `npx playwright test` |
| e2e-framework | `playwright` |
| tdd | `true` |
| branch-prefix | `feature/` |
| base-branch | `main` |
| worktree-layout | `standard` |
```

Ask: **"Does this look right? I can change any value."**

Wait for user confirmation or adjustments.

---

## Step 6 — Write Config to CLAUDE.md

1. If `CLAUDE.md` doesn't exist, create it with the Workflow Config section
2. If `CLAUDE.md` exists but has no Workflow Config, append the section
3. If `CLAUDE.md` exists and has a Workflow Config, replace the section (leave all other content untouched)

Also ensure the workflow directory exists:
- If `workflow-dir` doesn't exist, create it
- If it exists, leave it as-is

---

## Step 7 — Worktree Layout Setup (if `worktree-layout: bare-clone`)

If `worktree-layout` is `standard`, skip this step entirely.

This step converts a standard git clone into a bare-clone worktree layout, or validates an existing one.

**Target structure:**

```
<project>/
  .bare/              ← bare git repo
  CLAUDE.md           ← real file at root (not a symlink)
  .claude/            ← real dir at root (not a symlink)
  .mcp.json           ← shared across worktrees
  main/               ← worktree for the base branch
  wt/                 ← feature worktrees (created by /indie)
    <feature-name>/   ← short, scannable names
```

### 7a — Detect Current State

Determine what we're working with:

1. **Already bare-clone** — `../.bare/` exists relative to the current working directory, and the current directory is a worktree (`.git` is a file, not a directory). → Jump to 7d (validate).
2. **Standard clone** — `.git` is a directory in the current working directory. → Proceed to 7b (migrate).
3. **Root of a bare-clone layout** — `.bare/` exists in the current directory and `main/` exists. → Jump to 7d (validate from root).

### 7b — Migrate to Bare-Clone

1. **Capture state:**
   - `REMOTE_URL` ← `git remote get-url origin`
   - `BASE_BRANCH` ← the `base-branch` from Workflow Config
   - Identify local-only files to preserve: `.env`, `.env.local`, `.claude/settings.local.json`, `.mcp.json` — any file that exists, is gitignored or untracked, and contains configuration
   - Check for uncommitted changes — if dirty, stop: "You have uncommitted changes. Commit or stash them before migrating to a bare-clone layout."
   - Check for existing worktrees — `git worktree list`. If worktrees exist outside the repo directory, warn: "Existing worktrees found at [paths]. Remove them first with `git worktree remove <path>`, or they'll have stale references after migration."

2. **Create the new structure** in a temporary sibling directory `<project>-worktree-setup/`:
   - `git clone --bare $REMOTE_URL <project>-worktree-setup/.bare`
   - Configure fetch refspec: `git -C <project>-worktree-setup/.bare config remote.origin.fetch "+refs/heads/*:refs/remotes/origin/*"`
   - Create the main worktree: `git -C <project>-worktree-setup/.bare worktree add ../main $BASE_BRANCH`

3. **Copy local files** from the old clone into the new `main/` worktree — only files identified in step 1.

4. **Copy root-level files:** Copy `CLAUDE.md` and `.claude/` from `main/` to the project root as real files (not symlinks). Claude Code resolves these by walking up from the CWD, so they'll be found from any worktree.

5. **Create the `wt/` directory:** `mkdir -p wt` in the new root — feature worktrees go here.

6. **Swap directories:**
   - `mv <project> <project>-old`
   - `mv <project>-worktree-setup <project>`

7. **Report:** "Migrated to bare-clone worktree layout. Old repo preserved at `<project>-old/`. Once you've verified everything works, delete it with `rm -rf <project>-old`."

Do NOT delete the old repo automatically — let the user verify first.

### 7c — Post-Migration Setup

1. Run dependency installation in the new `main/` worktree (detected package manager: `pnpm install`, `npm install`, etc.)
2. Verify git operations work: `git -C main log --oneline -1`, `git -C main fetch origin`

### 7d — Validate Existing Bare-Clone Layout

If the layout already exists, validate it:

1. **`.bare/` exists** and is a bare git repo (`git -C .bare rev-parse --is-bare-repository` returns `true`)
2. **`main/` exists** and is a valid worktree (`.git` file points to `.bare/worktrees/main`)
3. **Worktree paths are correct** — run `git -C .bare worktree list` and verify paths match the current filesystem location. If stale (e.g. after a directory rename), run `git -C main worktree repair` to fix them.
4. **Root-level files exist:**
   - `CLAUDE.md` exists at the project root as a real file (not a symlink)
   - `.claude/` exists at the project root as a real directory (not a symlink)
   - If missing, copy them from `main/`. If they are symlinks, replace with real copies.
5. **`wt/` directory exists** — if missing, create it: `mkdir -p wt`
6. **Fetch refspec is configured** — `git -C .bare config remote.origin.fetch` returns `+refs/heads/*:refs/remotes/origin/*`

Report any issues found and fixed. If everything is valid: "Bare-clone worktree layout is healthy."

---

## Step 7W — Document Worktree Layout in CLAUDE.md

If `worktree-layout` is `bare-clone`, ensure CLAUDE.md has a `## Repository Layout` section (above `## Workflow Config`). If it doesn't exist, add it:

```markdown
## Repository Layout

This project uses a **bare-clone worktree layout**. The repo root is not a working copy — it contains:

\`\`\`
<project>/
  .bare/              ← bare git repo (the actual .git data)
  CLAUDE.md           ← real file at root (not a symlink)
  .claude/            ← real dir at root (not a symlink)
  .mcp.json           ← shared across worktrees
  main/               ← worktree for the main branch (primary working copy)
  wt/                 ← feature worktrees created by /indie
    <feature-name>/   ← short, scannable names
\`\`\`

- **Always work from `main/`** (or a feature worktree under `wt/`), never from the repo root.
- Feature worktrees live under `wt/` with short, scannable names (no timestamp prefix in the directory name — the timestamp is in the branch name).
- `CLAUDE.md` and `.claude/` at the root are real files, not symlinks. Claude Code finds them by walking up from any worktree's CWD.
- After a feature branch is merged, clean up with: `git worktree remove <path> && rm -rf <path>`
```

If it already exists, leave it as-is.

---

## Step 8 — Set Up Playwright MCP (if applicable)

If `e2e-framework` is `playwright`, set up the Playwright MCP server so the qa-engineer skill can use a live browser when writing and debugging e2e tests.

1. **Check if already configured** — read `.mcp.json` in the project root. If a `playwright` server entry exists, skip to validation.

2. **Create or update `.mcp.json`** — add the Playwright MCP server:

```json
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": ["@playwright/mcp@latest", "--headless"]
    }
  }
}
```

If `.mcp.json` already exists with other servers, merge — don't overwrite.

3. **Validate** — the MCP server starts on demand (Claude Code launches it when a tool is called), so there's no process to check. Instead, verify the prerequisite: run `npx @playwright/mcp@latest --help` to confirm the package resolves and Node.js 18+ is available.

4. **Report** — "Playwright MCP server configured in `.mcp.json`. The `/qa` skill will use it to interact with a live browser when writing e2e tests."

If `e2e-framework` is not `playwright`, skip this step entirely.

---

## Step 9 — Setup Recommendations

After writing the config, provide optional recommendations:

**Missing test infrastructure:**
- If no e2e framework is detected: "No e2e framework detected. The `/qa` skill won't work without one. Consider adding Playwright or Cypress."
- If no lint command is detected: "No linting detected. The implementation skill will skip lint checks."

**Hooks (optional):**
- If the project would benefit from scope-limiting hooks, suggest them. Don't install automatically — explain and let the user decide.

---

## Step 10 — Report

Present a summary:

1. Config written to CLAUDE.md
2. Workflow directory status (created or already exists)
3. Recommendations (gitignore, missing tools)
4. "Your project is now set up for the agentic workflow. Start with the spec-writer skill to plan a feature."

---

## Update Mode

When invoked with `update` or a specific key:

1. Read the existing Workflow Config
2. If updating everything: re-scan the project, detect changes, present the diff between old and new values
3. If updating a specific key: ask for the new value, or re-detect just that key
4. Update CLAUDE.md in place — only the Workflow Config section
5. Re-validate the updated commands

---

## Constraints

**DO:**
- Detect commands from actual project files, not assumptions
- Validate detected commands by running them
- Present config for user confirmation before writing
- Create the workflow directory if it doesn't exist
- Recommend .gitignore additions and note missing infrastructure

**DON'T:**
- Overwrite existing CLAUDE.md content outside the Workflow Config section
- Install hooks without user consent
- Assume a specific ecosystem — detect what's there
- Write config without validating the commands work
- Skip the confirmation step — the user should review before config is written

---

## Red Flags

If you catch yourself thinking any of these, stop:

- "This looks like a Node.js project, I'll assume npm" — STOP. Check the lockfile. It might be pnpm or yarn.
- "The test command is obviously `npm test`" — STOP. Read `package.json` scripts. It might be `vitest`, `jest`, or something custom.
- "I'll skip validation, the commands look right" — STOP. Run them. A command that looks right but fails will break every downstream skill.
- "I'll write the config and the user can fix it later" — STOP. Present it for confirmation first.
- "This project doesn't have e2e tests, I'll leave that blank" — STOP. Leave it blank but warn that `/qa` won't work without it.
