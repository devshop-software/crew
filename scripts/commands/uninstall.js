const fs = require('fs');
const path = require('path');
const { resolveTarget } = require('../lib/paths');
const { readManifest, manifestPath } = require('../lib/manifest');
const { hashSkill } = require('../lib/hash');
const { removeFolder } = require('../lib/fsx');
const log = require('../lib/log');

module.exports = async function uninstall(flags) {
  let target;
  try { target = resolveTarget(flags); }
  catch (e) { log.error(e.message); return e.exitCode || 2; }

  const { skillsDir, scope } = target;
  let manifest;
  try { manifest = readManifest(skillsDir); }
  catch (e) { log.error(e.message); return 4; }
  if (!manifest) {
    log.error(`No installation found at ${skillsDir}.`);
    return 1;
  }

  let ioError = false;
  for (const name of Object.keys(manifest.skills).sort()) {
    const folder = path.join(skillsDir, name);
    try {
      if (!fs.existsSync(folder)) {
        log.info(`missing: ${name}`);
        continue;
      }
      const onDisk = hashSkill(folder);
      if (onDisk === manifest.skills[name].hash) {
        if (flags.dryRun) log.dryRun('remove', name);
        else { removeFolder(folder); log.action('remove', name); }
      } else {
        log.warn(`kept (edited): ${name}`);
      }
    } catch (e) {
      log.error(`I/O error on ${name}: ${e.message}`);
      ioError = true;
    }
  }

  if (!flags.dryRun && !ioError) {
    try {
      const mp = manifestPath(skillsDir);
      if (fs.existsSync(mp)) fs.unlinkSync(mp);
    } catch (e) { log.error(`Failed removing manifest: ${e.message}`); return 3; }
  }

  if (scope === 'project') {
    log.plain('');
    log.info(`CLAUDE.md left untouched. Remove the '## Workflow Config' block manually if desired.`);
  }

  return ioError ? 3 : 0;
};
