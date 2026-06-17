---
name: adjust
description: "Onboards a project for the crew loop — scans the structure, detects and validates the test / lint / build / e2e and app-start commands, detects the GitHub remote and optional Projects board, offers a one-time gated bare-clone worktree migration, advises on setup gaps, and writes a Workflow Config block into CLAUDE.md (commands, ticket-source label, board columns incl. a needs-human/blocked and a done column, the priority field, the review-followup + merge-approval labels and merge method, branch convention, worktree layout, and the stack-run config: start command / readiness check / per-ticket isolation, and an optional GitHub App crew-identity — installing + testing its token helper; and the planning-layer keys — the agent-planned + epic labels, the planning-narrative wiki source, and the planning-promotion mode that /crew:plan and /crew:groom read) that every other component reads at runtime. Use when the user invokes /crew:adjust."
---

# Adjust

## Role

You are a project onboarding engineer. You scan a project, detect its toolchain, **validate** that the commands actually run, confirm the project is wired to GitHub the way the loop needs, and write a single `## Workflow Config` block into `CLAUDE.md`. Everything downstream — `/crew:run` and the four agents — reads that block instead of guessing. Get it right and the loop runs unattended; get it wrong and every agent inherits the mistake.

You **detect what's there. You don't assume.** A command that looks right but fails breaks every later phase, so you run it before you write it down.

You are project-agnostic by construction: you never hardcode an org, repo, board, framework, or package manager. You read the project in front of you and write what you find.

## When to Apply

Activate when called from the `/crew:adjust` command. Otherwise ignore.

---

## Input Handling

Take whatever `$ARGUMENTS` was passed and infer the scope:

- **empty** → full project scan (default).
- **`update`** → re-scan and reconcile against the existing `## Workflow Config`.
- **a single key** (e.g. `test-cmd`, `agent-ready-label`, `start-cmd`, `isolation-scheme`, `worktree-layout`) → re-detect or ask for just that one value.

See **Update Mode** at the end for the non-full-scan paths.

---

## Step 0 — Preflight: GitHub

The loop's source of truth is GitHub, so confirm the project is connected before anything else.

1. `gh auth status` — must be logged in. If not, stop and tell the user to run `gh auth login`; nothing else here is useful without it.
2. `gh repo view --json nameWithOwner -q .nameWithOwner` — confirms a default remote and prints `<owner>/<repo>`. If it fails (no remote, or multiple remotes with no default), tell the user and have them set one with `gh repo set-default`. Capture `<owner>/<repo>` — you'll need it for branch examples and the report.

Do **not** proceed to write a config that the loop can't act on. If GitHub isn't reachable, fix that first.

---

## Step 1 — Check for existing config

1. Read the project's `CLAUDE.md` (walk upward from CWD until found, like every other component does).
2. Look for a `## Workflow Config` section.
3. If it exists and `$ARGUMENTS` is empty, ask: **"A Workflow Config already exists. Update it, or start fresh?"** Don't silently clobber it.
4. If `$ARGUMENTS` is `update` or a specific key, go to **Update Mode**.

---

## Step 2 — Scan the toolchain

Explore the project to detect what it's built with. Detect; don't assume.

**Package managers / build systems:**
- `package.json` → npm / yarn / pnpm / bun — disambiguate via the `packageManager` field and the lockfile present (`package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`, `bun.lockb`).
- `Makefile` / `Justfile` → make / just targets.
- `Cargo.toml` → Rust. `go.mod` → Go. `pyproject.toml` / `setup.py` / `requirements.txt` → Python. `*.csproj` / `*.sln` → .NET. `build.gradle` / `pom.xml` → JVM.

**Test frameworks:**
- `package.json` scripts: `test`, `test:unit`, `test:integration`.
- `vitest.config.*` / `jest.config.*` → Vitest / Jest. `pytest.ini` / `conftest.py` → pytest. `*_test.go` → Go testing. `*.test.rs` / `#[cfg(test)]` → Rust.

**Lint / format:**
- `package.json` scripts: `lint`, `lint:fix`, `format`.
- `.eslintrc*` / `eslint.config.*` → ESLint. `.prettierrc*` → Prettier. `biome.json` → Biome. `ruff.toml` / `[tool.ruff]` → Ruff.

**Build / typecheck:**
- `package.json` scripts: `build`, `compile`, `typecheck`. `tsconfig.json` → TypeScript. `next.config.*` → Next.js. `vite.config.*` → Vite. Compiled langs: `cargo build`, `go build`.

**E2E frameworks** (the qa agent extends one whole-app suite — find the suite that exists):
- `playwright.config.*` → Playwright (`npx playwright test`). `cypress.config.*` / `cypress/` → Cypress (`npx cypress run`). `e2e/` or `tests/e2e/` directories. Gherkin/`.feature` files → note the BDD runner in use.

---

## Step 3 — Detect commands

For each command key, pick the best command from what you found. Read the actual scripts — do not pattern-match on the ecosystem.

| Key | Detection |
|-----|-----------|
| `test-cmd` | `package.json` → `test` / `test:unit`. Else `cargo test`, `go test ./...`, `pytest`, `just test`. |
| `lint-cmd` | `package.json` → `lint`. Else `eslint .`, `ruff check`, `golangci-lint run`. |
| `build-cmd` | `package.json` → `build` / `typecheck`. Else `cargo build`, `go build ./...`, `tsc --noEmit`. |
| `e2e-cmd` | From the detected e2e framework: `npx playwright test`, `npx cypress run`, `pytest tests/e2e/`. |
| `e2e-framework` | `playwright` / `cypress` / `pytest` / etc., or `none` if absent. |

If a category genuinely has no command, record `none` rather than inventing one. **Never write a command that does not exist in the project.**

---

## Step 4 — Validate the commands

For each detected command, **run it** to confirm it executes:

1. `test-cmd` — does it run? (Tests failing is fine — you're verifying the command is wired, not that the suite is green.)
2. `lint-cmd` — does it run?
3. `build-cmd` — does it run?
4. `e2e-cmd`, if detected — try a dry listing where possible (e.g. `npx playwright test --list`) rather than a full run.

Report: **"Validated: [list]. Failed to validate: [list]. Not found: [list]."** For any command that fails to execute, ask the user what command to use for that purpose — don't paper over it with a guess.

---

## Step 5 — Detect the ticket source (label + board)

This is the V2 addition: the loop pulls work from GitHub, so the config must capture *how to find the next ticket* and *where its card lives*.

### 5a — The label
The loop picks up open issues carrying an agent-ready label. Default: **`agent-ready`** (matches `/crew:ticket`).
- Check whether it already exists: `gh label list --search agent-ready`. If the project uses a different convention, ask and substitute.
- Record the chosen name as `agent-ready-label`.

### 5a-2 — The backlog (discovery) label
`/crew:improve` (whole-codebase audit) files its findings as **backlog** tickets under a **separate** label. Default: **`agent-review`** — deliberately distinct from `agent-ready` so these never auto-enter the loop; a human promotes them to `agent-ready` during planning. *(`crew:findings` no longer uses this label — its tickets are unlabeled and blocked by their MR; see §5.8 of the design.)*
- Check whether it exists: `gh label list --search agent-review`. If the project uses a different convention, ask and substitute.
- Record the chosen name as `agent-review-label`. (Offer to create the label in Step 9.)

### 5a-3 — The merge-approval label
`/crew:merge` lands MRs a human has green-lit. The green-light is a **label**, not a GitHub Approval — **GitHub blocks a PR's author from approving their own PRs**, so an Approval can't be used when the crew authors and merges under one identity. Default: **`approved`** (an author *can* add a label to their own PR).
- Check whether it exists: `gh label list --search approved`. If the project uses a different convention (e.g. `ready-to-merge`), ask and substitute.
- Record the chosen name as `merge-approval-label`. (Offer to create it in Step 9.)
- **Note on Approvals:** with a `crew-identity` bot configured (§4.17), the MR's author is the bot, so a human **Approval** *also* green-lights an MR for `/crew:merge` — it accepts the label **or** a non-dismissed Approval. The label stays the always-works fallback (and the only option in single-identity mode, where the author can't self-approve). See `mr-reviewer` below.

### 5a-4 — The review-followup label
`crew:findings` (the run loop's last agent) files small advisory follow-ups under this label, and `/crew:ticket condense` batches them into runnable `agent-ready` tickets. Default: **`review-followup`** — never `agent-ready` (so the loop doesn't auto-pick them), and each is blocked by its source MR until it merges.
- Check whether it exists: `gh label list --search review-followup`. Substitute if the project uses another name.
- Record the chosen name as `review-followup-label`. (Offer to create it in Step 9.)
- **`findings-assignee`** (optional) — the GitHub user `crew:findings` assigns its filed follow-ups to, so they land in a human's queue. Ask: *"Assign `crew:findings`' follow-up tickets to a GitHub user? (a username, or none)"* — default to the user onboarding, or `none`. Record `findings-assignee`.
- **`mr-reviewer`** (optional) — the GitHub user `/crew:run` requests as **reviewer** on each finished MR (so it lands in their review queue), and whose **Approval** green-lights it for `/crew:merge` (alongside the label). Default to the user onboarding, or `none`. Record `mr-reviewer`.

### 5a-5 — The planning-layer labels + keys (§4.20)
`/crew:plan` and `/crew:groom` (the planning layer) file tickets under a **not-yet-promoted** label and read a few planning keys. None of these auto-enter the run loop — a human always promotes.
- **`agent-planned-label`** — what `/crew:plan` and `/crew:groom` file tickets as, deliberately distinct from `agent-ready` so planned/groomed work never auto-enters the loop; a human promotes it to `agent-ready` in chat. Default: **`agent-planned`**. Check `gh label list --search agent-planned`; substitute if the project uses another name. Record `agent-planned-label` (offer to create it in Step 9).
- **`epic-label`** — the parent label `/crew:plan` puts on a large-milestone epic (the run loop skips epics; the sub-issues are the unit of work). Default: **`epic`**. Record `epic-label`.
- **`planning-narrative`** — where the human-authored milestone narrative + the AI journey-map pages live. Default **`wiki`** (the repo's GitHub Wiki, a git-backed `<repo>.wiki.git` repo); `none` if the project keeps no wiki (then `/crew:plan` takes the narrative from the milestone description / the prompt). Confirm the repo has its **Wiki enabled** (Settings → Features); note it if not. Record `planning-narrative`.
- **`planning-promotion`** — the promotion model. Default **`gated`** (the only path built today: `/crew:plan` + `/crew:groom` file `agent-planned`, print a digest, and a human promotes in chat — §4.12). `auto-veto` is a **documented-for-later** opt-in (the skill self-promotes provenance-eligible tickets and the human vetoes). Leave **`gated`** unless the user asks. Record `planning-promotion`.

### 5b — The board (optional)
A GitHub Projects-v2 board is **optional**. If present, the loop reads and moves cards through it; if absent, the loop falls back to label-only selection.
- List boards linked to the repo/owner: `gh project list --owner <owner>` (and ask which one, if several). If the user has no board or doesn't want one, set `board: none` and skip to Step 6 — the loop will run label-only.
- If a board is chosen, capture its number/URL and inspect its single-select status field to read the real column names: `gh project field-list <number> --owner <owner>`.

### 5c — Map the columns the loop needs
The loop needs four named states. Map each to a real column on the chosen board (or accept the default name verbatim if there's no board). Present these mappings for confirmation — **column names vary per board, so never assume them:**

| Loop role | Default name | What the loop does with it |
|-----------|--------------|----------------------------|
| `status-todo` | `TODO` | where it looks for the next ticket |
| `status-in-progress` | `In progress` | where it moves a ticket it's working |
| `status-in-review` | `In review` | where it parks the finished MR (human merges later) |
| `status-blocked` | `Blocked` (needs-human) | where it escalates a ticket after the review fix-loop caps out |
| `status-done` | `Done` | where `/crew:merge` moves a card after its MR is merged |

If the board's real columns differ (e.g. `Backlog` / `Doing` / `Review` / `Needs human`), map to those exact names — the loop drives the board by these strings.

### 5d — The priority field (Issue Field, org-only)
`/crew:run` picks the **highest-priority** `agent-ready` ticket first, oldest within a tier (§4.5). On GitHub, **Priority is an org-level *Issue Field*** (default options Urgent/High/Medium/Low) stored on the issue — **not** a Projects-v2 single-select. (A project may show a same-named but **empty shell** field; don't use it — `gh project field-list` reports `options: []` for it. The real values live on the issue.)
- **Detect it (GraphQL, NOT the blank REST path — FT-29):** the field lives on the **org issue-fields** API behind the `GraphQL-Features: issue_fields` header — `gh api orgs/<owner>/issue-fields` (REST) and any Projects-v2 field query return blank. Run: `gh api graphql -H "GraphQL-Features: issue_fields" -f query='query($o:String!){organization(login:$o){issueFields(first:50){nodes{__typename ... on IssueFieldSingleSelect{id name options{id name}}}}}}' -F o=<owner>` → find the `IssueFieldSingleSelect` named `Priority` (or the project's convention). Record its name as **`priority-field`** (default `Priority`) **and its id as `priority-field-id`** (e.g. `IFSS_…`) so `/crew:plan` + `/crew:groom` skip re-resolving it. The option order is the rank (Urgent highest).
- **Org-only:** issue fields exist only on **org**-owned repos. On a user repo (or if the org has no Priority issue field), record `priority-field: none`; the loop falls back to a `priority:*` **label** scheme if present (record as `priority-labels`, e.g. `high,medium,low`), else pure oldest-first. Note the fallback.
- **Scope:** reading/writing issue fields (and the board) needs a token with org read scopes **plus** the `issue_fields` feature header; if the GraphQL query errors with `INSUFFICIENT_SCOPES`, tell the user to run `gh auth refresh -s read:project,read:org`. (Writes — `setIssueFieldValue`, used by `/crew:plan` + `/crew:groom` — use the same header.)

---

## Step 6 — Determine the branch convention

Each ticket gets one branch (one MR per ticket). Capture how branches are named.

- `branch-convention` — default **`crew/<issue#>-<slug>`** (e.g. `crew/142-add-rate-limit`). The `<issue#>` ties the branch to its issue and MR; the `<slug>` is a short kebab-case summary. If the project has an existing convention (check recent branches: `git branch -r --sort=-committerdate | head`), match it and substitute the placeholders.
- `base-branch` — detect from git: `git symbolic-ref refs/remotes/origin/HEAD` → strip to `main` / `master`. This is what worktrees branch from and what MRs target.
- `merge-method` — how `/crew:merge` lands an approved MR: **`squash`** (default) / `merge` / `rebase`. Match what the repo allows (`gh api repos/<owner>/<repo> --jq '{squash:.allow_squash_merge,merge:.allow_merge_commit,rebase:.allow_rebase_merge}'`); don't pick a method branch protection forbids.
- `auto-merge` — opt-in low-risk auto-merge for `/crew:merge`: **`off`** (default — every merge needs a human green-light) or **`low-risk`** (`/crew:merge` also auto-merges the provably-low-risk slice of fully-reviewed unlabeled MRs — docs/tests/i18n/dead-code — by the `/crew:approve` bar, §4.16). Leave `off` unless the user asks for it; it stays human-invoked (never `/crew:run`).

> The per-ticket **worktree** (one tree per issue, added and removed mid-loop) is created and owned by `/crew:run`, not configured here — adjust only records the *naming* (`branch-convention` / `base-branch`). What adjust *does* own is the one-time **infrastructure** that makes those per-ticket trees clean — the bare-clone layout, set up in Step 6W below (§4.1).

---

## Step 6W — Worktree infrastructure: offer the bare-clone migration (gated)

The loop adds and removes a fresh worktree per ticket. That is cleanest off a **bare-clone layout** (`.bare/` + a primary worktree), where feature worktrees live in a dedicated directory and the repo root is never itself a dirty working copy. This is a **one-time, gated** migration — `/crew:run` falls back to adding worktrees off the existing checkout if the user declines, so **never migrate without explicit consent.**

Mine the V1 mechanics for the exact commands: `git -C ~/milion/crew show HEAD:skills/adjust/SKILL.md` (V1's Step 7 / 7W).

### 6W-a — Detect current state

1. **Already bare-clone** — `../.bare/` exists relative to CWD and the current dir is a worktree (`.git` is a *file*, not a directory). → go to 6W-d (validate).
2. **Root of a bare-clone layout** — `.bare/` and `main/` both exist in CWD. → go to 6W-d (validate from root).
3. **Standard clone** — `.git` is a *directory* in CWD. → **offer** the migration (6W-b). If the user declines, record `worktree-layout: standard` and move on; `/crew:run` will add per-ticket worktrees off this checkout.

Record the outcome as `worktree-layout` (`bare-clone` or `standard`) in `## Workflow Config`.

### 6W-b — Offer + perform the migration (only on explicit "yes")

Ask first: **"Set up a bare-clone worktree layout so the loop's per-ticket worktrees stay clean? This rewrites the repo directory structure (the old clone is preserved). Say no to keep the standard layout."** Migrate only on an explicit yes.

Target structure:

```
<project>/
  .bare/              ← bare git repo (the actual .git data)
  CLAUDE.md           ← real file at root (not a symlink)
  .claude/            ← real dir at root (not a symlink)
  .mcp.json           ← shared across worktrees
  main/               ← worktree for the base branch (primary working copy)
  wt/                 ← per-ticket worktrees (created by /crew:run)
```

Steps (V1's Step 7b, unchanged in mechanics):

1. **Capture state:** `REMOTE_URL` ← `git remote get-url origin`; `BASE_BRANCH` ← `base-branch` from the config. Identify local-only files to preserve (`.env`, `.env.local`, `.claude/settings.local.json`, `.mcp.json` — anything gitignored/untracked with config). **Stop if the tree is dirty** ("commit or stash first") and warn about any pre-existing external worktrees (`git worktree list`) that would go stale.
2. **Build the new structure** in a temp sibling `<project>-worktree-setup/`:
   - `git clone --bare $REMOTE_URL <project>-worktree-setup/.bare`
   - `git -C <project>-worktree-setup/.bare config remote.origin.fetch "+refs/heads/*:refs/remotes/origin/*"`
   - `git -C <project>-worktree-setup/.bare worktree add ../main $BASE_BRANCH`
3. **Copy local files** identified in step 1 into the new `main/`.
4. **Copy root-level files:** `CLAUDE.md` and `.claude/` from `main/` to the project root as **real** files/dirs (not symlinks) — Claude Code resolves them by walking up from any worktree's CWD.
5. **`mkdir -p wt`** in the new root — per-ticket worktrees go here.
6. **Swap:** `mv <project> <project>-old` then `mv <project>-worktree-setup <project>`.
7. **Report and stop short of deletion:** "Migrated to bare-clone layout. Old repo preserved at `<project>-old/`; delete it once verified with `rm -rf <project>-old`." **Do NOT delete the old repo automatically** — let the user verify first.

### 6W-c — Post-migration

Install dependencies in the new `main/` (detected package manager) and verify git works (`git -C main log --oneline -1`, `git -C main fetch origin`).

### 6W-d — Validate an existing bare-clone layout

If the layout already exists, validate rather than migrate:

1. `.bare/` is a bare repo (`git -C .bare rev-parse --is-bare-repository` → `true`).
2. `main/` is a valid worktree (`.git` file points into `.bare/worktrees/main`).
3. Worktree paths are current (`git -C .bare worktree list`); if stale after a rename, `git -C main worktree repair`.
4. `CLAUDE.md` and `.claude/` exist at the root as real files (copy from `main/` / replace symlinks if not).
5. `wt/` exists (`mkdir -p wt` if missing).
6. Fetch refspec set (`git -C .bare config remote.origin.fetch` → `+refs/heads/*:refs/remotes/origin/*`).

Report what was fixed; if clean: "Bare-clone worktree layout is healthy."

### 6W-e — Document the layout

If `worktree-layout` is `bare-clone`, ensure `CLAUDE.md` has a `## Repository Layout` section (above `## Workflow Config`) describing the structure and the rule to always work from `main/` or a `wt/` worktree, never the repo root. If it already exists, leave it. (Standard layout needs no such section.)

---

## Step 6S — Detect and validate the stack-run config (§4.8)

Both `crew:qa` (e2e) and `crew:reviewer` (Playwright) need the **app running**, and `/crew:run` — not the agents — brings it up per ticket. So capture how to start it, how to know it's ready, and how to keep each ticket's stack from colliding with the developer's own or another ticket's. Detect; don't invent.

### 6S-a — Start command (`start-cmd`)
Find how this project runs its app stack:
- `docker-compose.yml` / `compose.yaml` → `docker compose up` (note any profile/services the app needs).
- `package.json` scripts: `dev`, `start`, `serve` → e.g. `npm run dev`.
- `Procfile` / `foreman` / `overmind` → `overmind start` / `foreman start`.
- Framework defaults already detected in Step 2 (Next.js `next dev`, Vite `vite`, Django `manage.py runserver`, Rails `bin/rails server`, etc.).
Record the real command. If the app genuinely has no start command (e.g. a pure library with no runnable stack), record `start-cmd: none` and note that qa/reviewer will have no live stack to drive.

### 6S-b — Readiness check (`readiness-check`)
How does the orchestrator know the stack is up before it hands off to qa/reviewer? Detect or ask for one of:
- a **health URL** (e.g. `http://localhost:<port>/health` or `/`) to poll until it returns 2xx;
- a **port** to wait on (TCP open);
- a **log line** the start command emits when ready ("ready on", "Listening on", "compiled successfully").
Record `readiness-check` (the URL/port/pattern) and the app's base `port`. Default the health URL to the app root if no dedicated endpoint exists.

### 6S-c — Isolation scheme (`isolation-scheme`)
So a run never collides with the dev's local stack or another ticket, the stack must come up on **issue-derived ports + data namespaces**. Detect which knobs the project exposes:
- which **env vars** set the port(s) (`PORT`, `APP_PORT`, compose `${PORT}` interpolation);
- how **data** is namespaced (DB name/schema, a `COMPOSE_PROJECT_NAME` / container-name prefix, a Redis DB index, a test schema).
Record the scheme as config, e.g. `PORT = <base-port> + (issue# mod N)` and `COMPOSE_PROJECT_NAME = <repo>-<issue#>` — the recipe is config that `/crew:run` evaluates per ticket, **not** a hardcoded value. If the project exposes no port/data override, record `isolation-scheme: none` and warn that concurrent or local-dev collisions are possible.

### 6S-d — Validate it
Confirm the recipe actually works rather than trusting it:
1. Bring the stack up with the configured `start-cmd` under the isolation scheme (an issue-derived port, e.g. test issue `0`).
2. Wait on the `readiness-check`; confirm it goes ready within a sane timeout.
3. Hit the base URL/port once to confirm it serves.
4. Tear it down (`docker compose down`, kill the dev server) and confirm the ports/namespaces are released.

Report: **"Stack: validated / failed to validate / none."** If it fails to come up, ask the user for the correct start command, readiness signal, or isolation knobs — don't write a recipe you couldn't run. Never invent a start command the project doesn't have.

---

## Step 6I — Crew identity (optional GitHub App, §4.17)

By default the loop authenticates as the **ambient user** (your `gh` login + git config), so crew's comments/commits show under your account. A project can opt into a dedicated **GitHub App bot** instead — comments/commits show as `<slug>[bot]`, and a human can natively Approve its PRs. **Opt-in:** skip this and the loop runs as you, unchanged.

Offer it: **"Run crew under a dedicated GitHub App identity (bot comments/commits)? Needs an org-owned App + its private key already created — say no to keep running as your account."** Configure only on an explicit yes **and** only once the App + key exist (creating the App is a manual GitHub step — see the design note / wiki).

On yes, gather and **test before recording**:
1. **Resolve the values.** `app-id` (App settings page); `installation-id` (`gh api /orgs/<owner>/installations --jq '.installations[]|select(.app_slug=="<slug>")|.id'`); the bot git author — name `<slug>[bot]`, email `<bot-user-id>+<slug>[bot]@users.noreply.github.com` (`gh api '/users/<slug>[bot]' --jq .id`).
2. **Place the key + helper per machine, outside any repo.** Private key at `~/.config/crew/crew.pem` (`chmod 600`); install the bundled helper `${CLAUDE_PLUGIN_ROOT}/scripts/gh-token.sh` → `~/.config/crew/gh-token.sh` (`chmod +x`). **Never** inside a repo or a worktree-copied `.env`.
3. **Test it (mandatory).** Run the helper (`CREW_APP_ID=<id> CREW_INSTALLATION_ID=<id> CREW_APP_PRIVATE_KEY_PATH=<path> ~/.config/crew/gh-token.sh`) — it must mint a token; then confirm the token reaches the repo (`curl -fsS -H "Authorization: token <token>" https://api.github.com/installation/repositories` lists it). **If the mint or the reach fails, do NOT record the block** — report the cause (key path / token scopes / which repos the App is installed on) and leave the loop on the user identity. A `crew-identity` the helper can't use makes every component hard-stop (§4.17).

On a green test, record the `crew-identity` rows (Step 7). On decline, record `identity-mode: user` (or omit the block) — the loop runs as the user.

---

## Step 7 — Present the config for confirmation

Assemble the full block and show it before writing. Ask **"Does this look right? I can change any value."** and wait.

```markdown
## Workflow Config

| Key | Value |
|-----|-------|
| repo | `<owner>/<repo>` |
| test-cmd | `npm test` |
| lint-cmd | `npm run lint` |
| build-cmd | `npm run build` |
| e2e-cmd | `npx playwright test` |
| e2e-framework | `playwright` |
| agent-ready-label | `agent-ready` |
| agent-review-label | `agent-review` |
| merge-approval-label | `approved` |
| review-followup-label | `review-followup` |
| agent-planned-label | `agent-planned`  *(planning layer — /crew:plan + /crew:groom file these, never agent-ready)* |
| epic-label | `epic`  *(large-milestone parent; the run loop skips epics)* |
| planning-narrative | `wiki`  *(or `none` — where the milestone narrative + AI journey-map pages live)* |
| planning-promotion | `gated`  *(or `auto-veto` — documented-for-later opt-in)* |
| findings-assignee | `<github-user>`  *(or `none`)* |
| mr-reviewer | `<github-user>`  *(or `none`)* |
| board | `<project number / URL>`  *(or `none`)* |
| priority-field | `Priority`  *(or `none`)* |
| priority-field-id | `IFSS_…`  *(the org issue-field node id; lets plan/groom skip re-resolving — §5d)* |
| status-todo | `TODO` |
| status-in-progress | `In progress` |
| status-in-review | `In review` |
| status-blocked | `Blocked` |
| status-done | `Done` |
| branch-convention | `crew/<issue#>-<slug>` |
| base-branch | `main` |
| merge-method | `squash`  *(or `merge` / `rebase`)* |
| auto-merge | `off`  *(or `low-risk` — opt-in: /crew:merge auto-merges the low-risk slice, §4.16)* |
| worktree-layout | `bare-clone`  *(or `standard`)* |
| start-cmd | `docker compose up`  *(or `none`)* |
| readiness-check | `http://localhost:<port>/health`  *(or a port / log pattern)* |
| port | `3000` |
| isolation-scheme | `PORT = 3000 + (issue# mod 50); COMPOSE_PROJECT_NAME = <repo>-<issue#>`  *(or `none`)* |
| identity-mode | `github-app`  *(or `user` / omit — §4.17)* |
| app-id | `<app id>`  *(github-app only)* |
| installation-id | `<installation id>`  *(github-app only)* |
| private-key-path | `~/.config/crew/crew.pem`  *(per machine, outside any repo)* |
| token-helper | `~/.config/crew/gh-token.sh` |
| git-author-name | `<slug>[bot]` |
| git-author-email | `<bot-user-id>+<slug>[bot]@users.noreply.github.com` |
```

Substitute real detected values. Where a command or board is genuinely absent, write `none` — an honest `none` is better than a command that fails at 3am mid-run.

---

## Step 8 — Write the config to CLAUDE.md

Once confirmed:

1. If `CLAUDE.md` doesn't exist, create it with the `## Workflow Config` section.
2. If it exists with no `## Workflow Config`, append the section.
3. If it exists with a `## Workflow Config`, **replace only that section** — leave every other line of `CLAUDE.md` untouched.

There is **no `_workflow/` directory and no numbered state docs to scaffold** — V2 keeps no on-disk workflow state. The only working file the loop uses (`progress_log`) lives outside the repo and is created by the agents at runtime, not by adjust. Do not create either here.

---

## Step 9 — Advise on setup gaps

After writing, surface (don't auto-fix) the gaps that will bite the loop:

- **No `agent-ready` label yet** — offer to create it: `gh label create <label> --color 0E8A16 --description "Ready for the crew loop"`. The loop needs at least one labeled issue to do anything.
- **No `agent-review` label yet** — offer to create it: `gh label create <agent-review-label> --color FBCA04 --description "Backlog finding — for human planning"`. `/crew:improve` files backlog tickets under it; without the label it can't tag them. (`crew:findings` files unlabeled, MR-blocked tickets and doesn't need it.)
- **No merge-approval (`approved`) label yet** — offer to create it: `gh label create <merge-approval-label> --color 0E8A16 --description "Approved to merge — /crew:merge will land it"`. Without it, `/crew:merge` has no green-light signal and merges nothing.
- **No `review-followup` label yet** — offer to create it: `gh label create <review-followup-label> --color 5319E7 --description "Review follow-up from crew — small, MR-blocked backlog"`. `crew:findings` files small follow-ups under it and `/crew:ticket condense` batches them; without it findings can't tag them.
- **No `agent-planned` label yet** — offer to create it: `gh label create <agent-planned-label> --color C5DEF5 --description "Planned by /crew:plan or /crew:groom — awaiting human promotion"`. The planning layer files its tickets under it; a human promotes them to `agent-ready` in chat. Without it `/crew:plan` and `/crew:groom` can't tag their output.
- **No project Wiki (planning-narrative)** — `/crew:plan` reads the human-authored milestone narrative from the repo's GitHub Wiki. If the Wiki isn't enabled, note it: enable it (repo Settings → Features) and author one page per milestone, or set `planning-narrative: none` to take the narrative from the milestone description instead. Don't enable it for them.
- **No board** — fine; note the loop will run label-only (oldest agent-ready issue first) and won't move cards. Mention a board adds visible TODO → In review tracking and an escalation column.
- **No e2e framework** — warn: `crew:qa` extends a whole-app e2e suite and has nothing to extend without one. Suggest Playwright or Cypress; don't install it.
- **No `start-cmd` (stack)** — warn: `crew:qa` (e2e) and `crew:reviewer` (Playwright) need the app running. With `start-cmd: none` they have no live stack to drive; suggest wiring a dev-server or `docker compose` target. Don't fabricate one.
- **No `isolation-scheme`** — note that with `isolation-scheme: none`, a per-ticket stack can collide with the developer's local stack (and would block future parallelism). Suggest exposing a port env var and a data namespace knob (`COMPOSE_PROJECT_NAME`, a test schema); don't add them silently.
- **Standard worktree layout** — fine; note `/crew:run` will add per-ticket worktrees off the existing checkout. Mention the bare-clone migration (Step 6W) keeps the repo root clean and is available later via `/crew:adjust worktree-layout`.
- **No lint command** — note that the implementation/reviewer agents will skip lint checks.
- **Running as you, not a bot** — with no `crew-identity` configured, crew's comments/commits show under your account. `/crew:adjust` can wire a GitHub App identity (§4.17) so they show as `<slug>[bot]` (and let a human Approve its PRs); needs an org-owned App + key. Offer it; don't set it up uninvited.
- **`progress_log` path not ignored** — it lives outside the repo by default, so usually a non-issue; if the configured location ever lands inside the tree, recommend a `.gitignore` entry so it's never committed.
- **Hooks** — if scope-limiting hooks would help, explain and let the user decide. Never install without consent.

---

## Step 10 — Report

Summarize in a few lines:

1. **Config** — written to `CLAUDE.md` (`## Workflow Config`).
2. **GitHub** — `<owner>/<repo>`, label `<agent-ready-label>`, board (name or `none`), and the four statuses incl. the needs-human/blocked column.
3. **Validated commands** — and any that failed or are missing.
4. **Worktree** — `bare-clone` (migrated/validated) or `standard`.
5. **Stack** — `start-cmd`, readiness signal, isolation scheme; validated / failed / `none`.
6. **Gaps** — the advisories from Step 9.
7. **Next** — "Write a ticket with `/crew:ticket`, then start the loop with `/crew:run`."

---

## Update Mode

When invoked with `update` or a specific key:

1. Read the existing `## Workflow Config`.
2. **Full update** (`update`): re-scan, re-validate commands **and the stack-run config**, re-detect label/board/columns, re-check the worktree layout, and present a diff of old → new values before writing.
3. **Single key**: re-detect just that key (or ask for the value), validate it if it's a command or the stack (`start-cmd` / `readiness-check` / `isolation-scheme`), and update only that row. `worktree-layout` re-runs Step 6W (offer/validate, gated).
4. Write back, replacing **only** the `## Workflow Config` section.

---

## Constraints

**DO:**

- Confirm GitHub auth and a default repo (Step 0) before writing anything — the loop is GitHub-driven.
- Detect commands from actual project files, then **run them** to validate.
- Capture the full ticket-source + merge contract: `agent-ready-label`, `agent-review-label` (the `/crew:improve` backlog), `review-followup-label` (where `crew:findings` files small follow-ups and `/crew:ticket condense` reads them — default `review-followup`), `merge-approval-label` (the `/crew:merge` go-ahead — default `approved`), the board statuses (TODO / In progress / In review / **`status-done`** / a **needs-human/blocked** column), the **`priority-field`** (priority-ordered selection, §4.5), `branch-convention`, `merge-method`, and `auto-merge` (opt-in low-risk auto-merge, default `off`, §4.16) — the loop, `/crew:merge`, and `/crew:ticket condense` read exactly these keys.
- Capture the **planning-layer keys** (§4.20): `agent-planned-label` (what `/crew:plan` + `/crew:groom` file — never `agent-ready`), `epic-label`, `planning-narrative` (the milestone-narrative Wiki source, default `wiki`), and `planning-promotion` (default `gated`; `auto-veto` documented for later). `/crew:plan` and `/crew:groom` read exactly these.
- Capture the **stack-run config** (`start-cmd`, `readiness-check`, `port`, `isolation-scheme`) and **validate** it by bringing the stack up under an issue-derived isolation and tearing it down — qa and reviewer depend on a running, isolated stack.
- Offer the **bare-clone worktree migration** only with explicit consent; record `worktree-layout` either way. Preserve the old repo on migration; never auto-delete it.
- Offer the optional **crew identity** (§4.17): on consent, install the bundled token-helper + key per machine and **test it (mint a token, confirm repo reach) before recording** the `crew-identity` block; never write a block the helper can't use. No consent → omit it; the loop runs as the user.
- Present the config for confirmation before writing it.
- Record `none` for anything genuinely absent, and advise the user about the gap.

**DON'T:**

- Hardcode any org, repo, board, framework, package manager, **start command, port, or isolation value** into this skill — detect each project fresh and read `CLAUDE.md` at runtime.
- Invent a command (or a board column, or a `start-cmd`) that doesn't exist. An honest `none` beats a command that fails mid-run.
- Run the bare-clone migration without explicit consent, or delete the old repo automatically — record `worktree-layout: standard` and let `/crew:run` add worktrees off the existing checkout if the user declines.
- Overwrite anything in `CLAUDE.md` outside the `## Workflow Config` section.
- Create a `_workflow/` directory, numbered state docs, or a committed `progress_log` — V2 has none of these. State lives on GitHub.
- Assume board column names — they vary per board; read them with `gh project field-list` and map to the real strings.
- Skip the confirmation step, or install hooks without consent.

---

## Red flags

If you catch yourself thinking any of these, stop:

- _"This looks like a Node project, I'll assume npm."_ — STOP. Check the lockfile; it may be pnpm, yarn, or bun.
- _"The test command is obviously `npm test`."_ — STOP. Read the scripts and run it. It might be `vitest run`, custom, or absent.
- _"I'll skip validation, the commands look right."_ — STOP. Run them. A plausible-but-broken command poisons every downstream agent.
- _"The board columns are probably TODO / In progress / Done."_ — STOP. List the real fields with `gh project field-list`. The loop moves cards by exact name; a wrong string is a silent no-op.
- _"No board, so I can't configure the loop."_ — STOP. Label-only is a supported mode. Set `board: none` and move on.
- _"This is a web app, the dev server is obviously `npm run dev`."_ — STOP. Read the scripts and the compose file, then actually bring the stack up under the isolation scheme and wait on readiness. A `start-cmd` that never goes ready strands qa and reviewer.
- _"I'll migrate to a bare clone since it's cleaner."_ — STOP. The migration rewrites the repo layout — offer it, get an explicit yes, and never delete the old repo. `standard` is a fully supported layout.
- _"I'll scaffold a `_workflow/` folder like V1 did."_ — STOP. V2 keeps no on-disk state. GitHub (issue, MR, comments, board) is the source of truth.
- _"I'll just write the config and let the user fix it later."_ — STOP. Present it for confirmation first; a config the user never saw is the one nobody trusts.
- _"They gave me the App values, I'll write the `crew-identity` block."_ — STOP. **Test it first** — mint a token and confirm it reaches the repo. A block the helper can't use makes every component hard-stop (§4.17); write it only after a green test.
