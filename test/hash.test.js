const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { hashSkill, walkSorted } = require('../scripts/lib/hash');
const { mkTmp, rmTmp } = require('./_helpers');

test('walkSorted returns lexicographic relative paths', () => {
  const tmp = mkTmp();
  try {
    fs.mkdirSync(path.join(tmp, 'sub'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'b.txt'), 'b');
    fs.writeFileSync(path.join(tmp, 'a.txt'), 'a');
    fs.writeFileSync(path.join(tmp, 'sub', 'z.txt'), 'z');
    assert.deepEqual(walkSorted(tmp), ['a.txt', 'b.txt', 'sub/z.txt']);
  } finally { rmTmp(tmp); }
});

test('hashSkill is deterministic for identical content', () => {
  const a = mkTmp(), b = mkTmp();
  try {
    for (const root of [a, b]) {
      fs.writeFileSync(path.join(root, 'SKILL.md'), 'hello\n');
      fs.mkdirSync(path.join(root, 'refs'));
      fs.writeFileSync(path.join(root, 'refs', 'one.md'), 'one');
    }
    assert.equal(hashSkill(a), hashSkill(b));
  } finally { rmTmp(a); rmTmp(b); }
});

test('hashSkill changes when a file body changes', () => {
  const dir = mkTmp();
  try {
    fs.writeFileSync(path.join(dir, 'SKILL.md'), 'before');
    const h1 = hashSkill(dir);
    fs.writeFileSync(path.join(dir, 'SKILL.md'), 'after');
    const h2 = hashSkill(dir);
    assert.notEqual(h1, h2);
  } finally { rmTmp(dir); }
});

test('hashSkill changes when a file is added', () => {
  const dir = mkTmp();
  try {
    fs.writeFileSync(path.join(dir, 'SKILL.md'), 'x');
    const h1 = hashSkill(dir);
    fs.writeFileSync(path.join(dir, 'EXTRA.md'), 'y');
    const h2 = hashSkill(dir);
    assert.notEqual(h1, h2);
  } finally { rmTmp(dir); }
});

test('hashSkill is path-sensitive (renaming a file changes the hash)', () => {
  const a = mkTmp(), b = mkTmp();
  try {
    fs.writeFileSync(path.join(a, 'one.md'), 'same');
    fs.writeFileSync(path.join(b, 'two.md'), 'same');
    assert.notEqual(hashSkill(a), hashSkill(b));
  } finally { rmTmp(a); rmTmp(b); }
});

test('hashSkill output starts with sha256-', () => {
  const dir = mkTmp();
  try {
    fs.writeFileSync(path.join(dir, 'x'), 'x');
    assert.match(hashSkill(dir), /^sha256-[0-9a-f]{64}$/);
  } finally { rmTmp(dir); }
});
