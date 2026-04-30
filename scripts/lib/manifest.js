const fs = require('fs');
const path = require('path');
const { hashSkill } = require('./hash');

const PACKAGE_NAME = '@devshop-software/crew';
const SCHEMA_VERSION = 1;

function manifestPath(skillsDir) {
  return path.join(skillsDir, '.skills-manifest.json');
}

function readManifest(skillsDir) {
  const p = manifestPath(skillsDir);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (e) {
    const err = new Error(`Manifest corrupt: ${p}`);
    err.exitCode = 4;
    throw err;
  }
}

function writeManifest(skillsDir, manifest) {
  fs.mkdirSync(skillsDir, { recursive: true });
  fs.writeFileSync(manifestPath(skillsDir), JSON.stringify(manifest, null, 2) + '\n');
}

function emptyManifest(scope, packageVersion) {
  const now = new Date().toISOString();
  return {
    schema_version: SCHEMA_VERSION,
    package: PACKAGE_NAME,
    package_version: packageVersion,
    scope,
    installed_at: now,
    updated_at: now,
    skills: {}
  };
}

function listDirSkills(dir, { includeHidden = false } = {}) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter(e => e.isDirectory() && (includeHidden || !e.name.startsWith('.')))
    .map(e => e.name)
    .sort();
}

function diffSkills(packageSkillsDir, target, manifest) {
  const pkgSkills = new Set(listDirSkills(packageSkillsDir));
  const diskSkills = new Set(listDirSkills(target));
  const mfSkills = new Set(Object.keys(manifest.skills || {}));
  const all = [...new Set([...pkgSkills, ...diskSkills, ...mfSkills])].sort();
  return all.map(name => {
    const inPkg = pkgSkills.has(name);
    const inDisk = diskSkills.has(name);
    const mfEntry = manifest.skills[name];
    const pkgHash = inPkg ? hashSkill(path.join(packageSkillsDir, name)) : null;
    const diskHash = inDisk ? hashSkill(path.join(target, name)) : null;
    const mfHash = mfEntry ? mfEntry.hash : null;
    let state;
    if (!inDisk) state = 'missing';
    else if (!mfEntry) state = 'foreign';
    else if (diskHash === mfHash) state = 'managed-unchanged';
    else state = 'managed-edited';
    return { name, state, pkgHash, diskHash, mfHash, inPkg, inDisk };
  });
}

module.exports = {
  PACKAGE_NAME,
  SCHEMA_VERSION,
  manifestPath,
  readManifest,
  writeManifest,
  emptyManifest,
  diffSkills
};
