# Changelog

## 0.1.0 — 2026-04-30

Initial release.

- `crew init / update / uninstall / list / doctor` against `<cwd>/.claude/skills/` (default) or `~/.claude/skills/` (`--global`).
- Per-skill SHA-256 manifest at `.claude/skills/.skills-manifest.json`.
- Conflict matrix resolves `missing` / `managed-unchanged` / `managed-edited` / `foreign` states across all five commands and the `--force` / `--yes` flags.
- Idempotent `## Workflow Config` append into project `CLAUDE.md`; never touched by `update` or `uninstall`.
- Refuses project-scope install when cwd lacks any of `package.json`, `.git`, `CLAUDE.md`, `pyproject.toml`, `Cargo.toml`, `go.mod`.
- Zero runtime dependencies. Node ≥ 20.
