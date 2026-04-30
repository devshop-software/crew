const path = require('path');
const { resolveTarget } = require('../lib/paths');
const { readManifest, writeManifest, emptyManifest, diffSkills, PACKAGE_NAME, SCHEMA_VERSION } = require('../lib/manifest');
const { copyFolder, backupFolder, backupRoot } = require('../lib/fsx');
const { chooseEditAction } = require('../lib/prompt');
const { ensureWorkflowConfig } = require('../lib/claude-md');
const log = require('../lib/log');

const PKG_ROOT = path.resolve(__dirname, '..', '..');
const PKG_VERSION = require(path.join(PKG_ROOT, 'package.json')).version;
const PKG_SKILLS = path.join(PKG_ROOT, 'skills');
const TEMPLATE = path.join(PKG_ROOT, 'templates', 'workflow-config.md');

module.exports = async function init(flags) {
  let target;
  try { target = resolveTarget(flags); }
  catch (e) { log.error(e.message); return e.exitCode || 2; }

  const { skillsDir, claudeMdPath, scope } = target;
  let manifest;
  try { manifest = readManifest(skillsDir); }
  catch (e) { log.error(e.message); return 4; }
  if (!manifest) manifest = emptyManifest(scope, PKG_VERSION);

  const diff = diffSkills(PKG_SKILLS, skillsDir, manifest);
  let bakBase = null;
  let refused = false;
  let ioError = false;
  const now = new Date().toISOString();
  const stamp = (name, hash) => { manifest.skills[name] = { version: PKG_VERSION, hash, installed_at: now }; };

  for (const s of diff) {
    if (!s.inPkg) continue;
    try {
      if (s.state === 'missing') {
        if (flags.dryRun) log.dryRun('copy', s.name);
        else { copyFolder(path.join(PKG_SKILLS, s.name), path.join(skillsDir, s.name)); log.action('copy', s.name); }
        stamp(s.name, s.pkgHash);
      } else if (s.state === 'managed-unchanged') {
        if (flags.force) {
          if (flags.dryRun) log.dryRun('replace', s.name);
          else { copyFolder(path.join(PKG_SKILLS, s.name), path.join(skillsDir, s.name)); log.action('replace', s.name); }
          stamp(s.name, s.pkgHash);
        } else if (flags.dryRun) {
          log.dryRun('skip', s.name);
        }
      } else if (s.state === 'managed-edited') {
        let action;
        if (flags.force) action = 'replace';
        else if (flags.yes) action = 'backup';
        else if (!process.stdin.isTTY) {
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
      } else if (s.state === 'foreign') {
        if (flags.force) {
          bakBase = bakBase || backupRoot(skillsDir);
          if (flags.dryRun) { log.dryRun('backup', s.name); log.dryRun('copy', s.name); }
          else {
            backupFolder(path.join(skillsDir, s.name), bakBase);
            copyFolder(path.join(PKG_SKILLS, s.name), path.join(skillsDir, s.name));
            log.action('backup', s.name);
            log.action('copy', s.name);
          }
          stamp(s.name, s.pkgHash);
        } else {
          log.warn(`foreign skill present, refusing: ${s.name} (use --force to absorb)`);
          refused = true;
        }
      }
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
    if (!manifest.installed_at) manifest.installed_at = now;
    try { writeManifest(skillsDir, manifest); }
    catch (e) { log.error(`Failed writing manifest: ${e.message}`); return 3; }
  }

  if (scope === 'project' && !flags.noClaudeMd) {
    try {
      const result = ensureWorkflowConfig(claudeMdPath, TEMPLATE, { dryRun: flags.dryRun });
      if (flags.dryRun) log.dryRun(result, 'CLAUDE.md');
      else log.action(result, 'CLAUDE.md');
    } catch (e) { log.error(`CLAUDE.md: ${e.message}`); ioError = true; }
  }

  if (ioError) return 3;
  if (refused) return 1;

  log.plain('');
  log.plain('Next: open this project in Claude Code and run /adjust.');
  return 0;
};
