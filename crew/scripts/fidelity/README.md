# crew fidelity tool

The measurement engine behind `crew:ui-review`. It proves a built UI matches the
source-of-truth design by **measuring** computed type + the font-load fact, not by
eyeballing screenshots or probing geometry — the gap that once shipped a heading in
the wrong font past a PASSing gate, because a screenshot cannot see which face loaded.

Pure source, **zero bundled dependencies**: the extraction runs in the Playwright
MCP browser `adjust` already provisions; the comparison runs with plain `node`.

## Pieces

- **`extract-snippet.js`** — a single self-contained arrow function. `crew:ui-review`
  passes its contents to the Playwright MCP `browser_evaluate` tool, in the page,
  on the running build's route and (when available) the design's rendered preview.
  Returns per-element measured styles for visible text-bearing leaves, each element's
  `path` (its nearest `data-testid`/`id` ancestry, what `--scope` matches on), the page's
  `FontFaceSet` (which faces loaded vs unloaded), and resolved `:root` type vars.
- **`compare.cjs`** — pure Node, no deps. Aligns elements **text-first** (visible
  text/accessible-name primary, role secondary, bbox-IoU tie-break), diffs measured
  type, and runs the **token-anchored font-load assertion**: a font face the design
  declares must actually load and be used in the build. Emits a verdict JSON.

## Usage (what the agent runs)

```sh
# 1. (agent) browser_navigate <build route> ; browser_evaluate <extract-snippet.js> -> build.json
# 2. (agent, optional) design render_preview -> serve_url ; navigate + evaluate -> design.json
# 3. (agent) design read_file <tokens.css>
# 4. (agent) git diff --name-only <base>...HEAD -> the --scope patterns
node compare.cjs --build build.json [--design-extract design.json] [--design-css tokens.css] \
                 [--scope <regex> ...]
```

`--design-css` alone (tokens-only) still catches a never-loaded / unused declared
face. `--design-extract` adds per-element type comparison and closes the
token→element ownership gap. The design source being unreachable is the agent's
separate **BLOCKED** verdict.

## What gates

The whole route is always measured and every delta is always reported — but only a
delta the ticket can act on sets `status:FAIL`.

| Dimension | Gates? | Why |
|---|---|---|
| **font-load** MAJOR | always | A declared face that never loads or is never used is a route-level truth — independent of the seeded data and of which slice the ticket owns. It is the assertion this tool exists for. |
| **typography** MAJOR | only in scope | A wrong family/size/weight on an element the ticket touches is its bug; the same delta on shared chrome is real but unfixable here — reported as advisory, for `crew:findings`. |
| **completeness** | never | Elements align on their text, so a design render carrying fixture content reads as "missing" against a build seeded with different content. It measures data parity, not fidelity. Reported as MINOR, capped, never gating. |

`--scope` takes one or more case-insensitive regexes, each matched on its own
against an element's text, `key`, `tag`, `role`, and every entry in its `path`.
Derive them from the diff — the components the ticket changed — never from which
deltas you would rather not see. With no `--scope`, the tool falls back to
whole-route gating (every MAJOR gates), the conservative default. The verdict JSON
carries `checks.scopePatterns` verbatim so the MR comment can publish what was
scoped.

## Test

```sh
node compare.cjs --selftest   # the login regression, the correct-build control,
                              # and the scope/completeness false-positive guards
```
