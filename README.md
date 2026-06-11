# crew

Project-agnostic Claude Code skills, shipped as a plugin.

Currently ships one skill:

- **`/crew:ticket`** — interview a feature into a well-formed, agent-ready GitHub Issue (Context / Out of scope / Acceptance criteria). Project conventions are read from `CLAUDE.md` at runtime.

## Install

Run inside Claude Code:

```sh
/plugin marketplace add devshop-software/crew
/plugin install crew@devshop
```

The skill is available on your next session.

## License

MIT.
