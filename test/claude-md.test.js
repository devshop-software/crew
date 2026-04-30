const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { ensureWorkflowConfig } = require('../scripts/lib/claude-md');
const { mkTmp, rmTmp } = require('./_helpers');

const TEMPLATE = path.resolve(__dirname, '..', 'templates', 'workflow-config.md');

test('creates CLAUDE.md when absent', () => {
  const tmp = mkTmp();
  try {
    const p = path.join(tmp, 'CLAUDE.md');
    const result = ensureWorkflowConfig(p, TEMPLATE);
    assert.equal(result, 'created');
    const body = fs.readFileSync(p, 'utf8');
    assert.match(body, /^# Project\n\n## Workflow Config/);
  } finally { rmTmp(tmp); }
});

test('appends to existing CLAUDE.md without the heading', () => {
  const tmp = mkTmp();
  try {
    const p = path.join(tmp, 'CLAUDE.md');
    fs.writeFileSync(p, '# My Project\n\nSome notes.\n');
    const result = ensureWorkflowConfig(p, TEMPLATE);
    assert.equal(result, 'appended');
    const body = fs.readFileSync(p, 'utf8');
    assert.match(body, /Some notes\.\n\n## Workflow Config/);
  } finally { rmTmp(tmp); }
});

test('is idempotent: present heading is left alone', () => {
  const tmp = mkTmp();
  try {
    const p = path.join(tmp, 'CLAUDE.md');
    fs.writeFileSync(p, '# Project\n\n## Workflow Config\n\n| key | value |\n');
    const before = fs.readFileSync(p, 'utf8');
    const result = ensureWorkflowConfig(p, TEMPLATE);
    assert.equal(result, 'present');
    assert.equal(fs.readFileSync(p, 'utf8'), before);
  } finally { rmTmp(tmp); }
});

test('heading detection is case-strict', () => {
  const tmp = mkTmp();
  try {
    const p = path.join(tmp, 'CLAUDE.md');
    fs.writeFileSync(p, '# Project\n\n## workflow config\n');
    const result = ensureWorkflowConfig(p, TEMPLATE);
    assert.equal(result, 'appended');
  } finally { rmTmp(tmp); }
});

test('--dry-run writes nothing for "created"', () => {
  const tmp = mkTmp();
  try {
    const p = path.join(tmp, 'CLAUDE.md');
    const result = ensureWorkflowConfig(p, TEMPLATE, { dryRun: true });
    assert.equal(result, 'created');
    assert.equal(fs.existsSync(p), false);
  } finally { rmTmp(tmp); }
});
