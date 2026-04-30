const { resolveTarget } = require('../lib/paths');
const { readManifest } = require('../lib/manifest');
const log = require('../lib/log');

module.exports = async function list(flags) {
  let target;
  try { target = resolveTarget(flags); }
  catch (e) { log.error(e.message); return e.exitCode || 2; }

  const { skillsDir } = target;
  let manifest;
  try { manifest = readManifest(skillsDir); }
  catch (e) { log.error(e.message); return 4; }
  if (!manifest) {
    log.plain(`No crew installation at ${skillsDir}.`);
    return 0;
  }

  const names = Object.keys(manifest.skills).sort();
  if (names.length === 0) {
    log.plain(`No skills installed at ${skillsDir}.`);
    return 0;
  }

  const w = Math.max(4, ...names.map(n => n.length));
  log.plain(`${'name'.padEnd(w)}  version  installed_at`);
  log.plain(`${'-'.repeat(w)}  -------  --------------------`);
  for (const n of names) {
    const e = manifest.skills[n];
    log.plain(`${n.padEnd(w)}  ${(e.version || '').padEnd(7)}  ${e.installed_at || ''}`);
  }
  return 0;
};
