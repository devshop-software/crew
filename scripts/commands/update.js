const path = require('path');
const { resolveTarget } = require('../lib/paths');
const { readManifest, writeManifest, diffSkills, PACKAGE_NAME, SCHEMA_VERSION } = require('../lib/manifest');
const { copyFolder, backupFolder, backupRoot } = require('../lib/fsx');
const { chooseEditAction } = require('../lib/prompt');
const { runSelfUpdate } = require('../lib/self-update');
const log = require('../lib/log');

const PKG_ROOT = path.resolve(__dirname, '..', '..');
const PKG_VERSION = require(path.join(PKG_ROOT, 'package.json')).version;
const PKG_SKILLS = path.join(PKG_ROOT, 'skills');

module.exports = async function update(flags) {
  // If installed as a local dep, bump the package via the project's package
  // manager first, then re-exec the freshly-installed CLI to do the actual
  // skill update. Skipped for global/dlx invocations (no project lockfile).
  const self = runSelfUpdate(flags, log);
  if (self.error) { log.error(self.message); return self.exitCode; }
  if (self.reExec) return self.exitCode;

  let target;
  try { target = resolveTarget(flags); }
  catch (e) { log.error(e.message); return e.exitCode || 2; }

  const { skillsDir, scope } = target;
  let manifest;
  try { manifest = readManifest(skillsDir); }
  catch (e) { log.error(e.message); return 4; }
  if (!manifest) {
    log.error(`No installation found at ${skillsDir}. Run \`crew init\` first.`);
    return 1;
  }

  const diff = diffSkills(PKG_SKILLS, skillsDir, manifest);
  let bakBase = null;
  let refused = false;
  let ioError = false;
  const now = new Date().toISOString();
  const interactive = process.stdin.isTTY || process.env.CREW_FAKE_TTY === '1';
  const stamp = (name, hash) => { manifest.skills[name] = { version: PKG_VERSION, hash, installed_at: now }; };

  for (const s of diff) {
    if (!s.inPkg) continue;
    try {
      if (s.state === 'missing') {
        if (flags.dryRun) log.dryRun('copy', s.name);
        else { copyFolder(path.join(PKG_SKILLS, s.name), path.join(skillsDir, s.name)); log.action('copy', s.name); }
        stamp(s.name, s.pkgHash);
      } else if (s.state === 'managed-unchanged') {
        if (s.diskHash !== s.pkgHash) {
          if (flags.dryRun) log.dryRun('replace', s.name);
          else { copyFolder(path.join(PKG_SKILLS, s.name), path.join(skillsDir, s.name)); log.action('replace', s.name); }
          stamp(s.name, s.pkgHash);
        }
      } else if (s.state === 'managed-edited') {
        let action;
        if (flags.force) action = 'replace';
        else if (flags.yes) action = 'backup';
        else if (!interactive) {
          log.error(`Edited skill detected ('${s.name}') and stdin is not a TTY. Re-run with --yes or --force.`);
          refused = true;
          continue;
        } else {
          action = await chooseEditAction(s.name);
        }
        if (action === 'keep') {
          if (flags.dryRun) log.dryRun('keep', s.name);
          else log.action('keep', s.name);
          continue;
        }
        if (action === 'backup') {
          bakBase = bakBase || backupRoot(skillsDir);
          if (flags.dryRun) log.dryRun('backup', s.name);
          else { backupFolder(path.join(skillsDir, s.name), bakBase); log.action('backup', s.name); }
        }
        if (flags.dryRun) log.dryRun('replace', s.name);
        else { copyFolder(path.join(PKG_SKILLS, s.name), path.join(skillsDir, s.name)); log.action('replace', s.name); }
        stamp(s.name, s.pkgHash);
      }
      // foreign: leave (don't touch)
    } catch (e) {
      log.error(`I/O error on ${s.name}: ${e.message}`);
      ioError = true;
    }
  }

  if (!flags.dryRun && !ioError) {
    manifest.package = PACKAGE_NAME;
    manifest.package_version = PKG_VERSION;
    manifest.schema_version = SCHEMA_VERSION;
    manifest.scope = scope;
    manifest.updated_at = now;
    try { writeManifest(skillsDir, manifest); }
    catch (e) { log.error(`Failed writing manifest: ${e.message}`); return 3; }
  }

  if (ioError) return 3;
  if (refused) return 1;
  return 0;
};
