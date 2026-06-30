# crew fidelity tool

The measurement engine behind `crew:ui-review`. It proves a built UI matches the
source-of-truth design by **measuring** computed type + the font-load fact, not by
eyeballing screenshots or probing geometry (the gap that shipped a wrong heading
font past a PASSing gate — see the FT-41 design-log entry).

Pure source, **zero bundled dependencies**: the extraction runs in the Playwright
MCP browser `adjust` already provisions; the comparison runs with plain `node`.

## Pieces

- **`extract-snippet.js`** — a single self-contained arrow function. `crew:ui-review`
  passes its contents to the Playwright MCP `browser_evaluate` tool, in the page,
  on the running build's route and (when available) the design's rendered preview.
  Returns per-element measured styles for visible text-bearing leaves, the page's
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
node compare.cjs --build build.json [--design-extract design.json] [--design-css tokens.css] --mode shadow|enforce
```

`--design-css` alone (tokens-only) still catches a never-loaded / unused declared
face. `--design-extract` adds per-element type comparison and closes the
token→element ownership gap. `--mode enforce` gates (MAJOR → `status:FAIL`);
`--mode shadow` is advisory (always `status:PASS`, reports `wouldFailUnderEnforce`).
The design source being unreachable is the agent's separate **BLOCKED** verdict.

## Test

```sh
node compare.cjs --selftest   # the login regression + the correct-build control
```
