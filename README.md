# crew

Project-agnostic Claude Code skills for spec → implement → qa → review → ship.

## Install

The package lives on **GitHub Packages**, so consumers need the registry mapping in `~/.npmrc` or the project's `.npmrc`:

```ini
@devshop-software:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=<PAT_with_read:packages>
```

(If GitHub has enabled unauthenticated reads for public packages on their npm registry by the time you read this, the token line is unnecessary.)

Then, from inside any project:

```sh
npx @devshop-software/crew@latest init
```

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

```sh
npm publish
```

`publishConfig.registry` in `package.json` directs this at GitHub Packages. Ensure `~/.npmrc` has a PAT with `write:packages, read:packages, repo`:

```
//npm.pkg.github.com/:_authToken=<MAINTAINER_PAT>
@devshop-software:registry=https://npm.pkg.github.com
```

Tag in git (`git tag v0.1.0 && git push --tags`) so the published version matches a commit.

## License

MIT.
