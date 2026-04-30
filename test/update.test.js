const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { mkTmp, rmTmp, mkProject, run, readManifest, snapMtimes, PKG_SKILL_NAMES } = require('./_helpers');

test('update on fresh project errors (no manifest, exit 1)', () => {
  const dir = mkTmp();
  try {
    mkProject(dir);
    const r = run(dir, ['update', '--yes']);
    assert.equal(r.code, 1);
    assert.match(r.stderr, /No installation found/);
  } finally { rmTmp(dir); }
});

test('update is silent when nothing has changed', () => {
  const dir = mkTmp();
  try {
    mkProject(dir);
    run(dir, ['init', '--yes']);
    const before = snapMtimes(path.join(dir, '.claude', 'skills'));
    const r = run(dir, ['update', '--yes']);
    assert.equal(r.code, 0);
    const after = snapMtimes(path.join(dir, '.claude', 'skills'));
    const manifestPath = path.join(dir, '.claude', 'skills', '.skills-manifest.json');
    for (const [p, t] of Object.entries(before)) {
      if (p === manifestPath) continue;
      assert.equal(after[p], t, `mtime changed for ${p}`);
    }
  } finally { rmTmp(dir); }
});

test('update --yes on edited skill: backs up + replaces', () => {
  const dir = mkTmp();
  try {
    mkProject(dir);
    run(dir, ['init', '--yes']);
    const skillFile = path.join(dir, '.claude', 'skills', 'spec-writer', 'SKILL.md');
    fs.appendFileSync(skillFile, '\nuser edit\n');

    const r = run(dir, ['update', '--yes']);
    assert.equal(r.code, 0, r.stderr);
    assert.match(r.stdout, /backup spec-writer/);
    assert.match(r.stdout, /replace spec-writer/);

    // The edit should be in the backup, not in the live file
    const bakRoot = path.join(dir, '.claude', 'skills', '.bak');
    const tsDirs = fs.readdirSync(bakRoot);
    const bakBody = fs.readFileSync(path.join(bakRoot, tsDirs[0], 'spec-writer', 'SKILL.md'), 'utf8');
    assert.match(bakBody, /user edit/);
    const live = fs.readFileSync(skillFile, 'utf8');
    assert.doesNotMatch(live, /user edit/);
  } finally { rmTmp(dir); }
});

test('update --force on edited skill: replaces without backup', () => {
  const dir = mkTmp();
  try {
    mkProject(dir);
    run(dir, ['init', '--yes']);
    fs.appendFileSync(path.join(dir, '.claude', 'skills', 'review', 'SKILL.md'), '\nuser edit\n');

    const r = run(dir, ['update', '--force']);
    assert.equal(r.code, 0);
    assert.doesNotMatch(r.stdout, /backup review/);
    assert.match(r.stdout, /replace review/);
    assert.equal(fs.existsSync(path.join(dir, '.claude', 'skills', '.bak')), false);
  } finally { rmTmp(dir); }
});

test('update on edited skill with no TTY and no flags: refuses (exit 1)', () => {
  const dir = mkTmp();
  try {
    mkProject(dir);
    run(dir, ['init', '--yes']);
    fs.appendFileSync(path.join(dir, '.claude', 'skills', 'docs', 'SKILL.md'), '\nuser edit\n');

    // No --yes, no --force; spawned with stdin closed
    const r = run(dir, ['update']);
    assert.equal(r.code, 1);
    assert.match(r.stderr, /stdin is not a TTY/);
  } finally { rmTmp(dir); }
});

test('update never touches foreign skills (collision case)', () => {
  const dir = mkTmp();
  try {
    mkProject(dir);
    run(dir, ['init', '--yes']);
    // Manually convert ship into a foreign-collision: remove from manifest, change body
    const skillsDir = path.join(dir, '.claude', 'skills');
    const m = readManifest(dir);
    delete m.skills.ship;
    fs.writeFileSync(path.join(skillsDir, '.skills-manifest.json'), JSON.stringify(m, null, 2));
    fs.writeFileSync(path.join(skillsDir, 'ship', 'SKILL.md'), 'foreign-body');

    const r = run(dir, ['update', '--yes', '--force']);
    assert.equal(r.code, 0);
    assert.equal(fs.readFileSync(path.join(skillsDir, 'ship', 'SKILL.md'), 'utf8'), 'foreign-body');
    // Manifest still has no ship entry
    const after = readManifest(dir);
    assert.equal('ship' in after.skills, false);
  } finally { rmTmp(dir); }
});

test('update adds skills missing from disk (case: package added a new skill)', () => {
  const dir = mkTmp();
  try {
    mkProject(dir);
    run(dir, ['init', '--yes']);
    // Remove indie-agent from disk and from manifest to simulate "package adds it later"
    fs.rmSync(path.join(dir, '.claude', 'skills', 'indie-agent'), { recursive: true });
    const m = readManifest(dir);
    delete m.skills['indie-agent'];
    fs.writeFileSync(
      path.join(dir, '.claude', 'skills', '.skills-manifest.json'),
      JSON.stringify(m, null, 2)
    );

    const r = run(dir, ['update', '--yes']);
    assert.equal(r.code, 0);
    assert.match(r.stdout, /add\s+indie-agent/);
    assert.equal(fs.existsSync(path.join(dir, '.claude', 'skills', 'indie-agent', 'SKILL.md')), true);
    assert.equal('indie-agent' in readManifest(dir).skills, true);
  } finally { rmTmp(dir); }
});

test('update auto-removes skills no longer in the package (--yes flow)', () => {
  const dir = mkTmp();
  try {
    mkProject(dir);
    run(dir, ['init', '--yes']);
    // Forge a manifest entry for a skill the package doesn't ship, with
    // matching disk content so the manifest hash is consistent.
    const skillsDir = path.join(dir, '.claude', 'skills');
    fs.mkdirSync(path.join(skillsDir, 'ghost'), { recursive: true });
    fs.writeFileSync(path.join(skillsDir, 'ghost', 'SKILL.md'), 'ghost-body\n');
    const { hashSkill } = require('../scripts/lib/hash');
    const m = readManifest(dir);
    m.skills.ghost = {
      version: '0.1.0',
      hash: hashSkill(path.join(skillsDir, 'ghost')),
      installed_at: '2026-01-01T00:00:00Z'
    };
    fs.writeFileSync(
      path.join(skillsDir, '.skills-manifest.json'),
      JSON.stringify(m, null, 2)
    );

    const r = run(dir, ['update', '--yes', '--force']); // --force = no backup
    assert.equal(r.code, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /remove\s+ghost/);
    assert.equal(fs.existsSync(path.join(skillsDir, 'ghost')), false);
    assert.equal('ghost' in readManifest(dir).skills, false);
  } finally { rmTmp(dir); }
});

test('update prompt + y + n applies without backup', () => {
  const dir = mkTmp();
  try {
    mkProject(dir);
    run(dir, ['init', '--yes']);
    // Edit a skill so something needs to change
    fs.appendFileSync(path.join(dir, '.claude', 'skills', 'review', 'SKILL.md'), '\nuser edit\n');

    const r = run(dir, ['update'], { input: 'y\nn\n', fakeTty: true });
    assert.equal(r.code, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /will change/);
    assert.match(r.stdout, /replace\s+review/);
    // No backup folder
    const bak = path.join(dir, '.claude', 'skills', '.bak');
    assert.equal(fs.existsSync(bak), false);
    // The edit is gone
    assert.doesNotMatch(
      fs.readFileSync(path.join(dir, '.claude', 'skills', 'review', 'SKILL.md'), 'utf8'),
      /user edit/
    );
  } finally { rmTmp(dir); }
});

test('update prompt + n aborts with exit 1', () => {
  const dir = mkTmp();
  try {
    mkProject(dir);
    run(dir, ['init', '--yes']);
    fs.appendFileSync(path.join(dir, '.claude', 'skills', 'review', 'SKILL.md'), '\nuser edit\n');
    const before = fs.readFileSync(path.join(dir, '.claude', 'skills', 'review', 'SKILL.md'), 'utf8');

    const r = run(dir, ['update'], { input: 'n\n', fakeTty: true });
    assert.equal(r.code, 1);
    assert.match(r.stdout, /Aborted/);
    assert.equal(
      fs.readFileSync(path.join(dir, '.claude', 'skills', 'review', 'SKILL.md'), 'utf8'),
      before
    );
  } finally { rmTmp(dir); }
});

test('update prompt + y + y backs up to .bak/<utc>/', () => {
  const dir = mkTmp();
  try {
    mkProject(dir);
    run(dir, ['init', '--yes']);
    fs.appendFileSync(path.join(dir, '.claude', 'skills', 'review', 'SKILL.md'), '\nuser edit\n');

    const r = run(dir, ['update'], { input: 'y\ny\n', fakeTty: true });
    assert.equal(r.code, 0, r.stdout + r.stderr);
    const bakRoot = path.join(dir, '.claude', 'skills', '.bak');
    const tsDirs = fs.readdirSync(bakRoot);
    assert.equal(tsDirs.length, 1);
    assert.match(
      fs.readFileSync(path.join(bakRoot, tsDirs[0], 'review', 'SKILL.md'), 'utf8'),
      /user edit/
    );
  } finally { rmTmp(dir); }
});

test('update --dry-run writes nothing', () => {
  const dir = mkTmp();
  try {
    mkProject(dir);
    run(dir, ['init', '--yes']);
    fs.appendFileSync(path.join(dir, '.claude', 'skills', 'ship', 'SKILL.md'), '\nuser edit\n');

    const before = snapMtimes(dir);
    const r = run(dir, ['update', '--yes', '--dry-run']);
    assert.equal(r.code, 0);
    const after = snapMtimes(dir);
    assert.deepEqual(after, before);
  } finally { rmTmp(dir); }
});
