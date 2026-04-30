const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { mkTmp, rmTmp, mkProject, run, readManifest, listSkills } = require('./_helpers');

test('uninstall removes managed skills, deletes manifest, leaves CLAUDE.md', () => {
  const dir = mkTmp();
  try {
    mkProject(dir);
    run(dir, ['init', '--yes']);
    const claudeMdBefore = fs.readFileSync(path.join(dir, 'CLAUDE.md'), 'utf8');

    const r = run(dir, ['uninstall']);
    assert.equal(r.code, 0);
    assert.deepEqual(listSkills(dir), []);
    assert.equal(readManifest(dir), null);
    // CLAUDE.md is left alone
    assert.equal(fs.readFileSync(path.join(dir, 'CLAUDE.md'), 'utf8'), claudeMdBefore);
  } finally { rmTmp(dir); }
});

test('uninstall keeps edited skills with warning', () => {
  const dir = mkTmp();
  try {
    mkProject(dir);
    run(dir, ['init', '--yes']);
    fs.appendFileSync(path.join(dir, '.claude', 'skills', 'review', 'SKILL.md'), '\nedit\n');

    const r = run(dir, ['uninstall']);
    assert.equal(r.code, 0);
    assert.match(r.stdout, /kept \(edited\): review/);
    assert.equal(fs.existsSync(path.join(dir, '.claude', 'skills', 'review')), true);
  } finally { rmTmp(dir); }
});

test('uninstall ignores foreign skills', () => {
  const dir = mkTmp();
  try {
    mkProject(dir);
    run(dir, ['init', '--yes']);
    // Plant a foreign skill manually
    fs.mkdirSync(path.join(dir, '.claude', 'skills', 'foreign-x'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.claude', 'skills', 'foreign-x', 'SKILL.md'), 'mine');

    const r = run(dir, ['uninstall']);
    assert.equal(r.code, 0);
    assert.equal(fs.existsSync(path.join(dir, '.claude', 'skills', 'foreign-x', 'SKILL.md')), true);
  } finally { rmTmp(dir); }
});

test('uninstall errors when no manifest (exit 1)', () => {
  const dir = mkTmp();
  try {
    mkProject(dir);
    const r = run(dir, ['uninstall']);
    assert.equal(r.code, 1);
    assert.match(r.stderr, /No installation found/);
  } finally { rmTmp(dir); }
});

test('uninstall --dry-run writes nothing', () => {
  const dir = mkTmp();
  try {
    mkProject(dir);
    run(dir, ['init', '--yes']);
    const skillsBefore = listSkills(dir);
    const manifestBefore = readManifest(dir);

    const r = run(dir, ['uninstall', '--dry-run']);
    assert.equal(r.code, 0);
    assert.deepEqual(listSkills(dir), skillsBefore);
    assert.deepEqual(readManifest(dir), manifestBefore);
  } finally { rmTmp(dir); }
});
