const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { mkTmp, rmTmp, mkProject, run, PKG_SKILL_NAMES } = require('./_helpers');

test('list on empty project: prints "No crew installation"', () => {
  const dir = mkTmp();
  try {
    mkProject(dir);
    const r = run(dir, ['list']);
    assert.equal(r.code, 0);
    assert.match(r.stdout, /No crew installation/);
  } finally { rmTmp(dir); }
});

test('list after init: shows all skills with version + installed_at', () => {
  const dir = mkTmp();
  try {
    mkProject(dir);
    run(dir, ['init', '--yes']);
    const r = run(dir, ['list']);
    assert.equal(r.code, 0);
    for (const name of PKG_SKILL_NAMES) {
      assert.match(r.stdout, new RegExp(name + '\\s+0\\.1\\.0'));
    }
  } finally { rmTmp(dir); }
});

test('doctor on empty project: suggests init', () => {
  const dir = mkTmp();
  try {
    mkProject(dir);
    const r = run(dir, ['doctor']);
    assert.equal(r.code, 0);
    assert.match(r.stdout, /Run `crew init`/);
  } finally { rmTmp(dir); }
});

test('doctor reports each state correctly without modifying anything', () => {
  const dir = mkTmp();
  try {
    mkProject(dir);
    run(dir, ['init', '--yes']);
    fs.appendFileSync(path.join(dir, '.claude', 'skills', 'ship', 'SKILL.md'), '\nedit\n');
    fs.mkdirSync(path.join(dir, '.claude', 'skills', 'foreign-x'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.claude', 'skills', 'foreign-x', 'SKILL.md'), 'mine');

    const before = JSON.stringify(fs.readdirSync(path.join(dir, '.claude', 'skills')).sort());
    const r = run(dir, ['doctor']);
    assert.equal(r.code, 0);
    assert.match(r.stdout, /ship\s+managed-edited/);
    assert.match(r.stdout, /foreign-x\s+foreign/);
    assert.match(r.stdout, /need attention/);
    const after = JSON.stringify(fs.readdirSync(path.join(dir, '.claude', 'skills')).sort());
    assert.equal(after, before, 'doctor must not modify the skills dir');
  } finally { rmTmp(dir); }
});
