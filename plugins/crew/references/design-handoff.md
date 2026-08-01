# Codex design handoff

Codex uses a repository-tracked Claude Design export because the Anthropic Design MCP cannot complete authorization from Codex. Claude Code continues to use the design server in the target repository's root `.mcp.json`; this contract applies only to the generated Codex package.

## Load the handoff

1. Read `.crew.rc` and resolve `config.design-handoff` relative to the active worktree root, not relative to the directory that contains the shared config in a bare-clone layout.
2. Treat `none`, a missing archive, a failed validation, or a missing relevant exported page as an unavailable design source for UI work; follow the calling role's BLOCKED or escalation contract and continue non-UI work normally.
3. Materialize the current archive with `sh ${CREW_PLUGIN_ROOT}/scripts/design-handoff.sh <archive>`; the command validates the ZIP, extracts it read-only into a fresh temporary directory, and prints that absolute directory.
4. Read `CLAUDE.md` and `SKILL.md` inside the materialized handoff first, then consult `tokens/`, `components/`, `styles.css`, and the root-level HTML page matching the route in scope.
5. Treat the handoff's tokens and component files as the declared-value oracle and its matching standalone HTML page as the rendered cross-check; never substitute the live app, memory, or a merely similar page for a missing design page.
6. Read only from the materialized directory. Re-run the helper on every dispatch and re-review so a replaced ZIP is picked up without a config or checksum change.

## Render a page

Open the matching root-level HTML file with Playwright using a `file://` URL and run the packaged fidelity extraction snippet against it. If the browser cannot load local files, serve only the temporary materialized directory on an ephemeral loopback port, stop that server after extraction, and never modify or commit the extracted files.
