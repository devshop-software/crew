const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { PACKAGE_NAME } = require('./manifest');

function findProjectRoot(start = process.cwd()) {
  let dir = path.resolve(start);
  while (true) {
    if (fs.existsSync(path.join(dir, 'package.json'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

const LOCKFILES = [
  ['pnpm-lock.yaml', 'pnpm'],
  ['yarn.lock', 'yarn'],
  ['package-lock.json', 'npm'],
  ['bun.lock', 'bun'],
  ['bun.lockb', 'bun']
];

function detectPm(projectRoot) {
  for (const [file, pm] of LOCKFILES) {
    if (fs.existsSync(path.join(projectRoot, file))) return pm;
  }
  return null;
}

function isLocalDep(projectRoot) {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'));
    return Boolean(
      (pkg.dependencies && pkg.dependencies[PACKAGE_NAME]) ||
      (pkg.devDependencies && pkg.devDependencies[PACKAGE_NAME])
    );
  } catch { return false; }
}

// Range-respecting update so we don't rewrite the user's package.json
// version specifier. To always pull the absolute latest across majors,
// users can pin "@devshop/crew": "latest" in their package.json (a dist-tag,
// not a semver range — never gets rewritten); for "all 0.x but never 1.x"
// use "0.x". Any caret/tilde range will be honored as written.
const UPDATE_ARGS = {
  pnpm: ['update', PACKAGE_NAME],
  npm: ['update', PACKAGE_NAME],
  yarn: ['upgrade', PACKAGE_NAME],
  bun: ['update', PACKAGE_NAME]
};

// Returns one of:
//   { skipped: true, reason }                          — caller should fall through to in-process work
//   { reExec: true, exitCode }                         — caller should return this exit code
//   { error: true, message, exitCode }                 — caller should error and return
function runSelfUpdate(flags, log) {
  if (flags.noSelfUpdate) return { skipped: true, reason: 'flag' };
  if (flags.dryRun) return { skipped: true, reason: 'dry-run' };

  const projectRoot = findProjectRoot();
  if (!projectRoot) return { skipped: true, reason: 'no project root' };
  if (!isLocalDep(projectRoot)) return { skipped: true, reason: 'not a local dep' };
  const pm = detectPm(projectRoot);
  if (!pm) return { skipped: true, reason: 'no lockfile' };

  const localCli = path.join(projectRoot, 'node_modules', '@devshop', 'crew', 'scripts', 'cli.js');
  if (!fs.existsSync(localCli)) return { skipped: true, reason: 'local CLI not present' };

  log.action('self', `${pm} ${UPDATE_ARGS[pm].join(' ')}`);
  const updateResult = spawnSync(pm, UPDATE_ARGS[pm], { cwd: projectRoot, stdio: 'inherit' });
  if (updateResult.status !== 0) {
    return { error: true, message: `${pm} update failed`, exitCode: 3 };
  }

  const passthrough = ['update', '--no-self-update'];
  if (flags.global) passthrough.push('--global');
  if (flags.force) passthrough.push('--force');
  if (flags.yes) passthrough.push('--yes');

  const child = spawnSync(process.execPath, [localCli, ...passthrough], {
    cwd: process.cwd(),
    stdio: 'inherit'
  });
  return { reExec: true, exitCode: child.status || 0 };
}

module.exports = { runSelfUpdate, findProjectRoot, detectPm, isLocalDep };
