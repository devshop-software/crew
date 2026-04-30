## [0.2.1](https://github.com/devshop-software/crew/compare/v0.2.0...v0.2.1) (2026-04-30)


### Bug Fixes

* don't print "Next: ... /adjust" line when init refused ([8175644](https://github.com/devshop-software/crew/commit/81756442a00e39955e0bebd2dd7f6687df2479a7))

# [0.2.0](https://github.com/devshop-software/crew/compare/v0.1.0...v0.2.0) (2026-04-30)


### Features

* ship real skill content (12 skills incl. prep) ([b86bd9a](https://github.com/devshop-software/crew/commit/b86bd9abb361f973023a441d2c808917834c4e1b))

# Changelog

## 0.1.0 — 2026-04-30

Initial release.

- `crew init / update / uninstall / list / doctor` against `<cwd>/.claude/skills/` (default) or `~/.claude/skills/` (`--global`).
- Per-skill SHA-256 manifest at `.claude/skills/.skills-manifest.json`.
- Conflict matrix resolves `missing` / `managed-unchanged` / `managed-edited` / `foreign` states across all five commands and the `--force` / `--yes` flags.
- Idempotent `## Workflow Config` append into project `CLAUDE.md`; never touched by `update` or `uninstall`.
- Refuses project-scope install when cwd lacks any of `package.json`, `.git`, `CLAUDE.md`, `pyproject.toml`, `Cargo.toml`, `go.mod`.
- Zero runtime dependencies. Node ≥ 20.
