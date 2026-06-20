# HTML rendering — mechanism & rules

The HTML representation of a skill is produced **by code, not by an agent**. `render.mjs` parses a skill's Markdown and emits HTML; an LLM never writes or rewrites the HTML. This is the whole point: the same `SKILL.md` always yields byte-identical HTML, so the rendered page can never drift away from the source it documents.

This html workflow is indiependent of the rules used to write skills, and is not to be taken into account. It's purely used by the human to render the skills for readability purposes.

## Files

- [`render.mjs`](render.mjs) — the converter. Dependency-free Node (stdlib only), component-based: every Markdown block maps to one small render function.
- [`template.htm`](template.htm) — the HTML shell. Holds the whole look-and-feel (embedded CSS) and four placeholders, each wrapped in double curly braces: `title`, `description`, `type`, `body`. Edit the CSS here and re-render to restyle; nothing about the appearance lives in `render.mjs`.
- `<name>.html` — the output, named after the skill's frontmatter `name` (e.g. `adjust` → `adjust.html`). The first render target is the `adjust` skill from the repo.

## Running it

`node render.mjs <path-to-SKILL.md> [--type skill|agent|orchestrator] [--out <dir|file.html>] [--name <name>] [--description <text>]`

`--type` sets the header badge; if omitted it is inferred from the input path (`agents/` → agent, `orchestrators/` → orchestrator, else skill). `--out` defaults to the `_config/` folder, so by default the page renders next to the code; pass an explicit `.html` file to write the page exactly there (e.g. a folder's `skill.html`) instead of `<name>.html` in a directory. `--name` / `--description` override the frontmatter — used to render the per-type previews (`skills/` · `orchestrators/` · `agents/` → `skill.html`), whose `template.md` carries no top frontmatter of its own.

## Block → HTML mapping

Every Markdown block renders to its appropriate tag. Tables and code blocks are **their own components** — richer wrappers, not a bare tag.

| Markdown block                           | Renders as                                                                                                                                                          |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| YAML frontmatter (`name`, `description`) | the page header — `name` → title, `description` → lead (inline-rendered), `type` → badge                                                                            |
| `#`…`######` heading                     | `<h1>`…`<h6>`, each with a slug `id` for anchoring                                                                                                                  |
| paragraph                                | `<p>`                                                                                                                                                               |
| `-` / `*` / `+` bullets                  | `<ul><li>` (nesting by indentation; consecutive same-type siblings share one list)                                                                                  |
| `1.` numbered items                      | `<ol><li>`                                                                                                                                                          |
| pipe table                               | **table component** — `<div class="md-table-wrap"><table class="md-table">` with `<thead>` / `<tbody>`, zebra rows, and per-column alignment from the separator row |
| fenced code block                        | **code component** — `<figure class="md-code">` with a language label, a copy button, and `<pre><code>`                                                             |
| `>` blockquote                           | `<blockquote>` (its contents are parsed as blocks)                                                                                                                  |
| `---` / `***` / `___` rule               | `<hr />`                                                                                                                                                            |

Inline runs render inside any prose block: `**bold**`, `_italic_` / `*italic*`, `***bold-italic***`, `~~strike~~`, `` `code` ``, and `[text](url)`.

## Rich rendering

Beyond the plain block→tag mapping, the body is grouped into one `<section>` per H2, and a few template-standard structures get a richer treatment:

| Structure                             | Renders as                                                                                                                                                                                                                            |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| frontmatter `name` / `description`    | page `<title>`, `<meta name="description">`, and the header (title + lead)                                                                                                                                                            |
| every H2                              | the heading plus a one-line **section note** explaining what that part of the skill does — generated per skill and hardcoded in `render.mjs` (`SECTION_NOTES`, keyed by `name` → H2 text), written from the `template.md` perspective |
| a **steps** section                   | any section whose body carries `### Step N — Name` headings (detected by content, so `## Steps`, the orchestrator's `## The Loop`, and a `## <Mode> Mode` block all qualify) — each step becomes a `<details>` **accordion** (number badge + title; the first is open); the `---` dividers between steps are absorbed |
| `### DO:` / `### DON'T:`              | green / red **callout** cards, stacked full-width one below the other                                                                                                                                                                 |
| `### Red flags`                       | a neutral **callout** (no colour fill); the quoted thought is tinted via `--quote` and each `STOP` imperative is highlighted red                                                                                                      |
| the **last H2 section** (Constraints) | wrapped in a **feature card** (`.skill-section--feature`) for extra visual weight                                                                                                                                                     |

These hooks key off the standard heading shapes from `template.md` — the callout/feature hooks off the section names, the accordion off the presence of `### Step N — Name` headings — so they apply to any skill that follows the template; the per-H2 section notes are the one piece authored by hand per skill.

## Invariants

- **Deterministic.** No timestamps, no randomness — re-rendering an unchanged input reproduces the exact same bytes.
- **Code blocks are opaque.** Markdown or JSONC inside a fence (e.g. an example `.crew.rc` block) is escaped literal text, never parsed.
- **No drift.** The HTML is never hand-edited or agent-synthesised; change the Markdown or the template and re-run.
- **Header, not duplicate.** The frontmatter drives the page header, and a leading `# Name` heading that merely repeats `name` is dropped so the title is not shown twice.
- **Never put a live placeholder token (double-brace `title`/`body`/etc.) in `template.htm` prose or comments** — `render.mjs` substitutes every occurrence, so a token in a comment would inject a second copy of the content.
