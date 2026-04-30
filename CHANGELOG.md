## [0.8.1](https://github.com/devshop-software/crew/compare/v0.8.0...v0.8.1) (2026-04-30)


### Bug Fixes

* don't rewrite users' version range on self-update ([a85a3c3](https://github.com/devshop-software/crew/commit/a85a3c38485f9613bb5a3f679dff08d472601568))

# [0.8.0](https://github.com/devshop-software/crew/compare/v0.7.0...v0.8.0) (2026-04-30)


### Features

* redesigned crew update — plan, confirm, optional backup, auto-remove ([4859ca0](https://github.com/devshop-software/crew/commit/4859ca0f7a424ab32b14fa8bf3ef5ed83c26a6a1))

# [0.7.0](https://github.com/devshop-software/crew/compare/v0.6.0...v0.7.0) (2026-04-30)


### Features

* surface what crew update actually did ([51894c5](https://github.com/devshop-software/crew/commit/51894c5ed8a3f5f5fbb7746c0c77ab83ffd0d70d))

# [0.6.0](https://github.com/devshop-software/crew/compare/v0.5.0...v0.6.0) (2026-04-30)


### Features

* remove indie skill ([7990a34](https://github.com/devshop-software/crew/commit/7990a34741155478226114f05562c35f854e47c8))

# [0.5.0](https://github.com/devshop-software/crew/compare/v0.4.2...v0.5.0) (2026-04-30)


### Features

* crew update auto-bumps the local package via the project's PM ([9e39abd](https://github.com/devshop-software/crew/commit/9e39abdb7c51fba87c38802a07718af9725dccd2))

## [0.4.2](https://github.com/devshop-software/crew/compare/v0.4.1...v0.4.2) (2026-04-30)


### Bug Fixes

* publish to npm in prepare phase so failed publish can't orphan tags ([6ee8e5a](https://github.com/devshop-software/crew/commit/6ee8e5aacc4ed698e0e51c17891bd8b699faafb7))

# [0.4.0](https://github.com/devshop-software/crew/compare/v0.3.0...v0.4.0) (2026-04-30)


### Features

* migrate to npmjs.com as @devshop/crew ([a2ea3c1](https://github.com/devshop-software/crew/commit/a2ea3c1d5454ead7dd16bde6916a708eca520946))

# [0.3.0](https://github.com/devshop-software/crew/compare/v0.2.1...v0.3.0) (2026-04-30)


### Features

* prompt before absorbing foreign-collision skills on init ([e8a045c](https://github.com/devshop-software/crew/commit/e8a045c3339de9065269b9bd7cc8ae5aaa976eca))

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
