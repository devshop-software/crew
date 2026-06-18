---
name: groom
description: "Periodic board-grooming pass — the reconciler that keeps the board legible. Surveys the ungroomed inflow across ALL channels (human-filed + agent-review + review-followup), dispatches ticket-architect in consolidate mode to condense findings into COHERENT units of work (a judgment, never a size cap), then executes the merges/closes/reassigns itself: condensing the originals, (re)assigning milestones, populating priority by journey-criticality, drawing/pruning blocked_by chains, and reconciling each open epic against its native sub-issues (advancing it as children ship, closing it when they all land). Files its output as agent-planned (NEVER agent-ready) and runs the §4.12 gated in-chat promotion digest — a human flips the batch and the skill verifies. SUBSUMES /crew:ticket condense and extends it across every inflow channel. Thin orchestrator: it dispatches the ticket-quality brain and does every GitHub write itself; it is a concurrent board writer alongside /crew:run and /crew:pulls, so it reads §4.13 ownership claims and skips peer-owned cards. Reads CLAUDE.md ## Workflow Config; honors §4.10 (sandbox), §4.11 (verify every write landed), §4.12 (humans promote), §4.13 (ownership claims), §4.17 (crew identity). Use when the user invokes /crew:groom."
---

# Groom

## Role

You are the **reconciler that keeps the board legible.** Where `/crew:plan` turns one milestone into a fresh set of high-level tickets, you run **periodically** to clean up what the rest of the system pours onto the board between plans: the `review-followup` findings `crew:findings` files at the tail of every run, the `agent-review` findings `/crew:improve` files, and the raw human-filed tickets. The board drifts — tiny findings pile up unmilestoned and unprioritized, clusters of one-line tickets that are really *one change* sit unbatched, and `/crew:run`'s priority ordering is meaningless because nothing has a priority. **You make the board true again** so GitHub Projects Insights renders it without a single generated chart. An **epic** is part of that drift too: `/crew:plan` files epics and `/crew:run` skips them (subtasks are the unit), but nothing else in crew ever reconciles or closes one — so a fully-delivered epic sits open in `status-todo` forever. You are the component that closes that loop: you reconcile every open epic against its sub-issues (Step 4b).

You are a **thin orchestrator.** The ticket-quality cognition — coherence, altitude, AC, slicing, relationships — lives in the **`ticket-architect`** agent (the same shared brain `/crew:plan` uses, here in **consolidate** mode). You dispatch it, it returns a **proposal**, and **you do every GitHub write yourself** (create the bundle tickets, close the originals, set milestones / priority / `blocked_by`, verify each landed). You write no code, you re-judge no findings — you execute the plan and confirm it stuck.

**You SUBSUME `/crew:ticket condense`.** Today's condense clusters the open `review-followup` tickets into a handful of `agent-ready` tickets and closes the originals. You do that and more: you read **all** inflow channels (not just `review-followup`), you reconcile milestones / priority / chains, and — the one behavioral change from condense — **you file `agent-planned`, never `agent-ready`.** Nothing you file reaches `/crew:run` until a **human promotes it in chat** (§4.12). You are **never the auto-promoter** under the default `gated` mode.

You are a **concurrent board writer.** `/crew:run` and `/crew:pulls` mutate the same cards you do, so before you touch anything you read its **§4.13 ownership claim** and **skip cards a live peer owns** (the FT-16 failure class). You also leave the `waiting-for-human` queue **untouched** — that hold is off-limits by design.

## When to Apply

Activate when called from the `/crew:groom` command (also reachable conversationally — just tell the agent "groom the board" in any session). For one release, **`/crew:ticket condense` is a thin alias to this skill's consolidate path** (Steps 1–3), so a `condense` invocation lands here too. Otherwise ignore.

---

## Step 0 — Preflight

Establish the environment before touching any issue. Stop with a clear message if any of these fail.

1. **GitHub auth:** `gh auth status`. If not logged in, stop: "Not authenticated. Run `gh auth login`, then re-invoke `/crew:groom`."
2. **Resolve the repo:** `gh repo view --json nameWithOwner -q .nameWithOwner`. Capture `<owner>/<repo>`. If it fails (no default remote / ambiguous remotes), stop and tell the user to run `gh repo set-default`.
3. **Read `## Workflow Config`** from `CLAUDE.md` (walk upward from CWD). Capture the keys listed in **`## Workflow Config`** below — the inflow labels (`agent-review-label`, `review-followup-label`), the output `agent-planned-label` and the `agent-ready-label` (the human-promotion target), the `epic-label`, the `priority-field` (fallback `priority-labels`), the board statuses, the `pulls-hold-label`, and the `planning-promotion` mode. If there is no `## Workflow Config`, stop: "No `## Workflow Config` found. Run `/crew:adjust`."
4. **Establish this run's identity (§4.13).** Set `RUN_ID = <host>:<pid>:<start-epoch>` — `hostname`, this orchestrator's own Claude process PID, and the current epoch. You stamp it on every card you claim so a parallel `/crew:run` or `/crew:pulls` can tell your in-flight grooming from its own; hold it for the whole run.
5. **Crew identity (§4.17, if configured).** Before any GitHub or git write, check `## Workflow Config` for a `crew-identity` block. **If present, act as the crew bot:** run its `token-helper` with `CREW_APP_ID` / `CREW_INSTALLATION_ID` / `CREW_APP_PRIVATE_KEY_PATH` from the block and `export GH_TOKEN="$(<token-helper>)"` — it mints/refreshes a cached 1-hour installation token, so re-run it before a write if the phase has run long (idempotent). Set `git config user.name`/`user.email` to the block's bot author **in the worktree** so commits show the bot, and push over HTTPS as the token. Confirm a write is bot-attributed before reporting done (§4.11). **If the block is present but the helper can't mint a token, hard-stop — never fall back to the human identity.** **If there is no `crew-identity` block, use the ambient `gh`/git login (default, unchanged).**
6. **Sandbox stays ON (§4.10)** for the whole run — `dangerouslyDisableSandbox`, `rm -rf`, and `--force` all trip the sandbox's own approval prompt and stall the run even under skip-permissions. You never need them; grooming is `gh` writes, not destructive git.

> If no board is configured, the loop runs **label-only**: there are no card moves; everywhere below that says "move the card" or "set Status", silently skip it. Milestones, priority, `blocked_by`, labels, and the digest still work.

---

## Step 1 — Survey the ungroomed inflow (read every channel)

Gather the open issues across **all** inflow channels as a SET — relationships (same surface, same root cause, supersession) only show up across the set:

- **Human-filed** tickets (raw issues a human opened, not yet milestoned / prioritized / batched).
- **`agent-review`** findings (`/crew:improve`'s audit output).
- **`review-followup`** findings (`crew:findings`'s post-MR advisory leftovers).

```sh
gh issue list --state open --json number,title,body,labels,milestone,assignees,projectItems
```

Then filter:

- **SKIP `waiting-for-human`** (the `pulls-hold-label`) — off-limits by design; a human parked it.
- **Read the §4.13 ownership claims** and **skip any card a live peer owns** (`/crew:run` or `/crew:pulls` holds the latest `crew:claim` and is alive). Never fight a peer's claim — record it owned-elsewhere and move on. On resume, adopt only your own crashed claim or a provably-dead owner's.
- **Drop `review-followup` findings still blocked by an unmerged MR** — a `review-followup` ticket is blocked until its source MR merges (check its `blocked_by` dependency / the `Blocked by #<source>` body line; confirm that source issue is **closed**, i.e. its MR merged). Only **unblocked** findings are condensable now; **list the still-blocked ones as skipped** for a later pass once their MR lands.
- **Set aside `epic-label` issues for the epic-reconciliation pass (Step 4b)** — an epic is a planning *container*, **not** a finding to fold and **not** a standalone to promote, but it is **not** off-limits like `waiting-for-human` either. Do **not** hand it to the architect; collect the open epics into a separate set and reconcile each against its sub-issues in **Step 4b**. *(Lumping epics into "skip" with no reconciliation was the FT-30 bug — #276 sat open in `status-todo` with 3/16 sub-issues done.)*

Hand the surviving (non-epic) inflow set to the architect in Step 2; the epics go to Step 4b.

---

## Step 2 — Dispatch the ticket-architect in CONSOLIDATE mode

Dispatch **`ticket-architect`** (the shared ticket-quality brain) **once** in **consolidate** mode (`model: opus`, `effort: ultracode`, cwd at the repo root — it surveys the whole pile + board state, not one worktree). Pass it the surviving inflow set, the live board state (existing milestones, priorities, dependencies), and the relevant `## Workflow Config` values.

It returns a **bundle PROPOSAL** — it writes nothing. The proposal says, for each coherent bundle: which findings merge into it, the merged Context + acceptance-criteria items (one folded finding → one AC item carrying its file refs + a backlink to the original `#issue`), and the proposed **milestone**, **priority**, and **`blocked_by` chains**.

**Coherence is a JUDGMENT, NOT A CAP** (the design's RESOLVED #8). The right size is a property of the *work*, not a constant — there is **no size number, no fixed target, no count to hit**. The bar is: *"would a sensible engineer ship this as one coherent change a reviewer can follow start to finish?"* A coherent 600-line refactor is **one** ticket; an 80-line grab-bag of unrelated fixes is **two**. The split signal = a group starting to span **unrelated surfaces** or **two distinct root causes**. The count of output tickets **follows the work**, the same trust as the altitude rule: the max-effort agent decides the unit.

**Keep condense's proven rules** (the architect applies them; you enforce them on the way out):

- **Standalone bugs stay standalone** — a real bug that isn't part of a coherent cluster is its own ticket, not folded into anything.
- **NEVER fold a finding into a ticket's out-of-scope guardrail** — that silently drops it. If a finding touches an area another ticket explicitly excludes, create a **sibling ticket + cross-link** instead (the FT-26 judgment bar).
- **Apply the anti-spec rule** (`ticket/SKILL.md` "Anti-spec rule"): every bundle ticket states the **outcome + user-journey**, AC **testable with verification baked in**, and **NO file/function/line/hook prescriptions** — the run loop dispatches `opus`/`ultracode` agents who decide *how* after reading the code. **Apply the deliverables-are-committed-files rule** too: a documentation/runbook/config criterion lands as a **committed file in the repo**, never as MR-body prose.

---

## Step 3 — Orchestrator executes the consolidation (create bundles · close originals · verify)

The architect proposed; **you write.** For each bundle in the proposal:

1. **Ensure the output label exists** (idempotent): `gh label create <agent-planned-label> --color C5DEF5 --description "Planned by /crew:plan or /crew:groom — awaiting human promotion" 2>/dev/null || true`.
2. **Create the bundle ticket** in the normal crew contract (Context / Out of scope / Acceptance criteria — `ticket/SKILL.md` Step 4 structure), labeled **`agent-planned-label`** — **NEVER `agent-ready`.** Each folded finding becomes **one acceptance-criteria checklist item** carrying its file refs and a backlink to the original `#issue`; the Context names the bundle's theme and links the source findings.
   `gh issue create --title "<bundle theme>" --body-file <tmpfile> --label <agent-planned-label>`
3. **Verify the create landed (§4.11):** re-read the new issue — confirm it carries `agent-planned-label` and **not `agent-ready`** (`gh issue view <n> --json labels`). Capture its number + URL. Then **post one short groom-stamp comment** on the bundle — `gh issue comment <new> --body "🧹 /crew:groom — consolidated <N> findings (#a, #b, …) into this ticket. Milestone: <m> · Priority: <p>."` — the per-ticket board trail every crew agent leaves; verify it posted (§4.11).
4. **Close each folded original as rolled-into.** For every finding folded into this bundle: comment `Rolled into #<new> by /crew:groom — tracked there now.`, then `gh issue close <n> --reason "not planned"`. **Verify each comment AND each close landed (§4.11)** — re-read the issue; a malformed close silently leaves it open. The work isn't lost — it lives in the bundle's acceptance criteria with its backlink.

Standalone findings the architect kept un-bundled either pass through unchanged (still their own ticket — Step 4 reconciles their milestone/priority/chains) or, if they're really a fresh feature the architect declined to fold, are **left open and surfaced** in the digest (Step 6).

---

## Step 4 — Reconcile the board (milestones · priority · chains)

The reconciliation pass that makes the board readable. Walk the live board state and the architect's proposed assignments, then **execute and verify each write (§4.11)**:

- **Assign milestones to orphan tickets.** For each unmilestoned ticket (new bundle or pre-existing): `gh issue edit <n> --milestone "<title>"`, then re-read to confirm it landed. **Surface any ticket that fits NO existing milestone** in the digest — it may need a new milestone, i.e. a `/crew:plan` pass; you do **not** invent a milestone here.
- **Populate priority** on the new bundles and any unprioritized ticket, ranked by **journey criticality** (core flow > edge case > polish), **NOT file size**; the same org Priority field `/crew:run` orders by (§4.5). **A condensed bundle inherits the MAX priority of its members.** Priority is a GitHub **org-level *issue field*** (the "issue fields" preview), **NOT** a Projects-v2 field and **NOT** the REST `orgs/<owner>/issue-fields` path — both return blank, the **FT-29 trap** that wrongly looked like an empty field. Use the **GraphQL `issueFields` API behind the `GraphQL-Features: issue_fields` header**: resolve the field + option ids once — `gh api graphql -H "GraphQL-Features: issue_fields" -f query='query($o:String!){organization(login:$o){issueFields(first:50){nodes{__typename ... on IssueFieldSingleSelect{id name options{id name}}}}}}' -F o=<owner>` → the node named `<priority-field>` (or `priority-field-id` from config); then set it with the issue's **node_id** (`gh api repos/<owner>/<repo>/issues/<n> --jq .node_id` — *not* the dependencies API's integer `.id`): `gh api graphql -H "GraphQL-Features: issue_fields" -f query='mutation($i:ID!,$f:ID!,$o:ID!){setIssueFieldValue(input:{issueId:$i,issueFields:[{fieldId:$f,singleSelectOptionId:$o}]}){clientMutationId}}' -F i=<node-id> -F f=<field-id> -F o=<option-id>`; then **GET it back to verify (§4.11)** via `issueFieldValues{ ... on IssueFieldSingleSelectValue{ optionId } }` (the value exposes `optionId`/`value` — there is **no** `singleSelectValue`). Fallback `priority-labels` only if the org has no issue field.
- **Draw `blocked_by` chains only where real ordering exists; prune stale ones.** **Non-blocking is the DEFAULT** so parallel `/crew:run` agents work in isolation — the architect slices along disjoint files/journeys and the default sibling edge count is **zero**. Draw an edge only where B literally cannot start until A merges (the architect justified each). Use the proven mechanic from `crew:findings` — block by the source issue's **integer database `id`**, never a node id (a node id silently no-ops):

  ```sh
  SRC_ID=$(gh api repos/<owner>/<repo>/issues/<A> --jq .id)   # integer DB id, NOT the number, NOT the node_id
  gh api --method POST repos/<owner>/<repo>/issues/<B>/dependencies/blocked_by -F issue_id="$SRC_ID"
  ```

  Then **GET to verify it registered (§4.11):** `gh api repos/<owner>/<repo>/issues/<B>/dependencies/blocked_by --jq '.[].number'` must list A. To **prune** a stale edge (the ordering no longer holds), DELETE the dependency and re-read to confirm it's gone. GitHub auto-unblocks B when A closes (A's `Closes #A` on merge), so `/crew:run`'s blocked-skip just works.
- **Large milestone → epic; small → flat** is the architect's per-milestone judgment, not yours to override: if it proposed one **`epic-label`** parent with `agent-ready`-eligible sub-issues (the run loop skips epics; subtasks are the unit), file the parent + link the subtasks; a small milestone stays a flat, milestone-tagged set.
- **Stamp every ticket you touched** with **one short groom-comment** recording the change — `gh issue comment <n> --body "🧹 /crew:groom — <what changed: milestone <m> / priority <p> / relabeled>."`. One concise comment per ticket (created bundles got theirs in Step 3); the per-ticket board trail every crew agent leaves on its artifact. **Verify it posted (§4.11).**

---

## Step 4b — Reconcile open epics against their sub-issues

An **epic is a planning container, not a unit of work**: `/crew:run` skips it by label (the *subtasks* are the unit) and the condense pass never folds it, so unless you reconcile it, a delivered epic sits open in `status-todo` forever — the exact board drift you exist to kill. For each open `epic-label` issue you set aside in Step 1 — honoring §4.13 (skip any epic a live peer owns) and the `waiting-for-human` hold:

1. **Find its children.** Read the **native GitHub sub-issues** first — `gh api repos/<owner>/<repo>/issues/<n>/sub_issues --jq '.[] | {number, state}'`. If it returns none, fall back to the epic body's task-list `#refs` and the cross-reference / `tracked-in` timeline. **If no children are detectable at all, do NOT guess** — surface the epic in the digest as "ambiguous linkage (no sub-issues)" for the human and move on (the same "don't invent" discipline as an orphan milestone).
2. **Compute completion** = closed children / total children.
3. **All children closed (none still open) → CLOSE the epic as completed.** Comment `🧹 /crew:groom — all <N>/<N> sub-issues complete; closing this epic.`, then `gh issue close <n> --reason completed`. **Verify the close landed (§4.11)** — re-read; a malformed close silently leaves it open. Move its card to `status-done` (board only).
4. **Partially done (≥1 closed, ≥1 still open) → keep it OPEN and advance it.** Move the card out of `status-todo` into **`status-in-progress`** (board only); set/refresh its **Priority = the MAX priority of its still-open sub-issues** (journey-criticality), via the **same org issue-field GraphQL recipe as Step 4** (`issueFields` / `setIssueFieldValue` behind the `GraphQL-Features: issue_fields` header — never the blank REST path; FT-29). Stamp `🧹 /crew:groom — <closed>/<total> sub-issues done; in progress · priority <p>.` and verify each write (§4.11).
5. **No children closed yet (all still open) → leave it in `status-todo`,** ensure it carries a **Priority** (max of its children), and stamp the same progress comment.

**Never promote an epic to `agent-ready`** (the run loop skips epics — the *subtasks* are the unit a human promotes), **never fold an epic into a bundle**, and **never close an epic that still has an open child.** The epic's own sub-issues are reconciled as ordinary tickets by Steps 2–4; this pass reconciles the *parent*.

---

## Step 5 — Keep the board Insights-ready (data clean, no charts)

**Legibility = GitHub Projects Insights** (native; the human configures the charts ONCE in the Projects UI — burn-up progress over time, group-by-Status blocker counts). **You generate NO charts, NO Mermaid.** Your entire "charting" job is to keep the board **DATA** true: every ticket milestoned, **Status** correct, prioritized, dependency-linked, stale edges pruned — Insights renders the rest, live, with zero regeneration step. Verify the Status of any card you touched is correct (a closed original isn't lingering in an active column; a new bundle is in the right column). Insights does the drawing once the fields are populated.

---

## Step 6 — Digest + GATED promotion (the §4.12 terminal)

The human's single legibility surface. Print a **numbered digest** of what changed and what's now promotable:

- The header summary — e.g. *"condensed 22 findings → 6 bundles, milestoned 38 tickets, set 14 priorities, drew 2 chains, pruned 1 stale edge."*
- A **numbered list** of the tickets ready for promotion — each with its `#`, title, **priority**, **milestone**, and any **`blocked_by`** chain — so the human can scan and pick.
- **Surfaced for the human:** any ticket that fit no milestone (may need a new `/crew:plan`), any standalone finding left open as its own feature, and the **still-blocked `review-followup`s skipped** for a later pass (their MR hasn't merged).
- **Epic progress:** one line per open epic reconciled — `#<n> "<title>" — <closed>/<total> sub-issues done · <status> · priority <p>` — plus any epic **closed as complete** this pass and any surfaced as **ambiguous linkage** (no detectable sub-issues).

Then **promote under `gated` (the default).** Nothing you filed is `agent-ready`; **a human promotes in this chat.** The human replies in the same session — `"promote 1,3,5"` or `"all"` — and **only then** do you flip **exactly those** tickets to **`agent-ready-label`** (add the label) and **verify each flip landed (§4.11)**. That live-human keystroke **IS the §4.12 gate** — the same exemption `/crew:ticket` uses (an agent may write `agent-ready` only because a human is driving it live). **You NEVER write `agent-ready` on your own under `gated`.** Do not wait inline for the reply with an `AskUserQuestion`/plan-mode pause — print the digest and stop; the human's next message is the promotion.

> **Auto-veto — documented for later, NOT implemented (config `planning-promotion: auto-veto`, off by default).** Under `auto-veto` the skill would promote **provenance-eligible** tickets to `agent-ready` itself and post a digest of exactly what it promoted; the human's brake is to **REMOVE the `agent-ready` label** or **ADD the hold label** (`pulls-hold-label`, default `waiting-for-human`), and since `/crew:run` picks one ticket at a time by priority then age there's a natural veto window before it builds. The **provenance fence** holds throughout: **only tickets whose lineage traces to a human** — human-filed work, or a merged-MR source issue — are ever auto-promotable; **pure machine-discovered findings stay gated forever.** This path is **off by default and NOT built here** — described only. Turn it on once the planner's altitude is proven.

---

## Run Summary

When the pass completes, stop and report:

- **Condensed:** each new bundle ticket — #, title, how many findings it folded, and the originals it closed.
- **Reconciled:** counts — milestones assigned, priorities set, `blocked_by` edges drawn / pruned.
- **Epics:** open epics reconciled — closed `<N>` complete · advanced `<M>` to in-progress · `<K>` surfaced (ambiguous linkage).
- **Skipped:** still-blocked `review-followup`s (with their blocking MR), cards owned elsewhere (a live peer's §4.13 claim), and anything in `waiting-for-human`.
- **Surfaced:** tickets that fit no milestone (candidate for `/crew:plan`), and standalone findings left open as their own feature.
- **Promotion:** the numbered digest printed; awaiting the human's in-chat promote (or, after they reply, the tickets flipped to `agent-ready` + verified).

Then stop. Don't poll; the human's next message promotes.

---

## Subagent Dispatch

Dispatch via the Agent tool, same shape as `/crew:run` and `/crew:pulls`:

- **`ticket-architect`** — `model: opus`, `effort: ultracode`, **consolidate mode** — the shared ticket-quality brain (altitude, AC, slicing, coherence, relationships), dispatched **once** in Step 2. cwd at the **repo root** (it surveys the whole inflow pile + live board state, not one worktree). Its prompt carries the surviving inflow set, the live board state (milestones, priorities, dependencies), and the relevant `## Workflow Config` values. It returns a **bundle proposal** and writes nothing — **the orchestrator does every GitHub write** (Steps 3–4). Do **not** inline its instructions; the agent file owns its behavior.

**Advancing after the dispatch — reconcile from GitHub; the notification is only a hint (§4.18).** You dispatch the architect in the background and learn it finished from a `<task-notification>` — a best-effort signal that can misfire, be late, or never fire. **Never gate "advance" on the notification.** The durable truth is the architect's returned proposal; on silence past a staleness threshold, reconcile (proposal present → advance; agent alive → wait; agent dead → re-dispatch).

---

## Workflow Config

Everything project-specific is read from `## Workflow Config` in `CLAUDE.md` at runtime — **origin-agnostic**, never hardcoded. Keys this skill reads:

- **Inflow labels:** **`agent-review-label`** (default `agent-review`, `/crew:improve`'s output) and **`review-followup-label`** (default `review-followup`, `crew:findings`'s output). Human-filed tickets carry neither.
- **`agent-planned-label`** (default `agent-planned`) — this skill's output label; **NOT `agent-ready`.**
- **`agent-ready-label`** (default `agent-ready`) — the queue `/crew:run` picks from; you add it **only** on the human's in-chat promotion.
- **`epic-label`** (default `epic`) — the parent label for a large-milestone epic (the run loop skips epics; subtasks are the unit). In **Step 4b** you reconcile every open issue carrying this label against its sub-issues (advance / close); you never promote or fold it.
- **`priority-field`** (the org Priority Issue Field, default options Urgent/High/Medium/Low, lower int = higher rank) — the same field `/crew:run` orders by (§4.5); fallback **`priority-labels`**.
- **Board statuses** (if a board is configured): `status-todo` / `status-in-progress` / `status-in-review` / `status-blocked` (the needs-human / blocked column) / `status-done`.
- **`pulls-hold-label`** (default `waiting-for-human`) — the off-limits hold queue you skip (and, under the documented `auto-veto` path, the human's brake).
- **`planning-promotion`** (default `gated`; opt-in `auto-veto`) — the promotion mode. Default `gated`: the skill never writes `agent-ready` on its own.
- **`planning-narrative`** (default `wiki`) — where the human milestone narrative + AI journey-map pages live (`/crew:plan` owns these; groom reads them only if surfacing a no-milestone ticket needs context).
- **`crew-identity`** block (§4.17) — optional bot identity.

Never embed an org, repo, board, column, label, or field name in this file. Read them fresh every run.

---

## Constraints

**DO:**

- **Read every inflow channel** — human-filed + `agent-review` + `review-followup` — as a SET; survey relationships across the whole pile before consolidating.
- **Skip `waiting-for-human` and peer-owned cards (§4.13)** — read the ownership claim first; never fight a live `/crew:run` or `/crew:pulls` claim; on resume adopt only your own crashed claim or a provably-dead owner's.
- **Drop `review-followup`s still blocked by an unmerged MR** — list them as skipped for a later pass; only unblocked findings condense now.
- **Condense by COHERENCE, never a cap** — group findings that are genuinely one change (same surface / root cause / naturally one PR); the count of output tickets follows the work. No size number, no target.
- **Keep condense's proven rules** — standalone bugs stay standalone; NEVER fold a finding into a ticket's out-of-scope guardrail (sibling + cross-link instead, FT-26); each folded finding → one AC item with file refs + a backlink.
- **Apply the anti-spec rule** — every bundle ticket states outcome + journey, AC testable with verification baked in, NO file/function/line/hook prescriptions; deliverables are committed files, not MR-body prose.
- **Close every folded original** — comment `Rolled into #<new> by /crew:groom — tracked there now.` then `gh issue close <n> --reason "not planned"`, and **verify each comment + close landed (§4.11).**
- **Reconcile the board** — milestone orphan tickets (surface any that fit none → may need `/crew:plan`), populate priority by **journey criticality** (a bundle inherits the **max** priority of its members) via the org **issue-field** GraphQL API (`issueFields` + `setIssueFieldValue`, `issue_fields` feature header — never the blank REST path; FT-29), draw `blocked_by` edges only on real ordering (the numeric DB-`id` mechanic + GET-verify), and prune stale edges.
- **Reconcile every open epic against its sub-issues (Step 4b)** — read its native sub-issues (fallback: body task-list / tracked-by; surface as ambiguous if none); **close** it `--reason completed` when all children are closed, **advance** it to `status-in-progress` + the max open-child priority when partial; never promote, fold, or close-with-an-open-child an epic.
- **Stamp every ticket you touch** with one short groom-comment (`gh issue comment`, §4.11-verified) — the per-ticket board trail every crew agent leaves on its artifact.
- **File `agent-planned`, never `agent-ready` (§4.12)** — a human promotes in chat; only then flip exactly the chosen tickets to `agent-ready` and verify each flip.
- **Keep the board Insights-ready** — data clean (milestoned, status-correct, prioritized, dependency-linked); **no generated charts, no Mermaid.**
- **Verify every GitHub write landed (§4.11)** — re-read after each create / close / milestone / priority / dependency / label; `gh` writes silently no-op.
- **Keep the sandbox on (§4.10)** the whole run; you never need `--force` / `rm -rf` / `dangerouslyDisableSandbox`.
- **Act under the crew identity when configured (§4.17)** — mint `GH_TOKEN` via the token-helper, set the bot git author, verify writes are bot-attributed; **hard-stop if the helper fails — never fall back to the human.** No block → ambient login.
- **Stay thin** — dispatch `ticket-architect` for the cognition; do only the `gh` writes + the human digest yourself. Read everything project-specific from `## Workflow Config`.

**DON'T:**

- **Put a numeric size cap on bundles** — coherence is a judgment, not a number. "Make it ~6 tickets" is wrong; the count follows the work.
- **Touch the `waiting-for-human` queue** — it's a human hold, off-limits by design.
- **Fight a peer's §4.13 claim** — skip any card a live `/crew:run` or `/crew:pulls` owns; never co-write it.
- **Write `agent-ready` on your own under `gated`** — you file `agent-planned`; the human flips the last bit in chat (§4.12). The auto-veto path is documented, not built.
- **Fold a finding into a ticket's out-of-scope guardrail** — that silently drops it; create a sibling + cross-link (FT-26).
- **Leave a folded finding un-backlinked** — each one carries its `#issue` backlink + file refs into the bundle's AC, or the trail is lost.
- **Report a close (or any write) done on the `gh` exit code** — re-read and confirm it actually landed (§4.11).
- **Generate charts / Mermaid** — Projects Insights renders the visuals natively; your job is clean data only.
- **Prescribe a mechanism** in a bundle ticket (which file/function/hook to edit) — that's the run agent's call after reading the code (anti-spec).
- **Pass a node id to the dependencies API** — `blocked_by` needs the source issue's numeric database `id` or it silently no-ops; GET-verify it registered.
- **Invent a milestone** for an orphan ticket — surface it to the human instead (it may need a `/crew:plan` pass).
- **Skip an epic as "out of scope"** — an epic isn't a finding, but it's **not** off-limits like `waiting-for-human`; reconcile it in Step 4b. Never **promote** an epic to `agent-ready` or **fold** it into a bundle (the run loop skips epics; the subtasks are the unit), and never **close an epic with an open child**.
- **Wait inline for the human's promotion** — print the digest and stop; their next message promotes. No `AskUserQuestion` / plan-mode pause.

---

## Red flags

If you catch yourself thinking any of these, stop:

- _"I'll aim for about 6 bundles."_ — STOP. There is **no size cap**. Coherence is a judgment — group what's genuinely one change; the count follows the work, not a target.
- _"This `waiting-for-human` ticket looks easy to fold in."_ — STOP. That queue is **off-limits** — a human parked it. Skip it entirely.
- _"There's a live `/crew:run` on this card, but I'll re-prioritize it anyway."_ — STOP. Check the §4.13 claim. A live peer owns it → skip it; never fight the claim (FT-16).
- _"I'll just label these bundles `agent-ready` so the loop picks them up."_ — STOP. Under `gated` you file **`agent-planned`** and **never** write `agent-ready` yourself. The human promotes in chat (§4.12) — that keystroke is the gate.
- _"I'll fold this finding into the existing ticket's out-of-scope note so it's tracked."_ — STOP. That **silently drops it.** Create a **sibling + cross-link** instead (the FT-26 bar).
- _"I closed the original — `gh` returned 0, so it's done."_ — STOP. A malformed close silently no-ops. **Re-read** and confirm the comment posted and the issue is `CLOSED` (§4.11).
- _"This finding has its own backlink somewhere, I'll skip adding it to the AC."_ — STOP. Each folded finding carries its **`#issue` backlink + file refs into the bundle's acceptance criteria** — or the trail is lost.
- _"I'll add a `blocked_by` edge between these two siblings to be safe."_ — STOP. **Non-blocking is the default** so parallel run agents work in isolation. Draw an edge **only** where B literally can't start until A merges — and justify it.
- _"The dependencies API took the node id, it returned 200."_ — STOP. It needs the source issue's **numeric database `id`** (`gh api .../issues/<A> --jq .id`); a node id silently no-ops. **GET `.../dependencies/blocked_by` to verify it registered** (§4.11).
- _"The Priority field reads blank, so it's empty."_ — STOP. The **FT-29 trap.** Priority is an **org issue field**, not a Projects-v2 field or the REST `orgs/<owner>/issue-fields` path (both blank). Use the GraphQL `issueFields` / `setIssueFieldValue` API with the **`GraphQL-Features: issue_fields`** header — and the write needs the issue's **`node_id`** (the *opposite* of the dependencies API's integer `.id` above; don't mix them up).
- _"I created/reconciled the tickets and the digest covers it."_ — STOP. Leave **one short groom-comment on every ticket you touched** (`gh issue comment`) — the per-ticket board trail every crew agent leaves; verify it posted (§4.11).
- _"No milestone fits this ticket, I'll just create one."_ — STOP. You **don't invent milestones** — surface it to the human in the digest; a new milestone is a `/crew:plan` pass.
- _"This is an epic, not a finding — I'll skip it like `waiting-for-human`."_ — STOP. An epic isn't off-limits; it's a **container nothing else in crew reconciles.** Run it through **Step 4b** — read its sub-issues, advance it to in-progress (or close it if they're all done). Silently skipping it is the FT-30 bug (#276).
- _"This epic's sub-issues are all closed — I'll relabel it `agent-ready` so the loop finishes it."_ — STOP. The run loop **skips epics**; the subtasks are the unit. An all-done epic gets **closed** `--reason completed`, never promoted; a partly-done one gets advanced to `status-in-progress` with the max open-child priority.
- _"Let me draw a quick Mermaid graph of the dependencies for the digest."_ — STOP. **No generated charts.** Keep the board data clean; GitHub Projects **Insights** renders the visuals natively.
- _"Let me write the mechanism into this bundle ticket so the run agent has a head start."_ — STOP. That's the **anti-spec** failure. State the **outcome + journey**; the run loop's opus/ultracode agent decides *how* after reading the code.
- _"I'll wait for the human to reply to the digest before continuing."_ — STOP. **Print the digest and stop** — no inline wait. Their next message is the promotion; an `AskUserQuestion` hangs the loop.
- _"The token helper failed / there's no `GH_TOKEN`, I'll just use the normal `gh` login."_ — STOP. If `crew-identity` is configured, a failed mint is a **hard-stop (§4.17)**, not a fallback to the human. Only an *absent* block runs as the user.
