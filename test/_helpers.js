const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const REPO = path.resolve(__dirname, '..');
const CLI = path.join(REPO, 'scripts', 'cli.js');
const PKG_SKILLS = path.join(REPO, 'skills');
const PKG_SKILL_NAMES = fs.readdirSync(PKG_SKILLS, { withFileTypes: true })
  .filter(e => e.isDirectory()).map(e => e.name).sort();

function mkTmp(prefix = 'crew-test-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function rmTmp(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

// Build a project skeleton at `dir`. opts:
//   marker: 'package.json' (default) | '.git' | 'CLAUDE.md' | false (no marker)
//   skills: { name: { 'SKILL.md': 'body', 'sub/file.txt': '...' } } — pre-existing skill folders
//   manifest: object | undefined — written verbatim if provided
//   claudeMd: string | undefined — written to CLAUDE.md
function mkProject(dir, opts = {}) {
  fs.mkdirSync(dir, { recursive: true });
  const marker = 'marker' in opts ? opts.marker : 'package.json';
  if (marker) {
    const p = path.join(dir, marker);
    if (marker === '.git') fs.mkdirSync(p, { recursive: true });
    else fs.writeFileSync(p, '');
  }
  if (opts.claudeMd !== undefined) {
    fs.writeFileSync(path.join(dir, 'CLAUDE.md'), opts.claudeMd);
  }
  if (opts.skills) {
    const skillsDir = path.join(dir, '.claude', 'skills');
    fs.mkdirSync(skillsDir, { recursive: true });
    for (const [name, files] of Object.entries(opts.skills)) {
      for (const [rel, body] of Object.entries(files)) {
        const fp = path.join(skillsDir, name, rel);
        fs.mkdirSync(path.dirname(fp), { recursive: true });
        fs.writeFileSync(fp, body);
      }
    }
  }
  if (opts.manifest !== undefined) {
    const skillsDir = path.join(dir, '.claude', 'skills');
    fs.mkdirSync(skillsDir, { recursive: true });
    fs.writeFileSync(
      path.join(skillsDir, '.skills-manifest.json'),
      JSON.stringify(opts.manifest, null, 2) + '\n'
    );
  }
}

// Run the CLI in `cwd` with given args. Returns { code, stdout, stderr }.
// opts.input — string written to stdin (use '' to close immediately).
// opts.fakeTty — set to make the child believe stdin is a TTY (forces the
//   prompt path; we still feed via opts.input).
function run(cwd, args, opts = {}) {
  const env = { ...process.env, ...(opts.env || {}) };
  if (opts.fakeTty) env.CREW_FAKE_TTY = '1';
  const stdin = opts.input !== undefined ? 'pipe' : 'ignore';
  const r = spawnSync(process.execPath, [CLI, ...args], {
    cwd,
    env,
    encoding: 'utf8',
    input: opts.input,
    stdio: [stdin, 'pipe', 'pipe']
  });
  return { code: r.status, stdout: r.stdout || '', stderr: r.stderr || '' };
}

function readManifest(projectDir) {
  const p = path.join(projectDir, '.claude', 'skills', '.skills-manifest.json');
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function listSkills(projectDir) {
  const p = path.join(projectDir, '.claude', 'skills');
  if (!fs.existsSync(p)) return [];
  return fs.readdirSync(p, { withFileTypes: true })
    .filter(e => e.isDirectory() && !e.name.startsWith('.'))
    .map(e => e.name).sort();
}

// Snapshot mtimes recursively under `dir`. Used by --dry-run tests to assert nothing changed.
function snapMtimes(dir) {
  const out = {};
  function walk(d) {
    if (!fs.existsSync(d)) return;
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else out[p] = fs.statSync(p).mtimeMs;
    }
  }
  walk(dir);
  return out;
}

module.exports = {
  REPO, CLI, PKG_SKILLS, PKG_SKILL_NAMES,
  mkTmp, rmTmp, mkProject, run, readManifest, listSkills, snapMtimes
};
