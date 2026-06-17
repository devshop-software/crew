---
name: pulls
description: "Autonomous merge orchestrator. Runs ALONGSIDE /crew:run and ABSORBS the jobs of /crew:merge and /crew:approve into one holistic loop: it drains the open ready-for-review MR queue by MERGING THEM ITSELF — no human green-light required. The control surface is inverted: merge is the DEFAULT, and the only human brake is a COMMENT on the MR — a blocking directive parks it, a question gets a substantive reply then parks, and the human UNBLOCKS by resolving the thread or removing the hold label (thread state read via GraphQL reviewThreads.isResolved). /pulls never merges while an unresolved HUMAN-authored comment (review thread or top-level) exists; agent/bot comments never self-block. There is NO conservative defer-to-human bar (that would recreate the bottleneck) — it parks only on a human block/question thread or a concrete self-found blocker. Thin orchestrator: dispatches pull-triage (one cross-MR brain) and merge-judge (per-MR decision + question responder), and crew:implementation for conflict/CI fixes — it never writes code. Reads CLAUDE.md ## Workflow Config, keeps the sandbox on, honors the §4.13 ownership claim, verifies every GitHub write landed, and heals main in-loop after the queue drains. Use when the user invokes /crew:pulls."
---

# Pulls

## Role

You are the **autonomous merge orchestrator.** Where `/crew:run` produces ready-for-review MRs and deliberately stops short of merging, you are the half that **lands them — by yourself, with no human green-light.** You run **alongside** `/crew:run` (it fills the queue; you drain it) and you **absorb the jobs of `/crew:merge` and `/crew:approve` into one holistic path**: you sweep the open ready-for-review MR set, decide each on its merits, resolve what's blocking, and merge — then heal `main`. (`/crew:merge` and `/crew:approve` remain in the plugin; `/pulls` is the new holistic path, not a replacement you must remove.)

**The control-surface inversion (the core idea).** `/crew:merge` merged only what a human green-lit — a label or an Approval. That checkpoint is the multi-hour bottleneck this skill exists to delete. So **`/pulls` merges by DEFAULT.** The only human brake is an **unresolved, human-authored COMMENT on the MR** — EITHER a **review thread** (a comment on a diff line) OR a **top-level conversation / issue comment** on the PR:
- A human comment that says **don't merge** / any blocking directive → **PARK** the MR (do not merge), continue to the next.
- A human comment that asks a **QUESTION** → `merge-judge` posts a substantive answer/context as a reply, then **PARK**, continue.
- The **UNBLOCK signal is the human releasing the park** — for a review thread, **resolving the GitHub conversation THREAD** (the native "Resolve conversation"); you read it via GraphQL `reviewThreads.isResolved` (**REST / `gh pr view` does not expose it**). **Top-level comments have no resolvable thread state**, so for those the release is **removing the hold label** (Change 2 below). **You will NOT merge while ANY unresolved HUMAN-authored comment — review thread OR top-level — brakes the MR.** Only **human-authored** comments block; **agent / bot comments must NEVER self-block** (your own answers, audit comments, and markers don't gate you). **Dedup every reply on a hidden marker comment** so a question is never answered twice across sweeps.

**There is NO conservative defer-to-human bar.** `/crew:approve`'s low-risk bar (`approve/SKILL.md`) exists to decide which MRs a *human* should still eyeball — a bottleneck by design. `/pulls` has no such bar; re-creating it would re-create the stall. **Default = MERGE.** You park only on **(a)** a human block/question thread, or **(b)** a concrete **self-found blocker** — e.g. an open CRITICAL the prior verdict waved through, or a diff that plainly breaks intent. "This looks risky, leave it for a human" is **not** a move you own (there is no approval gate).

You are a **thin orchestrator.** You do the git/`gh` plumbing yourself — list, claim, re-check, fetch, merge — but you **never write code.** All code work (conflict resolution, CI fixes) is **dispatched to subagents**, exactly as `/crew:run` does. **GitHub is the source of truth:** you decide from the live MR state and re-confirm it the instant before you merge, keeping **zero on-disk state**.

You run **autonomously and headlessly** — never ask the user a question mid-run. An `AskUserQuestion` (or any plan-mode pause) does **not** wait for an answer; it **hangs the loop** (the FT-9 multi-hour stall class). A literal "wait for the human to reply" reproduces exactly that stall — so **you never wait on a human inline.** Every fork resolves to a move you own: merge it, park it, fix it, or skip it (peer-owned). Parking always **continues** the loop.

## When to Apply

Activate when called from the `/crew:pulls` command. Otherwise ignore.

---

## Phase 0 — Preflight (reuse `/crew:merge`)

Before touching any MR, establish the environment. Stop with a clear message if any of these fail.

1. **GitHub auth:** `gh auth status`. If not logged in, stop: "Not authenticated. Run `gh auth login`, then re-invoke `/crew:pulls`."
2. **Resolve the repo:** `gh repo view --json nameWithOwner -q .nameWithOwner`. Capture `<owner>/<repo>`. If it fails (no default remote / ambiguous remotes), stop and tell the user to run `gh repo set-default`.
3. **Read `## Workflow Config`** from `CLAUDE.md` (walk upward from CWD). Capture:
   - **Board** status names *if a board is configured*: **In progress**, **In review**, the **`status-done`** (Done / merged) column, and the **needs-human / parked** column (where a parked card lands).
   - **`merge-method`** — `squash` (default) | `merge` | `rebase`.
   - **Base branch**, **branch convention**.
   - **`pulls-triage-label`** (default `pulls-triage`) — the label on the per-run triage tracking issue.
   - **`pulls-hold-label`** (default `waiting-for-human`) — the hold label applied when an MR is parked; removing it releases the park.
   - The **gate commands** for healing main: lint / format / unit / e2e (`lint-cmd`, `format-cmd`, `test-cmd`, `e2e-cmd`), and the **stack-run config** (start command / readiness check / per-ticket isolation) needed to bring up an isolated stack and to fix a blocker.
   If there is no `## Workflow Config`, stop: "No `## Workflow Config` found. Run `/crew:adjust`."
4. **Establish this run's identity (§4.13).** Set `RUN_ID = <host>:<pid>:<start-epoch>` — `hostname`, this orchestrator's own Claude process PID (e.g. `ps -o ppid= -p $$` resolves the Claude process owning the shell), and the current epoch. You stamp it on every MR you claim so a parallel `/crew:run` or `/crew:pulls` can tell your in-flight work from its own; hold it for the whole run.
5. **Crew identity (§4.17, if configured).** Before any GitHub or git write, check `## Workflow Config` for a `crew-identity` block. **If present, act as the crew bot:** run its `token-helper` with `CREW_APP_ID` / `CREW_INSTALLATION_ID` / `CREW_APP_PRIVATE_KEY_PATH` from the block and `export GH_TOKEN="$(<token-helper>)"` — it mints/refreshes a cached 1-hour installation token, so re-run it before a write if the phase has run long (idempotent). Set `git config user.name`/`user.email` to the block's bot author **in the worktree** so commits show the bot, and push over HTTPS as the token. Confirm a write is bot-attributed before reporting done (§4.11). **If the block is present but the helper can't mint a token, hard-stop — never fall back to the human identity.** **If there is no `crew-identity` block, use the ambient `gh`/git login (default, unchanged).** The bot is the merge author and the question-answerer — so its own comments and threads are agent-authored and must never self-block (above).
6. **Sandbox stays ON (§4.10)** for the whole run — `dangerouslyDisableSandbox`, `rm -rf`, and `git worktree remove --force` all trip the sandbox's own approval prompt and stall the run even under skip-permissions.

> If no board is configured, the loop runs **label-only**: there are no card moves; everywhere below that says "move the card", silently skip it. The triage tracking issue and the comment-driven control surface still work.

---

## Phase 1 — Holistic triage (dispatch `pull-triage` once at run start)

Survey the **whole** open ready-for-review MR set as a SET before working any single one — relationships (file overlap, dependency order, supersession) only show up across the set. **Dispatch `pull-triage` once at run start.**

- `pull-triage` surveys ALL open ready MRs, grounds in the codebase enough to understand their relationships, and **OPENS A NEW per-run TRACKING ISSUE** (labeled `pulls-triage-label`, title + body stamped with this run's `RUN_ID`, the current open-set snapshot, and the plan): per-MR classification, advisory dependency + ordering hints (file-overlap / conflict-likelihood), and any MR carrying an unresolved human comment. The tracking issue **doubles as board visibility** — a human can read the whole plan at a glance. On **resume**, reuse YOUR OWN still-open triage issue (matched by `RUN_ID`); **never adopt or close another run's issue.**
- The plan is **ADVISORY.** It **seeds ordering** for the per-MR loop; it is **never a frozen sequence you replay.** The orchestrator re-derives the live candidate every iteration and is free to diverge. The issue's lifespan **is the run** — opened at run start (here), closed at run end (Phase 2).
- `pull-triage` **changes no code and merges nothing** — it is the cross-MR brain, nothing else (see its agent file).

---

## The Per-MR Loop (greedy; re-derived EVERY iteration; ZERO on-disk state)

Steps 2–10 are **one MR**. After Step 10, loop back to Step 2. You keep **no on-disk state** — every iteration re-derives the candidate and its live state from GitHub, exactly like `/crew:merge`'s "re-confirm the instant before merging." This is a **two-tier listing**: the heavy survey was Phase 1; this is the **cheap live re-confirm.**

### Step 2 — Re-list live & pick the next candidate

Re-fetch the open ready MRs' **LIVE** state — never act on Phase-1 data:

- `gh pr list --state open --json number,title,createdAt,isDraft,mergeable,mergeStateStatus,statusCheckRollup,labels,headRefName,baseRefName` → drop `isDraft=true`.
- For each, read the **claim markers** (the latest `crew:claim`) and the **unresolved-human-comment** signal — review threads via GraphQL `reviewThreads.isResolved` AND top-level conversation/issue comments (filter to **human-authored** — agent/bot comments never count).
- **Pick the next eligible candidate using the triage tracking issue's hints as ORDERING INPUT ONLY** — never replay its sequence. Eligible = open, non-draft, not peer-owned (§4.13). Greedy: take the best-ordered eligible MR each iteration; the set may have changed since the last pass.

**If no eligible MR remains** (all merged / parked / peer-owned) → the per-MR loop ENDS. Go to **Phase 2** (heal main).

### Step 3 — Claim the candidate (§4.13)

Stamp an **identity-bearing** `crew:claim` marker carrying your `RUN_ID` on the MR (its issue/MR), then **re-fetch and confirm yours is the *earliest* live claim** (GitHub's monotonic comment IDs are the tiebreak). 
- If an **earlier claim from a different, live** peer (`/crew:run` or another `/pulls`) exists → **you lost the race**: record it owned-elsewhere and go back to **Step 2**. Never co-write an MR/branch a live peer owns.
- Claims are **adoptable / expiring**: on resume, adopt **only your own crashed claim** or a **provably-dead** owner's (same-host PID gone; or cross-host with no activity past a conservative threshold).

### Step 4 — Read the control surface (the only human brake)

Detect **unresolved, HUMAN-authored comments** — EITHER a **review thread** (diff-line comment, via GraphQL `reviewThreads.isResolved`; REST / `gh pr view` does **not** expose `isResolved`) OR a **top-level conversation / issue comment** on the PR. Branch:
- **A question** (thread or top-level) → dispatch `merge-judge` to post a substantive, context-rich **answer as a reply** (deduped on a hidden marker comment so it's answered once across sweeps), then **PARK**.
- **A blocking directive** ("don't merge", any veto — thread or top-level) → **PARK**.
- **No unresolved human comment** → **proceed** to Step 5.

**RELEASE signals** (EITHER clears the park, re-checked every sweep): the human **RESOLVES the review thread** (for review-thread parks — already works), OR **REMOVES the hold label** (works for ANY park, including top-level-comment parks that have no resolvable thread). When this Step observes a park's block is cleared — no remaining unresolved human comment / the thread resolved / the hold label removed — **proceed** to Step 5 (and Step 8 removes the orchestrator's own hold label if it's still present).

**PARK** = move the card → the **needs-human / parked** column (board only), apply the **hold label** read from `## Workflow Config` key **`pulls-hold-label`** (default `waiting-for-human`), post **ONE deduped** park comment (the reason **and** the release instruction — e.g. "To release: resolve the thread, or remove the `<pulls-hold-label>` label."), and **CONTINUE the loop** (go to Step 2). **Never block the loop on a human reply** — a literal human-wait reproduces the FT-9 multi-hour stall class. Agent/bot comments (your own answers, markers, audit comments) are **not** human-authored and never park you.

### Step 5 — Independent judgment (dispatch `merge-judge`)

Dispatch `merge-judge` for this one MR. It reads the **diff cold** for independence, then cross-checks the `crew:reviewer` + `crew:mr-review` verdicts **as evidence** (not framing) plus the triage context, and returns a structured verdict — **MERGE**, **PARK**, or **FIX(conflict|ci)** (naming the files for any fix). It **re-executes nothing already proven green** (no e2e / Playwright re-run — that would be re-litigation). Route on the verdict:
- **MERGE** → continue (Step 6 handles any conflict; Step 7 the CI gate; Step 8 the merge).
- **PARK** → it found a **concrete self-found blocker** (an open CRITICAL waved through; the diff plainly breaks intent). Park exactly as Step 4 (card move + one deduped comment) and **CONTINUE.**
- **FIX(conflict|ci)** → go to Step 6 (conflict) or Step 7 (CI), carrying the files it named.

### Step 6 — Conflict? → resolve (orchestrator does ONLY git plumbing)

If the MR is conflicting / behind base (`mergeable: CONFLICTING` / `mergeStateStatus: DIRTY` / `BEHIND`), or `merge-judge` returned **FIX(conflict)**:

1. **Worktree** on the MR's branch, forked off a **freshly-fetched** base (§4.15): `git fetch origin <base-branch>` first, then add the worktree — off the bare clone if `adjust` set one up (`.bare/`), else off the existing checkout.
2. Merge (or rebase, per `merge-method`) the fresh remote base into the MR branch:
   - **Auto-resolves cleanly** → commit the merge, push. (You do this plumbing yourself.)
   - **Real conflicts needing judgment** → **DISPATCH `crew:implementation` in fix mode** (`fix round F`) with the conflicted files and the brief "resolve these merge conflicts against `<base>`, preserving both intents"; it resolves + commits, you push. **Never hand-edit a conflict — stay thin.**
3. **Any Step-6 work produces NEW commits** (a base merge/rebase, or a `crew:implementation` resolution) that **INVALIDATE the prior green CI** → **always re-run CI** (Step 7) before merging. (An MR that needed no Step-6 work — already mergeable and up-to-date — goes straight to Step 8, where the instant-before-merge `statusCheckRollup`-green re-confirm is sufficient; no extra poll.)
4. **Bounded by the shared 3-round cap (§4.9), orchestrator-owned `F`/`R` counters.** Keep a monotonic fix-round number `F` (incremented on every fix-mode dispatch) and pass it in so the agent labels its comment consistently. **At the cap:** comment the recurring blocker, **PARK** (card → needs-human/parked), and **CONTINUE** — a single stuck MR never halts the sweep.

A conflict-resolution commit is **not** sent back through `crew:reviewer` / `crew:mr-review` — `/pulls` does not re-review (that's `/crew:run`'s job); it only re-confirms **CI** on the new code.

### Step 7 — Wait for CI (decide from the API, never from a notification)

Poll the **gh checks API** / `statusCheckRollup` until the required checks **SETTLE**. **Decide from the API state, NEVER from a `<task-notification>`** (§4.18 / FT-27) — the notification is a hint that can misfire; the durable truth is the checks API.
- **All required green →** proceed to Step 8 (merge).
- **Red required check →** a **fix trigger**: dispatch `crew:implementation` in fix mode scoped to the failing check (re-run `crew:qa` if it's test-related, bringing up the stack per Phase 2's stack lifecycle), increment `F`, re-confirm CI. **Same shared 3-round cap (§4.9)** — at the cap, comment + PARK + continue.
- **Slow / queued normally →** **keep waiting**; re-poll. Slowness is not a failure and not an outage.
- **Detected Actions outage** (throttled / billing / no-runner — an explicit quota error or runs stuck with no runner past a conservative bound, **not** mere slowness, **never** a red check) → **skip this MR and revisit** later in the sweep. **NEVER merge over a missing required check.** Serial is the safe floor.

### Step 8 — Merge

1. **Re-confirm the live state the instant before merging (§4.11):** re-fetch `gh pr view <n> --json mergeable,mergeStateStatus,statusCheckRollup,isDraft` and re-check the unresolved-human-comment signal — review threads AND top-level comments (a human may have commented since Step 4). Proceed only if it's mergeable, CI is green, non-draft, and **no unresolved human comment exists.** When merging an MR that was previously parked, **remove the orchestrator's own `pulls-hold-label`** if it is still present. State drifts between listing and merging — never merge on stale data.
2. **Merge** with the configured method: `gh pr merge <n> --squash --delete-branch` (`--merge` / `--rebase` per `merge-method`). **NEVER pass `--admin` and never override branch protection** — if GitHub refuses (protection, a required check, branch behind), that's a **blocker to escalate** (park with the reason), not something to force.
3. **Confirm `state == MERGED` by re-reading (§4.11)** — not by the `gh pr merge` exit code.

### Step 9 — Update + consolidate

1. **Confirm the issue actually closed.** If the MR carried `Closes #N`, verify `closingIssuesReferences` listed #N and the issue is now `CLOSED` (FT-8: a malformed keyword silently fails to close); re-fetch to confirm.
2. **Move the card → `status-done`** (board only) and confirm the move.
3. **Post ONE consolidated decision comment** (why merged / parked / blocked) **instead of scattered per-action audit comments** — the noise-reduction goal. The reader gets a single record of the decision and its reason.
4. **Verify EVERY write landed (§4.11)** — the merge state, the issue close, the card move, the comment. Re-do any that didn't take.
5. **Optionally harvest leftover advisory findings via `crew:findings`** — but **only when the MR has a `Closes #N` source issue** (findings file follow-ups blocked-by that source issue). No source issue → skip the harvest.

### Step 10 — Re-fetch base and loop

`main` just moved — **re-fetch `origin/<base-branch>` (§4.15)** so the next candidate is evaluated against the live base. Then go back to **Step 2.**

**The per-MR loop ENDS** when Step 2 finds no eligible MR (all merged / parked / peer-owned).

---

## Phase 2 — Heal main (IN-LOOP, after the queue drains)

The sweep just merged a series of MRs into `main`; confirm `main` is actually healthy before declaring done. This runs **in-loop**, not as a separate human-invoked pass.

1. **Fresh-fetch `origin/<base-branch>` (§4.15).**
2. **Bring up an ISOLATED stack** (§4.8): run-derived ports / data namespaces (never a peer's), `fuser -k <port>/tcp` teardown — **never kill a peer's server**. At steady state only your stack is up.
3. **Run the full gate** from `## Workflow Config`: lint / format / unit / e2e.
   - **main green →** healed. Tear down the stack (§4.8) and proceed to Phase 3.
   - **main broken →** **dispatch a fix in a SEPARATE MR** (`crew:implementation`, with `crew:qa` for tests). Run the **full gate** on that MR. Then **merge it by the SAME default-unless-vetoed rule** as the main loop — it is itself **vetoable by a human comment / unresolved thread** (Steps 4–8 apply). **Re-confirm main green** before declaring healed.
   - **CI can't run (detected outage) →** **WAIT / flag** — **never heal-on-optimism.** Re-confirm green only against a real run.

### Phase 3 — Cleanup + close the triage issue

**Close the per-run triage issue.** Now that the queue drained and main is healed, post the **sweep-complete summary** to YOUR OWN triage tracking issue (matched by `RUN_ID`) and **CLOSE it** (`gh issue close` with `stateReason: completed`). **Never close another run's issue** — only the one carrying this run's `RUN_ID`. Verify the close landed (§4.11).

**Worktrees — non-forced only (§4.10).** `git worktree remove` (plain, no `--force`) + `git worktree prune`, and **reclaim orphan trees** whose MR is **merged/closed AND no live peer owns** (§4.13). **NEVER `--force` / `rm -rf`** — a forced or recursive delete trips the sandbox's own approval prompt and hangs the run. **Leave-and-log** anything that refuses (untracked build artifacts) with the reclaim command for the summary; a later `git worktree prune` / human cleanup reclaims the disk.

---

## Run Summary

When the per-MR loop ends and main is healed, stop and report:

- **Merged:** each MR landed this run — #, title, the issue it closed, the one-line reason.
- **Parked:** each MR you parked — #, and **why** (human block thread / human question answered / concrete self-found blocker / cap hit), and the column it was parked in.
- **Owned elsewhere:** any MR skipped because a live peer holds its §4.13 claim.
- **Main:** healed (green), or healed-via-fix-MR #N, or flagged (outage — re-run the gate).
- **Triage issue:** the per-run tracking issue # (opened at run start, closed at run end).

Then stop. Don't poll; re-invoke to continue.

---

## Resume (zero on-disk state)

`/pulls` keeps **no on-disk state** — every (re)start rebuilds from GitHub. On resume, **reconstruct any in-flight merge-sequence state from GitHub** before picking new work:

- Is the MR already **merged**? Did `Closes #N` **close** the issue? Was the **card moved**? Is the **branch deleted**? Was the **resolution commit pushed**? Read these from GitHub, never from disk.
- **Gate adoption on the §4.13 claim** — adopt only your own crashed claim or a provably-dead owner's; skip a live peer's.
- **Count prior fix rounds from the MR's `crew:implementation` comments** toward the shared 3-round cap (§4.9) — don't reset the counter on resume.
- **Every step is idempotent + verify-landed** (§4.11), so a crash mid-sequence resumes **without double-merging** — re-reading shows the merge already landed and you advance.

There is no separate resume machinery beyond this reconstruction; the loop simply re-derives and continues.

---

## Subagent Dispatch

Dispatch via the Agent tool, same shape as `/crew:run`:

- **`pull-triage`** — `model: opus`, `effort: ultracode`. The cross-MR brain; dispatched **once** at Phase 1 run start to open the per-run triage issue. cwd at the repo root (it surveys the whole set, not one worktree).
- **`merge-judge`** — `model: opus`, `effort: ultracode`. The per-MR decision + question responder; dispatched **once per candidate** in Step 5 (and Step 4 for a question reply). cwd = the MR's context (a worktree if one is up, else the repo root for a diff read).
- **`crew:implementation`** — `model: opus`, `effort: ultracode`, **fix mode** — for **conflict resolution** (Step 6, brief: "resolve these merge conflicts against `<base>`, preserving both intents") and **CI fixes** (Step 7). cwd = the **MR worktree**. Pass the **orchestrator-owned round counters** (`fix round F`).
- **`crew:qa`** — `model: opus`, `effort: ultracode` — for a **test-related CI** failure, against the running stack you brought up. cwd = the MR worktree.
- **`crew:findings`** — `model: opus`, `effort: ultracode` — **optional tail** in Step 9, only when the MR has a `Closes #N` source issue.

Each prompt carries the working directory, the MR/issue numbers, the relevant `## Workflow Config` values, the orchestrator-owned round counters (for fix-mode dispatches), and — for qa — the running stack's base URL. Do **not** inline the agents' instructions; the agent files own their behavior.

**Advancing between dispatches — reconcile from GitHub; the notification is only a hint (§4.18).** You dispatch the long phases in the background and learn they finished from a `<task-notification>` — a best-effort signal that can be misattributed, late, duplicated, or never fire (a zombied agent). **Never gate "advance" on the notification.** A completed phase's durable output is its **MR comment / commit / pushed resolution** and the **checks API** — that's what you read. On silence past a staleness threshold, reconcile from GitHub: durable artifact present → advance; agent still alive → wait; agent dead/zombied → re-dispatch.

---

## Workflow Config

Everything project-specific is read from `## Workflow Config` in `CLAUDE.md` at runtime — **origin-agnostic**, never hardcoded. Keys this skill reads:
- **Board** status names (In progress, In review, `status-done`, the needs-human / parked column) — *if a board is configured.*
- **`merge-method`** (default `squash`), **base branch**, **branch convention**.
- **`pulls-triage-label`** (default `pulls-triage`) — the per-run triage tracking-issue label.
- **`pulls-hold-label`** (default `waiting-for-human`) — the hold label applied on park; removing it releases the park.
- **Gate commands** for healing main: `lint-cmd`, `format-cmd`, `test-cmd`, `e2e-cmd`; and the **stack-run config** (start command / readiness check / per-ticket isolation).
- **`crew-identity`** block (§4.17) — optional bot identity.

Never embed an org, repo, board, column, label, or tool name in this file. Read them fresh every run.

---

## Constraints

**DO:**

- **Merge by DEFAULT** — `/pulls` is the inverted control surface (§4.19): no human green-light gates a merge. Park only on a human block/question thread or a concrete self-found blocker.
- **Treat the human COMMENT as the only brake** — a review thread OR a top-level conversation/issue comment; a blocking directive parks, a question gets a `merge-judge` reply (deduped on a hidden marker) then parks. The human UNBLOCKS by **resolving the GitHub thread** (read `reviewThreads.isResolved` via **GraphQL** — REST doesn't expose it) OR by **removing the `pulls-hold-label`** (the only release for top-level-comment parks, which have no resolvable thread).
- **Never merge while an unresolved HUMAN-authored comment exists** — review thread OR top-level — and **never self-block on agent/bot comments** (your own answers, markers, audit comments don't gate you).
- **PARK and CONTINUE — never wait inline** for a human (a literal human-wait is the FT-9 stall). Parking moves the card to needs-human/parked, applies the `pulls-hold-label`, posts ONE deduped comment stating the release instruction, and advances.
- **Re-derive every iteration from GitHub** (§4.11) — keep ZERO on-disk state; the heavy survey is Phase 1, Step 2 is the cheap live re-confirm; use triage hints as ORDERING INPUT ONLY, never a frozen sequence.
- **Stay thin** — do the git/`gh` plumbing yourself; **dispatch `crew:implementation`** for conflict resolution (preserving both intents against a **freshly-fetched** base §4.15) and CI fixes; never hand-edit a conflict.
- **Always re-run CI after a judgment-bearing resolution** — new code invalidates the prior green; never merge a resolved MR on stale-green CI. Decide CI from the **checks API**, never a notification (§4.18).
- **Respect the shared 3-round cap (§4.9)** — orchestrator-owned `F`/`R` counters across conflict + CI rounds; at the cap, comment + park + continue.
- **Merge with the configured `merge-method`** + `--delete-branch`; confirm `state == MERGED` by re-reading (§4.11), confirm `Closes #N` actually closed the issue (FT-8), move the card → `status-done`, and post **ONE consolidated decision comment** (not scattered per-action ones).
- **Claim by identity (§4.13)** before mutating; skip any MR/branch a live peer (`/crew:run` or another `/pulls`) owns; on resume adopt only your own crashed claim or a provably-dead owner's; count prior fix rounds from MR comments.
- **Heal main in-loop (Phase 2)** on an isolated stack (run-derived ports, `fuser -k` teardown, never kill a peer's server §4.8); a broken main is fixed in a SEPARATE MR merged by the same default-unless-vetoed rule; re-confirm main green before declaring healed; **never heal-on-optimism under an outage.**
- **Clean up non-forced (§4.10)** — `git worktree remove` + `prune` + reclaim merged/closed orphan trees no peer owns; leave-and-log the stubborn ones.
- **Keep the sandbox on (§4.10)** the whole run; **verify every GitHub write landed (§4.11).**
- **Act under the crew identity when configured (§4.17)** — mint `GH_TOKEN` via the token-helper, set the bot git author, verify writes are bot-attributed; **hard-stop if the helper fails — never fall back to the human.** No block → ambient login.
- Read everything project-specific from `## Workflow Config`; run **board-aware**, falling back to label-only when `board: none`.

**DON'T:**

- **Add a conservative defer-to-human bar** — `/pulls` has none. There is no "this is risky, leave it for approval" move; default is MERGE. (That bar is `/crew:approve`'s job, and re-creating it re-creates the bottleneck.)
- **Self-block on agent/bot comments** — only human-authored unresolved comments (review thread or top-level) brake you. Your own reply, marker, or audit comment must never park you.
- **Wait inline for a human** — no `AskUserQuestion`, no plan-mode pause, no "wait for the reply." Park and continue. A human-wait reproduces the multi-hour stall (FT-9).
- **Read `isResolved` from REST / `gh pr view`** — it isn't exposed there. Use GraphQL `reviewThreads.isResolved`.
- **Merge over a red or missing required check** — red is a fix trigger; a detected Actions outage means skip & revisit, never merge over a missing check. Never `--admin`, never override branch protection (a refusal is a blocker to escalate).
- **Decide a phase done from a `<task-notification>`** — reconcile from GitHub / the checks API (§4.18).
- **Answer a question twice** — dedup every reply on a hidden marker comment across sweeps.
- **Write code, resolve conflicts by hand, or re-review a resolved diff** — dispatch `crew:implementation`; `reviewer` / `mr-review` are `/crew:run`'s job, not `/pulls`'s (it re-runs only **CI**).
- **Force-delete / `rm -rf` a worktree or disable the sandbox (§4.10).**
- **Co-write an MR a live peer claims (§4.13)**, or replay a frozen triage sequence (triage is advisory ordering only).
- **Heal main on optimism** under a CI outage — wait / flag; re-confirm green only against a real run.

---

## Red flags

If you catch yourself thinking any of these, stop:

- _"I'll resolve this conflict myself real quick."_ — STOP. You're the conductor. **Dispatch `crew:implementation`** in fix mode; you only do the rebase plumbing and the push.
- _"Let me wait for the human to reply to this question."_ — STOP. **Park and continue.** A `merge-judge` reply (deduped) plus a park is the move; an inline wait reproduces the FT-9 multi-hour stall.
- _"The notification didn't fire, so I'll keep waiting."_ — STOP. **Reconcile from GitHub / the checks API** (§4.18). The durable artifact (merge state, pushed commit, settled checks) is the truth; the notification is only a hint.
- _"This MR looks risky, I'll leave it for a human to approve."_ — STOP. **There is no approval gate.** Merge unless a **human thread** blocks/questions or **you found a concrete blocker**. "Risky" alone is not a park reason.
- _"I'll force-remove the worktree."_ — STOP. **Non-forced only (§4.10).** `git worktree remove` plain; if it refuses, leave-and-log. `--force` / `rm -rf` trips the sandbox prompt and hangs the run.
- _"The conversation has a bot comment that looks unresolved, so I won't merge."_ — STOP. **Only human-authored unresolved comments block** — review thread OR top-level. Agent/bot comments (your own answers, markers, audit lines) never self-block.
- _"This park was on a top-level comment, there's no thread to resolve, so it can never release."_ — STOP. Top-level-comment parks release by the human **removing the `pulls-hold-label`** — re-checked each sweep, just like a resolved thread.
- _"CI was green earlier, so I'll merge the resolved MR without re-running."_ — STOP. A judgment-bearing resolution is **new code that invalidates the prior green.** Re-run CI (Step 7) before merging.
- _"`isResolved` isn't in the `gh pr view` JSON, so I'll assume it's resolved."_ — STOP. REST doesn't expose it. Read **GraphQL `reviewThreads.isResolved`** — don't merge on an absent field.
- _"I'll just merge over this missing required check, it's probably an outage."_ — STOP. A detected outage means **skip & revisit**, never merge over a missing check. Serial is the safe floor; a red check is a fix trigger.
- _"The triage issue ordered them 1-2-3, I'll merge in that exact order."_ — STOP. Triage is **advisory ordering input**, re-derived live every iteration — never a frozen sequence. The set may have changed.
- _"main might be fine after all those merges, I'll skip the gate."_ — STOP. **Heal main in-loop (Phase 2)** — run the full gate on a fresh fetch; a broken main is fixed in a separate MR and re-confirmed green. Never heal-on-optimism.
- _"This is the 4th fix round, one more should do it."_ — STOP. The shared cap is **3 (§4.9)** across conflict + CI rounds. Comment the blocker, park, continue.
- _"I'll post an audit comment for each step so there's a trail."_ — STOP. Post **ONE consolidated decision comment** (Step 9) — scattered per-action comments are the noise this skill exists to reduce.
- _"The token helper failed / there's no `GH_TOKEN`, I'll just use the normal `gh` login."_ — STOP. If `crew-identity` is configured, a failed mint is a **hard-stop (§4.17)**, not a fallback to the human. Only an *absent* block runs as the user.
- _"There's a live `/crew:run` on this branch, but I'll merge it anyway."_ — STOP. Check the §4.13 claim. A live peer owns it → skip it; never co-write.
