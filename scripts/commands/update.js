const path = require('path');
const fs = require('fs');
const { resolveTarget } = require('../lib/paths');
const { readManifest, writeManifest, diffSkills, PACKAGE_NAME, SCHEMA_VERSION } = require('../lib/manifest');
const { copyFolder, backupFolder, removeFolder, backupRoot } = require('../lib/fsx');
const { Prompter } = require('../lib/prompt');
const { runSelfUpdate } = require('../lib/self-update');
const log = require('../lib/log');

const PKG_ROOT = path.resolve(__dirname, '..', '..');
const PKG_VERSION = require(path.join(PKG_ROOT, 'package.json')).version;
const PKG_SKILLS = path.join(PKG_ROOT, 'skills');

module.exports = async function update(flags) {
  // Self-update via the project's PM (pnpm/npm/yarn/bun) with --latest, then
  // re-exec the freshly-installed CLI to do the real work.
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

  const manifestVersionBefore = manifest.package_version;
  const diff = diffSkills(PKG_SKILLS, skillsDir, manifest);

  // Categorize per-skill changes the user needs to consent to.
  // - add:     missing on disk, present in package
  // - update:  on disk + matches manifest, but package hash differs
  // - replace: on disk, edited (manifest hash != disk hash) — about to clobber edits
  // - remove:  in manifest + on disk, package no longer ships it
  // managed-unchanged with matching hash → no-op (excluded)
  // foreign with inPkg → leave per spec (excluded)
  // foreign without inPkg → user's own folder, ignore (excluded)
  const changes = [];
  for (const s of diff) {
    if (!s.inPkg && s.inDisk && s.mfHash) {
      changes.push({ name: s.name, kind: 'remove' });
    } else if (s.inPkg && s.state === 'missing') {
      changes.push({ name: s.name, kind: 'add', pkgHash: s.pkgHash });
    } else if (s.inPkg && s.state === 'managed-unchanged' && s.diskHash !== s.pkgHash) {
      changes.push({ name: s.name, kind: 'update', pkgHash: s.pkgHash });
    } else if (s.inPkg && s.state === 'managed-edited') {
      changes.push({ name: s.name, kind: 'replace', pkgHash: s.pkgHash, edited: true });
    }
  }

  // Header
  if (manifestVersionBefore && manifestVersionBefore !== PKG_VERSION) {
    log.plain(`${PACKAGE_NAME}: ${manifestVersionBefore} → ${PKG_VERSION}`);
  } else {
    log.plain(`${PACKAGE_NAME}: ${PKG_VERSION}`);
  }

  if (changes.length === 0) {
    log.plain('all up to date.');
    if (!flags.dryRun && manifestVersionBefore !== PKG_VERSION) {
      manifest.package_version = PKG_VERSION;
      manifest.updated_at = new Date().toISOString();
      try { writeManifest(skillsDir, manifest); }
      catch (e) { log.error(`Failed writing manifest: ${e.message}`); return 3; }
    }
    return 0;
  }

  // Show plan
  log.plain('');
  log.plain('The following skills will change:');
  const labelFor = (c) => {
    if (c.kind === 'add') return 'add';
    if (c.kind === 'update') return 'update';
    if (c.kind === 'replace') return c.edited ? 'replace (you have local edits)' : 'replace';
    if (c.kind === 'remove') return 'remove (no longer in package)';
    return c.kind;
  };
  const w = Math.max(...changes.map(c => c.name.length));
  for (const c of changes) log.plain(`  - ${c.name.padEnd(w)}  ${labelFor(c)}`);
  log.plain('');

  const interactive = process.stdin.isTTY || process.env.CREW_FAKE_TTY === '1';

  // Single Prompter shared across the apply + backup prompts so we don't
  // create/close a readline between them (which can drop buffered stdin).
  const prompter = (interactive && !flags.force && !flags.yes) ? new Prompter() : null;
  let apply;
  let doBackup;
  try {
    if (flags.force || flags.yes) {
      apply = true;
    } else if (!interactive) {
      log.error('Cannot prompt: stdin is not a TTY. Re-run with --yes or --force.');
      return 1;
    } else {
      apply = await prompter.confirm('Apply these changes?', true);
    }
    if (!apply) {
      log.plain('Aborted.');
      return 1;
    }
    // Backup prompt — interactive default N (per the new flow).
    // --yes is CI-safe → backup edits defensively. --force is destructive → no backup.
    if (flags.force) doBackup = false;
    else if (flags.yes) doBackup = true;
    else doBackup = await prompter.confirm('Back up current versions to .bak/<utc>/?', false);
  } finally {
    if (prompter) prompter.close();
  }

  // Apply
  const now = new Date().toISOString();
  const stamp = (name, hash) => { manifest.skills[name] = { version: PKG_VERSION, hash, installed_at: now }; };
  let bakBase = null;
  let ioError = false;

  for (const c of changes) {
    try {
      const live = path.join(skillsDir, c.name);
      const src = path.join(PKG_SKILLS, c.name);

      if (doBackup && (c.kind === 'update' || c.kind === 'replace' || c.kind === 'remove')) {
        bakBase = bakBase || backupRoot(skillsDir);
        if (flags.dryRun) log.dryRun('backup', c.name);
        else { backupFolder(live, bakBase); log.action('backup', c.name); }
      }

      if (c.kind === 'add') {
        if (flags.dryRun) log.dryRun('add', c.name);
        else { copyFolder(src, live); log.action('add', c.name); }
        stamp(c.name, c.pkgHash);
      } else if (c.kind === 'update' || c.kind === 'replace') {
        if (!doBackup && fs.existsSync(live) && !flags.dryRun) removeFolder(live);
        if (flags.dryRun) log.dryRun('replace', c.name);
        else { copyFolder(src, live); log.action('replace', c.name); }
        stamp(c.name, c.pkgHash);
      } else if (c.kind === 'remove') {
        if (!doBackup) {
          if (flags.dryRun) log.dryRun('remove', c.name);
          else { removeFolder(live); log.action('remove', c.name); }
        }
        delete manifest.skills[c.name];
      }
    } catch (e) {
      log.error(`I/O error on ${c.name}: ${e.message}`);
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

  // Summary
  log.plain('');
  const counts = changes.reduce((a, c) => (a[c.kind] = (a[c.kind] || 0) + 1, a), {});
  const parts = [];
  if (counts.add) parts.push(`${counts.add} added`);
  if (counts.update) parts.push(`${counts.update} updated`);
  if (counts.replace) parts.push(`${counts.replace} replaced`);
  if (counts.remove) parts.push(`${counts.remove} removed`);
  log.plain(parts.join(', ') + '.');

  if (ioError) return 3;
  return 0;
};
