const path = require('path');
const { resolveTarget } = require('../lib/paths');
const { readManifest, diffSkills } = require('../lib/manifest');
const log = require('../lib/log');

const PKG_ROOT = path.resolve(__dirname, '..', '..');
const PKG_VERSION = require(path.join(PKG_ROOT, 'package.json')).version;
const PKG_SKILLS = path.join(PKG_ROOT, 'skills');

module.exports = async function doctor(flags) {
  let target;
  try { target = resolveTarget(flags); }
  catch (e) { log.error(e.message); return e.exitCode || 2; }

  const { skillsDir } = target;
  let manifest;
  try { manifest = readManifest(skillsDir); }
  catch (e) { log.error(e.message); return 4; }
  if (!manifest) {
    log.plain(`No crew installation at ${skillsDir}. Run \`crew init\` to install.`);
    return 0;
  }

  const diff = diffSkills(PKG_SKILLS, skillsDir, manifest);
  log.plain(`Package version:  ${PKG_VERSION}`);
  log.plain(`Manifest version: ${manifest.package_version}`);
  log.plain(`Scope:            ${manifest.scope}`);
  log.plain(`Skills dir:       ${skillsDir}`);
  log.plain('');

  const w = Math.max(4, ...diff.map(d => d.name.length));
  log.plain(`${'name'.padEnd(w)}  state              mf-ver   pkg-ver`);
  log.plain(`${'-'.repeat(w)}  -----              ------   -------`);
  for (const d of diff) {
    const mfVer = manifest.skills[d.name]?.version || '-';
    const pkgVer = d.inPkg ? PKG_VERSION : '-';
    log.plain(`${d.name.padEnd(w)}  ${d.state.padEnd(18)} ${mfVer.padEnd(8)} ${pkgVer}`);
  }

  const issues = diff.filter(d =>
    d.state === 'managed-edited' ||
    d.state === 'foreign' ||
    (d.state === 'managed-unchanged' && d.diskHash !== d.pkgHash) ||
    (d.state === 'missing' && d.inPkg)
  );
  if (issues.length > 0) {
    log.plain('');
    log.plain(`${issues.length} skill(s) need attention. Run \`crew update\` (or \`crew init --force\` for foreign).`);
  }
  return 0;
};
