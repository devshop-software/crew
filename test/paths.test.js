const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { hasProjectMarkers, resolveTarget, MARKERS } = require('../scripts/lib/paths');
const { mkTmp, rmTmp } = require('./_helpers');

test('hasProjectMarkers detects each known marker', () => {
  for (const m of MARKERS) {
    const tmp = mkTmp();
    try {
      const p = path.join(tmp, m);
      if (m === '.git') fs.mkdirSync(p);
      else fs.writeFileSync(p, '');
      assert.equal(hasProjectMarkers(tmp), true, `marker ${m}`);
    } finally { rmTmp(tmp); }
  }
});

test('hasProjectMarkers is false for empty dir', () => {
  const tmp = mkTmp();
  try { assert.equal(hasProjectMarkers(tmp), false); } finally { rmTmp(tmp); }
});

test('resolveTarget --global returns home skills dir, no claudeMdPath', () => {
  const t = resolveTarget({ global: true });
  assert.equal(t.scope, 'global');
  assert.equal(t.skillsDir, path.join(os.homedir(), '.claude', 'skills'));
  assert.equal(t.claudeMdPath, null);
});

test('resolveTarget refuses project install without markers (exitCode 2)', () => {
  const tmp = mkTmp();
  const cwd = process.cwd();
  process.chdir(tmp);
  try {
    assert.throws(() => resolveTarget({ global: false }), e => e.exitCode === 2);
  } finally {
    process.chdir(cwd);
    rmTmp(tmp);
  }
});

test('resolveTarget returns project paths when markers are present', () => {
  const tmp = mkTmp();
  fs.writeFileSync(path.join(tmp, 'package.json'), '');
  const cwd = process.cwd();
  process.chdir(tmp);
  try {
    const t = resolveTarget({ global: false });
    assert.equal(t.scope, 'project');
    assert.equal(t.skillsDir, path.join(tmp, '.claude', 'skills'));
    assert.equal(t.claudeMdPath, path.join(tmp, 'CLAUDE.md'));
  } finally {
    process.chdir(cwd);
    rmTmp(tmp);
  }
});
