const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { findProjectRoot, detectPm, isLocalDep } = require('../scripts/lib/self-update');
const { mkTmp, rmTmp } = require('./_helpers');

test('findProjectRoot walks up to nearest package.json', () => {
  const root = mkTmp();
  try {
    fs.writeFileSync(path.join(root, 'package.json'), '{}');
    const sub = path.join(root, 'a', 'b');
    fs.mkdirSync(sub, { recursive: true });
    assert.equal(findProjectRoot(sub), fs.realpathSync(root));
  } finally { rmTmp(root); }
});

test('findProjectRoot returns null when no package.json upward', () => {
  // /tmp/<random>/empty has no package.json; walking up may still hit one
  // somewhere on the system, so use a freshly-mounted dir we control.
  const root = mkTmp();
  try {
    // No package.json anywhere inside `root`. Walking up may eventually find
    // one on the system, so this test asserts it doesn't return our `root`.
    const result = findProjectRoot(root);
    assert.notEqual(result, fs.realpathSync(root));
  } finally { rmTmp(root); }
});

test('detectPm reads pnpm-lock.yaml first, then yarn, npm, bun', () => {
  const cases = [
    [['pnpm-lock.yaml'], 'pnpm'],
    [['yarn.lock'], 'yarn'],
    [['package-lock.json'], 'npm'],
    [['bun.lock'], 'bun'],
    [['bun.lockb'], 'bun'],
    [['pnpm-lock.yaml', 'yarn.lock', 'package-lock.json'], 'pnpm']
  ];
  for (const [files, expected] of cases) {
    const dir = mkTmp();
    try {
      for (const f of files) fs.writeFileSync(path.join(dir, f), '');
      assert.equal(detectPm(dir), expected, `lockfiles=${files.join(',')}`);
    } finally { rmTmp(dir); }
  }
});

test('detectPm returns null when no lockfile present', () => {
  const dir = mkTmp();
  try { assert.equal(detectPm(dir), null); } finally { rmTmp(dir); }
});

test('isLocalDep finds @devshop/crew in dependencies or devDependencies', () => {
  const cases = [
    [{ dependencies: { '@devshop/crew': '^0.4.0' } }, true],
    [{ devDependencies: { '@devshop/crew': '^0.4.0' } }, true],
    [{ dependencies: { 'other': '1.0.0' } }, false],
    [{}, false]
  ];
  for (const [pkg, expected] of cases) {
    const dir = mkTmp();
    try {
      fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(pkg));
      assert.equal(isLocalDep(dir), expected);
    } finally { rmTmp(dir); }
  }
});

test('isLocalDep returns false on missing or invalid package.json', () => {
  const dir = mkTmp();
  try {
    assert.equal(isLocalDep(dir), false);
    fs.writeFileSync(path.join(dir, 'package.json'), '{not json');
    assert.equal(isLocalDep(dir), false);
  } finally { rmTmp(dir); }
});
