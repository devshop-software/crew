const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const {
  readManifest, writeManifest, emptyManifest, diffSkills,
  manifestPath, PACKAGE_NAME, SCHEMA_VERSION
} = require('../scripts/lib/manifest');
const { hashSkill } = require('../scripts/lib/hash');
const { mkTmp, rmTmp } = require('./_helpers');

function writeSkill(root, name, body = 'x') {
  const dir = path.join(root, name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'SKILL.md'), body);
  return dir;
}

test('readManifest returns null when file is absent', () => {
  const tmp = mkTmp();
  try { assert.equal(readManifest(tmp), null); } finally { rmTmp(tmp); }
});

test('manifest round-trips through write/read', () => {
  const tmp = mkTmp();
  try {
    const m = emptyManifest('project', '0.1.0');
    m.skills.foo = { version: '0.1.0', hash: 'sha256-abc', installed_at: '2026-01-01T00:00:00Z' };
    writeManifest(tmp, m);
    const back = readManifest(tmp);
    assert.deepEqual(back, m);
    assert.equal(back.package, PACKAGE_NAME);
    assert.equal(back.schema_version, SCHEMA_VERSION);
  } finally { rmTmp(tmp); }
});

test('readManifest throws exit-code-4 error on corrupt JSON', () => {
  const tmp = mkTmp();
  try {
    fs.writeFileSync(manifestPath(tmp), '{not json');
    assert.throws(() => readManifest(tmp), e => e.exitCode === 4);
  } finally { rmTmp(tmp); }
});

test('diffSkills classifies all four states', () => {
  const pkgRoot = mkTmp(), targetRoot = mkTmp();
  try {
    // package: a, b, c
    writeSkill(pkgRoot, 'a', 'a-pkg');
    writeSkill(pkgRoot, 'b', 'b-pkg');
    writeSkill(pkgRoot, 'c', 'c-pkg');

    // target: b (unchanged), c (edited), d (foreign). Missing: a.
    writeSkill(targetRoot, 'b', 'b-pkg');
    writeSkill(targetRoot, 'c', 'c-edited');
    writeSkill(targetRoot, 'd', 'd-foreign');

    const manifest = emptyManifest('project', '0.1.0');
    manifest.skills.a = { version: '0.1.0', hash: hashSkill(path.join(pkgRoot, 'a')), installed_at: 'x' };
    manifest.skills.b = { version: '0.1.0', hash: hashSkill(path.join(pkgRoot, 'b')), installed_at: 'x' };
    manifest.skills.c = { version: '0.1.0', hash: hashSkill(path.join(pkgRoot, 'c')), installed_at: 'x' };

    const diff = diffSkills(pkgRoot, targetRoot, manifest);
    const byName = Object.fromEntries(diff.map(d => [d.name, d]));

    assert.equal(byName.a.state, 'missing');
    assert.equal(byName.b.state, 'managed-unchanged');
    assert.equal(byName.c.state, 'managed-edited');
    assert.equal(byName.d.state, 'foreign');
    assert.equal(byName.d.inPkg, false);
    assert.equal(byName.a.inPkg, true);
  } finally { rmTmp(pkgRoot); rmTmp(targetRoot); }
});

test('diffSkills includes orphaned manifest entries', () => {
  const pkgRoot = mkTmp(), targetRoot = mkTmp();
  try {
    writeSkill(pkgRoot, 'a');
    const manifest = emptyManifest('project', '0.1.0');
    manifest.skills.ghost = { version: '0.0.9', hash: 'sha256-deadbeef', installed_at: 'x' };
    const diff = diffSkills(pkgRoot, targetRoot, manifest);
    const ghost = diff.find(d => d.name === 'ghost');
    assert.equal(ghost.state, 'missing');
    assert.equal(ghost.inPkg, false);
    assert.equal(ghost.inDisk, false);
  } finally { rmTmp(pkgRoot); rmTmp(targetRoot); }
});

test('diffSkills ignores hidden directories at the target (.bak)', () => {
  const pkgRoot = mkTmp(), targetRoot = mkTmp();
  try {
    writeSkill(pkgRoot, 'a');
    fs.mkdirSync(path.join(targetRoot, '.bak', '2026-01-01T00-00-00', 'a'), { recursive: true });
    fs.writeFileSync(path.join(targetRoot, '.bak', '2026-01-01T00-00-00', 'a', 'SKILL.md'), 'old');
    const diff = diffSkills(pkgRoot, targetRoot, emptyManifest('project', '0.1.0'));
    assert.deepEqual(diff.map(d => d.name), ['a']);
  } finally { rmTmp(pkgRoot); rmTmp(targetRoot); }
});
