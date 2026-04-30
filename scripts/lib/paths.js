const fs = require('fs');
const path = require('path');
const os = require('os');

const MARKERS = ['package.json', '.git', 'CLAUDE.md', 'pyproject.toml', 'Cargo.toml', 'go.mod'];

function hasProjectMarkers(dir) {
  return MARKERS.some(m => fs.existsSync(path.join(dir, m)));
}

function resolveTarget(flags) {
  if (flags.global) {
    return {
      skillsDir: path.join(os.homedir(), '.claude', 'skills'),
      claudeMdPath: null,
      scope: 'global'
    };
  }
  const cwd = process.cwd();
  if (cwd === os.homedir() || !hasProjectMarkers(cwd)) {
    const err = new Error(
      'Refusing project install: no project markers in cwd. ' +
      'Pass --global to install into ~/.claude/skills, or run inside a project.'
    );
    err.exitCode = 2;
    throw err;
  }
  return {
    skillsDir: path.join(cwd, '.claude', 'skills'),
    claudeMdPath: path.join(cwd, 'CLAUDE.md'),
    scope: 'project'
  };
}

module.exports = { resolveTarget, hasProjectMarkers, MARKERS };
