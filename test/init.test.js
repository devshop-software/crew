const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const {
  mkTmp, rmTmp, mkProject, run, readManifest, listSkills, snapMtimes,
  PKG_SKILL_NAMES
} = require('./_helpers');
const { hashSkill } = require('../scripts/lib/hash');

test('init into empty project: copies all skills, writes manifest, creates CLAUDE.md', () => {
  const dir = mkTmp();
  try {
    mkProject(dir);
    const r = run(dir, ['init', '--yes']);
    assert.equal(r.code, 0, r.stderr);
    assert.deepEqual(listSkills(dir), PKG_SKILL_NAMES);
    const m = readManifest(dir);
    assert.equal(m.scope, 'project');
    assert.deepEqual(Object.keys(m.skills).sort(), PKG_SKILL_NAMES);
    for (const name of PKG_SKILL_NAMES) {
      assert.match(m.skills[name].hash, /^sha256-[0-9a-f]{64}$/);
    }
    const claudeMd = fs.readFileSync(path.join(dir, 'CLAUDE.md'), 'utf8');
    assert.match(claudeMd, /^# Project\n\n## Workflow Config/);
  } finally { rmTmp(dir); }
});

test('init is idempotent: second run is a no-op', () => {
  const dir = mkTmp();
  try {
    mkProject(dir);
    run(dir, ['init', '--yes']);
    const before = snapMtimes(path.join(dir, '.claude', 'skills'));
    const claudeMdBefore = fs.readFileSync(path.join(dir, 'CLAUDE.md'), 'utf8');

    const r = run(dir, ['init', '--yes']);
    assert.equal(r.code, 0);

    const after = snapMtimes(path.join(dir, '.claude', 'skills'));
    // Skill files should not have been touched. Manifest may have updated_at refreshed,
    // so allow that single file to differ.
    const manifestPath = path.join(dir, '.claude', 'skills', '.skills-manifest.json');
    for (const [p, t] of Object.entries(before)) {
      if (p === manifestPath) continue;
      assert.equal(after[p], t, `mtime changed for ${p}`);
    }
    const claudeMdAfter = fs.readFileSync(path.join(dir, 'CLAUDE.md'), 'utf8');
    assert.equal(claudeMdAfter, claudeMdBefore);
  } finally { rmTmp(dir); }
});

test('init refuses on foreign-collision (exit 1)', () => {
  const dir = mkTmp();
  try {
    mkProject(dir, {
      skills: { ship: { 'SKILL.md': 'user-ship' } }
    });
    const r = run(dir, ['init', '--yes']);
    assert.equal(r.code, 1, r.stdout + r.stderr);
    assert.match(r.stdout + r.stderr, /foreign skill present, refusing: ship/);
    // No manifest entry for ship, since it was refused
    const m = readManifest(dir);
    assert.equal(fs.readFileSync(path.join(dir, '.claude', 'skills', 'ship', 'SKILL.md'), 'utf8'), 'user-ship');
    // ship is not in the manifest
    assert.equal('ship' in m.skills, false);
  } finally { rmTmp(dir); }
});

test('init --force absorbs foreign-collision (backup + replace)', () => {
  const dir = mkTmp();
  try {
    mkProject(dir, {
      skills: { ship: { 'SKILL.md': 'user-ship' } }
    });
    const r = run(dir, ['init', '--yes', '--force']);
    assert.equal(r.code, 0, r.stderr);

    // Original is moved to .bak/<ts>/ship/
    const bakRoot = path.join(dir, '.claude', 'skills', '.bak');
    const tsDirs = fs.readdirSync(bakRoot);
    assert.equal(tsDirs.length, 1);
    const bakBody = fs.readFileSync(path.join(bakRoot, tsDirs[0], 'ship', 'SKILL.md'), 'utf8');
    assert.equal(bakBody, 'user-ship');

    // ship is now from package and tracked in manifest
    const m = readManifest(dir);
    assert.equal('ship' in m.skills, true);
  } finally { rmTmp(dir); }
});

test('init ignores user-only skills not shipped by package', () => {
  const dir = mkTmp();
  try {
    mkProject(dir, {
      skills: { 'team-onboarding': { 'SKILL.md': 'user-private' } }
    });
    const r = run(dir, ['init', '--yes']);
    assert.equal(r.code, 0, r.stderr);
    assert.equal(
      fs.readFileSync(path.join(dir, '.claude', 'skills', 'team-onboarding', 'SKILL.md'), 'utf8'),
      'user-private'
    );
    const m = readManifest(dir);
    assert.equal('team-onboarding' in m.skills, false);
  } finally { rmTmp(dir); }
});

test('init refuses install in dir without project markers (exit 2)', () => {
  const dir = mkTmp();
  try {
    mkProject(dir, { marker: false });
    const r = run(dir, ['init', '--yes']);
    assert.equal(r.code, 2);
    assert.match(r.stderr, /no project markers/);
    assert.equal(fs.existsSync(path.join(dir, '.claude')), false);
  } finally { rmTmp(dir); }
});

test('init --no-claude-md skips CLAUDE.md', () => {
  const dir = mkTmp();
  try {
    mkProject(dir);
    const r = run(dir, ['init', '--yes', '--no-claude-md']);
    assert.equal(r.code, 0);
    assert.equal(fs.existsSync(path.join(dir, 'CLAUDE.md')), false);
  } finally { rmTmp(dir); }
});

test('init --dry-run writes nothing', () => {
  const dir = mkTmp();
  try {
    mkProject(dir);
    const before = snapMtimes(dir);
    const r = run(dir, ['init', '--yes', '--dry-run']);
    assert.equal(r.code, 0);
    const after = snapMtimes(dir);
    assert.deepEqual(after, before);
    assert.equal(fs.existsSync(path.join(dir, '.claude')), false);
    assert.equal(fs.existsSync(path.join(dir, 'CLAUDE.md')), false);
  } finally { rmTmp(dir); }
});

test('init appends to existing CLAUDE.md without disturbing other content', () => {
  const dir = mkTmp();
  try {
    mkProject(dir, { claudeMd: '# My Project\n\nSome notes here.\n' });
    const r = run(dir, ['init', '--yes']);
    assert.equal(r.code, 0);
    const body = fs.readFileSync(path.join(dir, 'CLAUDE.md'), 'utf8');
    assert.match(body, /^# My Project\n\nSome notes here\./);
    assert.match(body, /## Workflow Config/);
  } finally { rmTmp(dir); }
});
