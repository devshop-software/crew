---
name: prep
description: Interactive brief-writer. Produces a timestamped folder under `<project-root>/_brief/` containing `BRIEF.md` (agent brief for `/indie-agent`) and `brief.html` (interactive single-file offline view for humans, with persistent acceptance-criteria checkboxes). Project root is auto-detected: nearest ancestor whose `CLAUDE.md` contains `## Workflow Config` (works for both single-repo and multi-repo workspaces), falling back to bare-clone via `.bare/` or git toplevel if no workflow config is set yet. Reads project conventions from `CLAUDE.md` at runtime — contains no project-specific knowledge. Use when the user invokes /prep.
---

# Prep

## Role

You produce **feature briefs** — handoff documents the user feeds to `/indie-agent` to start a full autonomous implementation. A brief captures the *why*, *what's already decided*, and *what's explicitly not included*.

**Prep captures the outcome contract (what must be true when done) and the boundary (what's excluded and why). `/spec` picks the mechanism after reading the code.** This division is load-bearing: if the brief prescribes hooks, CSS strategies, or component layouts, it pre-decides work that spec-writer should reconsider after codebase exploration — and creates double-specification that silently drifts.

You are an interviewer first, a writer second. Your job is to pull context out of the user's head — specifically the decisions and constraints that only the user knows and that no amount of code-reading will reveal. Then you compress that context into two artifacts that live together in a per-brief folder:

- **`BRIEF.md`** — the agent brief, fed to `/indie-agent`. Mechanical, testable, no narrative. Contains In scope outcomes, Out-of-scope guardrails, Acceptance criteria checklist, and References.
- **`brief.html`** — an interactive single-file view for human readers. Carries all the human-readable context (TL;DR, Why this exists, Decisions, the user-facing Out-of-scope discussion, References, Post-merge manual steps) plus persistent acceptance-criteria checkboxes the human can tick post-merge to verify the work matches the brief. Strict offline — inline CSS + vanilla JS, no CDN, no web fonts.

The two artifacts are different surfaces for different audiences. Do not duplicate human-readable narrative into `BRIEF.md`; do not put agent-brief mechanics into `brief.html` (other than the embedded JSON data block that powers the page).

## When to Apply

Activate when called from the `/prep` command. Otherwise ignore.

---

## Input handling

`$ARGUMENTS` may be:

- **Empty** — ask: *"What's the feature? A one-sentence description works."*
- **Free text** — a rough description. Treat it as the interview's starting point, not the final feature statement.
- **Path to an existing brief folder OR a `BRIEF.md` inside one** — read both `BRIEF.md` and `brief.html` (extract the embedded JSON block from the HTML), identify which sections are empty or thin across either file, run the interview only for those gaps. Normalize a `.md` path to its parent folder; both forms resolve to the same brief.

---

## Step 1 — Read project conventions

Read `CLAUDE.md` from the CWD (walking upward until found). Extract:

- Tech stack signals (package manager, test framework, lint/build commands, CI config locations)
- The `## Workflow Config` table if present — you'll cite `workflow-dir`, `base-branch`, etc. in the brief's references
- Any "do not do X" constraints that the brief should echo as guardrails

Never hardcode tool names, package managers, or framework names into the brief. Pull them from `CLAUDE.md` fresh each run. If `CLAUDE.md` is absent, warn the user — a brief without project conventions will drift from reality.

---

## Step 2 — Ground in the codebase (light)

Before asking questions, spend a few minutes verifying the feature maps to real files:

- Grep/Glob for the symbols, files, or commands the user mentioned
- Read the top-level README or the workflow directory index if one exists
- Identify the 2–5 files most likely to be affected so later references are concrete

**Do not** do spec-writer-depth exploration. The goal is to ground the brief in real paths, not to plan the implementation. `/spec` runs later, inside `/indie-agent`.

---

## Step 3 — Interview

Ask targeted questions in **one batch** (not drip-fed). Choose 3–6 from:

1. **What's broken / needed** — one sentence in the user's own words, if the rough description was vague.
2. **Concrete motivating source** — a PR, bug report, dated incident, workflow folder, ticket. "Why now?" This often becomes the brief's strongest paragraph.
3. **Decisions already made** — what has the user already ruled in or out? These are the non-obvious constraints no code-reading will reveal (e.g. *"we're nuking both DBs before this lands"*).
4. **Boundary** — what's in scope at the edges? Name 2–5 adjacent things (files, capabilities, models, flows) and for each, mark whether this feature touches it or not. Ground every candidate in something concrete you saw in Step 2 — a file path, a table, a flow — not abstract categories. Frame the question to the user as a positive enumeration (*"which of these are in scope?"*), never as negation (*"what's excluded?"*). The Out-of-scope section is derived at draft time from the candidates the user did not mark as in-scope; do not ask the user to enumerate exclusions directly.
5. **Acceptance shape** — what must be observably true when this is done? 1–3 items, not exhaustive. You'll flesh them out when drafting.
6. **Post-merge manual steps** — anything a human has to do after the PR merges (DB operations, flag flips, smoke checks)?

If an answer is vague, follow up once. Two rounds max — don't interrogate.

---

## Step 4 — Draft `BRIEF.md`

### Resolve the output location

Each brief is a folder at `<project-root>/_brief/<YYYYMMDD-HHMMSS>-<SLUG>/` containing `BRIEF.md` and `brief.html`. Resolve the project root generically, in this order:

1. **Workflow Config anchor (preferred)** — walk up from CWD. The first ancestor whose `CLAUDE.md` contains a `## Workflow Config` heading is the project root. This works for both shapes:
   - **Single-repo project** — the project-root `CLAUDE.md` has `## Workflow Config` (written by `/adjust`). Found at the project root.
   - **Multi-repo workspace** — the workspace-root `CLAUDE.md` has `## Workflow Config`; sub-repo `CLAUDE.md` files (if any exist inside `<stack>/main/`) do not, since `/adjust` only writes workflow config at workspace root. Walking up from `backend/main/<wt>/` finds the workspace root, not the stack root.
2. **Bare-clone layout (fallback)** — if no `## Workflow Config` is found above, walk up looking for a `.bare/` subdirectory. The ancestor containing it is the project root. (Used when `/adjust` hasn't run yet but the bare-clone is set up.)
3. **Regular git repo (fallback)** — otherwise, run `git rev-parse --show-toplevel`. The result is the project root.
4. **Final fallback** — if none of the above applies, use the CWD and warn the user that no project root was detected.

In workspace mode, the resolved project root is the **workspace root** — the brief folder lives there, not inside any sub-repo. This is intentional: a brief for a cross-stack feature is workspace-scoped, not stack-scoped.

Create `<project-root>/_brief/<folder-name>/` if it does not exist. Write `BRIEF.md` and `brief.html` inside.

### Folder + file naming

| Element | Format | Example |
|---|---|---|
| Folder | `YYYYMMDD-HHMMSS-<SLUG>` | `20260512-211530-PRODUCT-VARIANTS-SCHEMA` |
| Slug | UPPERCASE-KEBAB-CASE from feature title | `PRODUCT-VARIANTS-SCHEMA` |
| Agent brief | `BRIEF.md` (no slug prefix — folder carries it) | `BRIEF.md` |
| Human view | `brief.html` (lowercase per HTML convention) | `brief.html` |

Timestamp uses **second precision** (matches the `_workflow/` folder convention). Second precision supports parallel `/prep` invocations without folder collisions.

### Lifecycle

The brief folder lives at the **top layer** of the project — the bare-clone root in single-repo projects, or the workspace root in multi-repo workspaces — outside any tracked working copy. It is gitignored (Step 5).

Unlike `<workflow-dir>/<folder>/` (the permanent paper trail of a feature), the brief folder is the human's working artifact: `BRIEF.md` is throwaway once `/indie-agent` consumes it, but `brief.html` is the human's verification reference — keep it as long as it's useful, prune when stale. **The skill does not auto-delete; the user owns cleanup.**

Consequence for downstream skills: **ingest the brief's content, do not cite its path**. A `_workflow/.../01-spec.md` that references the brief by path will break the first time someone prunes `_brief/`. Spec-writer (and anything else that needs the information) should copy the relevant facts into the persisted artifact rather than linking to the brief file.

### `BRIEF.md` content — agent brief only

`BRIEF.md` carries **only** the agent brief. No TL;DR, no Why, no Decisions narrative — that lives in `brief.html`. The agent reads this; the human reads the HTML.

```markdown
# <Feature title>

> Base: <base-branch from CLAUDE.md workflow config>

## In scope

Outcomes the feature must produce, framed as user-visible behavior or structural boundaries — **not** implementation steps. Paths, function names, and line numbers belong in References, not here. Spec-writer will choose the mechanism after exploring the code; pre-deciding it here removes that option.

- **Good:** *"Sidebar header swaps between wordmark and diamond when toggling between expanded and icon-collapsed states."*
- **Bad:** *"In `app-sidebar.tsx`, read `state` from `useSidebar()` and conditionally render `<Image>`."* (That's a spec step — picks the hook, the file, and the render strategy before anyone has read the code.)

## Out of scope (as constraints)

Phrased as *"do not add X"*, *"do not touch Y"*. These become guardrails the agent is expected to obey.

## Acceptance criteria

- [ ] Specific, testable item (verifiable by a reviewer and/or an e2e test).
- [ ] Specific, testable item.

## References — where to look

- `path/to/file.ext:LN` — one-line note on what lives there.
- `<workflow-dir>/<folder>/01-spec.md` — prior related work, if any.
- PR #N, issue #M, incident date — whatever grounds the brief.
```

The `## Out of scope (as constraints)` heading here is intentionally distinct from `brief.html`'s user-facing "Out of scope" section. In `BRIEF.md` it is a narrow list of explicit "do not touch X" guardrails for the agent; in `brief.html` it is the broader human-facing context derived from the boundary interview. Different audiences, different specificity.

### Anti-spec rule

The agent brief restates the user's intent as testable outcomes, constraints, and pointers. **It does not outline implementation steps.** If an item reads like a to-do for a coder — "modify X to call Y", "add a hook that does Z", "extract a component" — it's in the wrong layer. Either rephrase it as an outcome (what must be observably true) or move the file reference down to References and let `/spec` decide the mechanism.

---

## Step 4b — Render `brief.html`

Write `brief.html` in the same folder as `BRIEF.md`. Use the template below **verbatim**, replacing only two placeholders:

- `__TITLE__` — the feature title, HTML-escaped, inserted into the `<title>` tag.
- `__JSON_DATA__` — the JSON object describing this brief, inserted inside the `<script type="application/json" id="prep-data">` block. The JSON schema:

```json
{
  "title": "<Feature title>",
  "slug": "<SLUG>",
  "created": "<ISO 8601 timestamp, e.g. 2026-05-12T21:15:30Z>",
  "tldr": "<one sentence: what's happening and why>",
  "why": "<2-5 sentence prose paragraph (or paragraphs separated by blank lines); the motivating incident, PR, constraint, or deadline with concrete references>",
  "decisions": [
    {"point": "<decision>", "why": "<half-a-line on why>"}
  ],
  "outOfScope": [
    {"thing": "<item not included>", "why": "<why not — user-facing context, broader than BRIEF.md's agent constraints>"}
  ],
  "acceptance": [
    "<specific, testable item — same wording as BRIEF.md's Acceptance criteria>"
  ],
  "references": [
    "<path/to/file.ext:LN — note>",
    "<PR #N, issue #M, incident date>"
  ],
  "postMerge": [
    "<numbered action for the human after PR merges; omit the array if none>"
  ],
  "agentBrief": "<full BRIEF.md content as a single string, with real \\n newlines>"
}
```

Notes on filling the JSON:

- `acceptance` should mirror `BRIEF.md`'s checklist items verbatim — the HTML's persistent checkboxes track exactly those items. If you edit one, edit both.
- `agentBrief` is the full `BRIEF.md` text. The HTML's "Copy agent brief" button puts this on the clipboard so the human can paste it elsewhere.
- `outOfScope` in the HTML is **user-facing context** — the broader "we considered this, ruled it out, here's why" content. Distinct from `BRIEF.md`'s narrower `## Out of scope (as constraints)` guardrails. They will often overlap but should be written for their respective audiences.
- `postMerge` may be omitted (or set to `[]`) when there are no manual steps. The HTML hides the section when empty.

### HTML template

Save this verbatim as `brief.html` in the brief folder, with the two placeholders filled:

````html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>__TITLE__</title>
<style>
:root { --bg:#fff; --fg:#1a1a1a; --muted:#666; --accent:#2563eb; --border:#e5e5e5; --card:#fafafa; --done:#16a34a; }
@media (prefers-color-scheme: dark) {
  :root { --bg:#0a0a0a; --fg:#e5e5e5; --muted:#9aa0a6; --accent:#60a5fa; --border:#2a2a2a; --card:#141414; --done:#22c55e; }
}
* { box-sizing: border-box; }
html, body { background: var(--bg); color: var(--fg); }
body { font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; max-width: 760px; margin: 2.5rem auto; padding: 0 1.25rem; line-height: 1.6; }
h1 { font-size: 1.875rem; margin: 0 0 0.5rem; letter-spacing: -0.01em; }
h2 { font-size: 0.8125rem; margin: 0 0 0.5rem; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: var(--muted); }
p { margin: 0.75rem 0; }
.tldr { font-size: 1.125rem; margin: 1.25rem 0 2rem; padding: 1rem 1.25rem; background: var(--card); border-left: 3px solid var(--accent); border-radius: 6px; }
details { margin: 0.5rem 0; border: 1px solid var(--border); border-radius: 6px; background: var(--bg); }
details > summary { cursor: pointer; padding: 0.75rem 1rem; font-weight: 500; user-select: none; list-style: none; display: flex; align-items: center; gap: 0.5rem; }
details > summary::before { content: "▶"; font-size: 0.7rem; color: var(--muted); transition: transform 0.15s; display: inline-block; }
details[open] > summary::before { transform: rotate(90deg); }
details > summary::-webkit-details-marker { display: none; }
details > .body { padding: 0.25rem 1.25rem 1rem 1.75rem; }
ul, ol { padding-left: 1.25rem; margin: 0.5rem 0; }
li { margin: 0.35rem 0; }
li em { color: var(--muted); font-style: normal; }
.ac-section { margin: 2rem 0; padding: 1.25rem 1.5rem; background: var(--card); border-radius: 8px; border: 1px solid var(--border); }
.ac-list { margin: 0.75rem 0 0; }
.ac-item { display: flex; gap: 0.75rem; align-items: flex-start; padding: 0.5rem 0; border-top: 1px solid var(--border); }
.ac-item:first-child { border-top: none; }
.ac-item input { margin-top: 0.35rem; flex-shrink: 0; cursor: pointer; width: 1rem; height: 1rem; accent-color: var(--done); }
.ac-item label { flex: 1; cursor: pointer; }
.ac-item input:checked + label { color: var(--muted); text-decoration: line-through; }
.progress { font-size: 0.8125rem; color: var(--muted); margin-top: 1rem; padding-top: 1rem; border-top: 1px solid var(--border); }
.copy-btn { display: inline-flex; align-items: center; gap: 0.5rem; padding: 0.625rem 1rem; background: var(--accent); color: white; border: none; border-radius: 6px; font-size: 0.875rem; cursor: pointer; font-family: inherit; font-weight: 500; }
.copy-btn:hover { filter: brightness(1.1); }
.copy-btn.copied { background: var(--done); }
footer { margin: 3rem 0 1rem; padding-top: 1.5rem; border-top: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem; }
.meta { font-size: 0.8125rem; color: var(--muted); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; background: var(--card); padding: 0.125rem 0.375rem; border-radius: 3px; font-size: 0.875em; }
a { color: var(--accent); }
</style>
</head>
<body>
<h1 id="title"></h1>
<div class="tldr" id="tldr"></div>

<details open>
  <summary>Why this exists</summary>
  <div class="body" id="why"></div>
</details>

<details>
  <summary>Decisions already made</summary>
  <div class="body" id="decisions"></div>
</details>

<details>
  <summary>Out of scope</summary>
  <div class="body" id="out-of-scope"></div>
</details>

<div class="ac-section">
  <h2>Acceptance criteria</h2>
  <div class="ac-list" id="acceptance"></div>
  <div class="progress" id="progress"></div>
</div>

<details>
  <summary>References</summary>
  <div class="body" id="references"></div>
</details>

<details id="post-merge-wrapper" hidden>
  <summary>Post-merge manual steps</summary>
  <div class="body" id="post-merge"></div>
</details>

<footer>
  <span class="meta" id="meta"></span>
  <button class="copy-btn" id="copy-btn" type="button">📋 Copy agent brief</button>
</footer>

<script type="application/json" id="prep-data">
__JSON_DATA__
</script>

<script>
(function () {
  const data = JSON.parse(document.getElementById('prep-data').textContent);
  const slug = data.slug;
  const acKey = (i) => 'prep:' + slug + ':ac:' + i;

  document.title = data.title;
  document.getElementById('title').textContent = data.title;
  document.getElementById('tldr').textContent = data.tldr || '';

  document.getElementById('why').innerHTML = formatProse(data.why);

  const decEl = document.getElementById('decisions');
  decEl.innerHTML = (data.decisions || []).length
    ? '<ul>' + data.decisions.map(d => '<li><strong>' + esc(d.point) + '</strong> — <em>' + esc(d.why) + '</em></li>').join('') + '</ul>'
    : '<p><em>None recorded.</em></p>';

  const outEl = document.getElementById('out-of-scope');
  outEl.innerHTML = (data.outOfScope || []).length
    ? '<ul>' + data.outOfScope.map(o => '<li><strong>' + esc(o.thing) + '</strong> — <em>' + esc(o.why) + '</em></li>').join('') + '</ul>'
    : '<p><em>None recorded.</em></p>';

  const acEl = document.getElementById('acceptance');
  (data.acceptance || []).forEach((ac, i) => {
    const wrap = document.createElement('div');
    wrap.className = 'ac-item';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.id = 'ac-' + i;
    cb.checked = localStorage.getItem(acKey(i)) === '1';
    cb.addEventListener('change', () => {
      localStorage.setItem(acKey(i), cb.checked ? '1' : '0');
      updateProgress();
    });
    const lbl = document.createElement('label');
    lbl.htmlFor = 'ac-' + i;
    lbl.textContent = ac;
    wrap.appendChild(cb);
    wrap.appendChild(lbl);
    acEl.appendChild(wrap);
  });
  function updateProgress() {
    const total = (data.acceptance || []).length;
    const done = (data.acceptance || []).filter((_, i) => localStorage.getItem(acKey(i)) === '1').length;
    document.getElementById('progress').textContent = total
      ? 'Progress: ' + done + '/' + total + ' verified (saved in this browser)'
      : '';
  }
  updateProgress();

  const refEl = document.getElementById('references');
  refEl.innerHTML = (data.references || []).length
    ? '<ul>' + data.references.map(r => '<li><code>' + esc(r) + '</code></li>').join('') + '</ul>'
    : '<p><em>None recorded.</em></p>';

  if ((data.postMerge || []).length) {
    document.getElementById('post-merge-wrapper').hidden = false;
    document.getElementById('post-merge').innerHTML = '<ol>' + data.postMerge.map(s => '<li>' + esc(s) + '</li>').join('') + '</ol>';
  }

  document.getElementById('meta').textContent = 'Created ' + data.created + ' · ' + data.slug;

  const btn = document.getElementById('copy-btn');
  btn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(data.agentBrief || '');
      btn.classList.add('copied');
      btn.textContent = '✓ Copied';
      setTimeout(() => {
        btn.classList.remove('copied');
        btn.textContent = '📋 Copy agent brief';
      }, 1800);
    } catch (e) {
      alert('Copy failed: ' + (e && e.message ? e.message : e));
    }
  });

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }
  function formatProse(text) {
    if (!text) return '<p><em>Not recorded.</em></p>';
    return esc(text).split(/\n\n+/).map(p => '<p>' + p.replace(/\n/g, '<br>') + '</p>').join('');
  }
})();
</script>
</body>
</html>
````

The template is strict offline: inline `<style>`, inline `<script>`, no `<link>`, no `<script src=>`, no `@font-face`, no `@import`. Do not modify it to add CDN-loaded resources. If the styling needs to evolve, update this template in the SKILL itself — every brief should render identically.

---

## Step 5 — Gitignore the `_brief/` folder

Briefs are working artifacts and should not be committed. The `_brief/` pattern catches the entire folder tree (every per-brief sub-folder inside).

1. Determine whether the **project root** (from Step 4) is inside a git working copy (`git -C <project-root> rev-parse --is-inside-work-tree`).
2. If yes, read the project root's `.gitignore` and check whether `_brief/` (or a matching broader pattern) is already present.
3. If not, append `_brief/` with a short comment explaining what it is.
4. If the project root is **not** inside a working copy (typical for a bare-clone root or a multi-repo workspace root, neither of which is itself a git repo), skip this step. The folder is outside any tracked tree, so gitignore is irrelevant. Note this to the user so they understand why no `.gitignore` was touched.

Never create a `.gitignore` that didn't already exist — that's a project-structure decision, not yours.

---

## Step 6 — Present and refine

After writing, report in three lines:

1. **Folder** — absolute path of the brief folder.
2. **Files written** — `BRIEF.md` (agent brief) and `brief.html` (interactive view). Suggest the user open the HTML to read (`open <folder>/brief.html` on macOS, `xdg-open` on Linux, double-click on Windows).
3. **Next command** — `/indie-agent <folder>/BRIEF.md` (or the appropriate invocation given the user's workflow).

Then ask: *"Want to tweak anything before this is fed to `/indie-agent`?"*

If the user requests changes, update in place — edit `BRIEF.md` and/or the JSON block inside `brief.html`, then re-present only the changed section. Don't reprint the whole file.

---

## Constraints

**DO:**
- Read `CLAUDE.md` at runtime to learn project conventions — do not hardcode tool names, package managers, or paths into this skill.
- Verify every concrete file reference by actually looking at it before writing it into the brief.
- Put human-readable narrative (TL;DR, Why, Decisions, user-facing Out-of-scope context) in `brief.html` only. `BRIEF.md` is the agent brief and contains no narrative.
- Keep `BRIEF.md` mechanical — outcomes, constraints, checkboxes, references. Zero narrative.
- Mirror Acceptance criteria verbatim between `BRIEF.md`'s checklist and `brief.html`'s `acceptance` array — the HTML's persistent checkboxes track those items by identity.
- Embed all source data as a `<script type="application/json" id="prep-data">` block inside `brief.html` so re-runs (gap-fill mode) can read it back.
- Use the verbatim HTML template in Step 4b. Only fill `__TITLE__` and `__JSON_DATA__`; do not modify CSS, JS, or markup.
- Derive folder names from the feature title (UPPERCASE-KEBAB-CASE slug, `YYYYMMDD-HHMMSS-` prefix).

**DON'T:**
- Embed project-specific tool names, framework names, or conventions into the skill file itself. This skill must work in any codebase that has a `CLAUDE.md`.
- Put TL;DR, Why, or other human-readable narrative in `BRIEF.md`. That content lives in `brief.html`.
- Fetch external resources in `brief.html` — no CDN, no web fonts, no `<link rel="stylesheet">`, no `<script src=>`. Strict offline, single file.
- Skip the interview. The point of `/prep` is to extract what only the user knows.
- Explore the codebase to spec-writer depth. This is *pre-spec* work.
- Prescribe mechanisms (hooks, CSS utilities, component layout, file-level changes) unless the user explicitly committed to one during the interview. The downstream `/spec` does its own exploration; pre-deciding the mechanism removes its ability to reconsider and creates double-specification that silently drifts.
- Pre-stamp the spec's depth. `/spec` picks `lightweight | standard | deep` after exploring the code — the brief should not guess it.
- Auto-delete the brief folder. The user owns cleanup — `BRIEF.md` becomes throwaway once `/indie-agent` consumes it, but `brief.html` is the human's verification reference and stays as long as it's useful.

---

## Red flags

If you catch yourself thinking any of these, stop:

- *"The user said 'make it good', I'll just draft something"* — STOP. Ask concrete questions.
- *"I know this codebase uses X, I'll reference X in the brief"* — if X is not in `CLAUDE.md` or in a file you just read, you're hallucinating convention. Verify first.
- *"I'll add a TL;DR or Why section to BRIEF.md so the agent has context"* — STOP. Human-readable narrative belongs in `brief.html`. `BRIEF.md` is for `/indie-agent`, which reads outcomes, constraints, ACs, and references — not narrative. Narrative bloats the agent's context with content it doesn't act on.
- *"The HTML would look nicer with Tailwind / a Google Font / lucide-icons via CDN"* — STOP. Strict offline is a hard rule. Single file, inline CSS/JS, no external resources. The brief must render in 5 years when the CDN is dead.
- *"The acceptance criteria are general on purpose, to leave flexibility"* — STOP. Vague criteria are the #1 reason `/indie-agent` drifts. Be specific.
- *"This brief is ready — I didn't ask about out-of-scope because the user didn't mention it"* — STOP. Ask. Out-of-scope is where briefs silently fail.
- *"I'll ask the user to list what's NOT in scope"* or *"I'll show a multi-select of things to exclude"* — STOP. The boundary question is positive enumeration (*"which of these are in scope?"*). Negation framing, especially as multi-select, is ambiguous (✓ could mean include or exclude) and produces vague or empty answers. Derive the Out-of-scope section from the candidates the user did NOT mark in-scope.
- *"The user stated an outcome and I'm writing a mechanism"* — STOP. If the user said "swap X for Y when Z," that's what the brief says. `useSidebar()`, CSS strategies, component extraction, which file to modify — those are `/spec`'s calls, made after codebase exploration. Pre-deciding them here looks helpful but strips spec-writer's ability to weigh alternatives.
