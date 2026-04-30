# crew

Project-agnostic Claude Code skills for spec → implement → qa → review → ship.

## Install

Public on npmjs.com — no registry config or token needed.

```sh
npx @devshop/crew@latest init
```

Or as a project dev dependency:

```sh
pnpm add -D @devshop/crew
pnpm exec crew init
```

To pull newer skill content later, run `pnpm exec crew update`. The flow:

1. Auto-detects the package manager (pnpm / npm / yarn / bun) from your lockfile and runs `<pm> update @devshop/crew --latest` to bump the package.
2. Re-execs the freshly-installed CLI.
3. Computes the diff and prints a plan: which skills will be added, updated, replaced (had local edits), or removed (no longer in the package).
4. Prompts `Apply these changes? [Y/n]`. Default Y. Press `n` to abort with no writes.
5. Prompts `Back up current versions to .bak/<utc>/? [y/N]`. Default N. Press `y` to keep a snapshot of the pre-change state.
6. Applies the changes — including removing skills the package no longer ships.

`--yes` makes it non-interactive and CI-safe (auto-applies, defaults backup to Y to protect against accidentally clobbering edits in CI). `--force` is destructive: auto-applies and skips backup. `--dry-run` shows the plan without writing. `--no-self-update` skips step 1 (only re-applies what's already on disk from the existing local install).

This copies the skills into `./.claude/skills/`, writes a manifest, and appends a `## Workflow Config` block to `CLAUDE.md` (creating it if absent).

## Commands

```
crew init      [--global] [--force] [--yes] [--dry-run] [--no-claude-md]
crew update    [--global] [--force] [--yes] [--dry-run]
crew uninstall [--global] [--dry-run]
crew list      [--global]
crew doctor    [--global]
```

| Flag | Effect |
|---|---|
| `--global` | Target `~/.claude/skills/` (no `CLAUDE.md` handling). |
| `--force` | Override prompts and refusals (silently absorbs foreign collisions, replaces edits). |
| `--yes` | Non-interactive (CI-safe). On `init`, refuses foreign collisions; on `update`, defaults edited skills to backup-and-replace. |
| `--dry-run` | Print actions, write nothing. Exits 1 if errors *would have* occurred. |
| `--no-claude-md` | On `init` only: skip the `CLAUDE.md` append. |

## How conflicts are resolved

The CLI tracks a per-skill SHA-256 in `.claude/skills/.skills-manifest.json`. Each skill folder is in one of four states:

- **missing** — not at the target.
- **managed-unchanged** — present, in manifest, hash matches.
- **managed-edited** — present, in manifest, you've edited it.
- **foreign** — present but not in the manifest.

`update` will never touch foreign skills. On `init`, when foreign collisions are detected (a folder with the same name as a skill we ship, but not in our manifest), interactive runs prompt with the list and ask `[y/N]` to absorb them; `--force` absorbs silently; `--yes` refuses (CI-safe). Absorbed originals are backed up to `.claude/skills/.bak/<utc>/<skill>/`. This is the bright line that keeps `update` boring.

For edited skills:

- `update` (default) → prompts: backup-and-replace / keep / replace.
- `update --yes` → backup-and-replace.
- `update --force` → replace, no backup.

## Exit codes

| Code | Meaning |
|---|---|
| 0 | Success. |
| 1 | Refused due to a conflict you must resolve. |
| 2 | Invalid usage (or no project markers in cwd). |
| 3 | I/O error. |
| 4 | Manifest corrupt. |

## Maintainer publish

Releases are automated. Push a conventional-commit message (`feat:`, `fix:`, `BREAKING CHANGE:`) to `main` and `.github/workflows/ci.yml` runs semantic-release: computes the next semver, bumps `package.json`, prepends a `CHANGELOG.md` entry, tags `vX.Y.Z`, publishes to npmjs.com, and creates a GitHub release. The `NPM_TOKEN` repo secret authenticates the npm publish.

## License

MIT.
