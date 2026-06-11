const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { REPO, mkTmp, rmTmp, mkProject, run } = require('./_helpers');

// Claude Code plugin/skill identifiers: kebab-case, no colons in the bare name.
const NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function frontmatterName(skillMd) {
  const fm = skillMd.match(/^---\n([\s\S]*?)\n---/);
  assert.ok(fm, 'SKILL.md has YAML frontmatter');
  const nm = fm[1].match(/^name:\s*(.+?)\s*$/m);
  assert.ok(nm, 'frontmatter has a name field');
  return nm[1].replace(/^["']|["']$/g, '');
}

test('marketplace.json is well-formed and every plugin source is a real plugin', () => {
  const mp = path.join(REPO, '.claude-plugin', 'marketplace.json');
  assert.ok(fs.existsSync(mp), '.claude-plugin/marketplace.json exists at repo root');
  const m = readJson(mp);

  assert.match(m.name, NAME_RE, 'marketplace name is kebab-case');
  assert.ok(m.owner && typeof m.owner.name === 'string' && m.owner.name, 'owner.name present');
  assert.ok(Array.isArray(m.plugins) && m.plugins.length > 0, 'has a non-empty plugins[]');

  for (const p of m.plugins) {
    assert.match(p.name, NAME_RE, `plugin name kebab-case: ${p.name}`);
    assert.ok(typeof p.source === 'string' && p.source, `plugin ${p.name} declares a source`);
    const manifest = path.join(path.resolve(REPO, p.source), '.claude-plugin', 'plugin.json');
    assert.ok(fs.existsSync(manifest), `plugin ${p.name} source resolves to a .claude-plugin/plugin.json`);
    assert.equal(readJson(manifest).name, p.name, `plugin.json name matches marketplace entry: ${p.name}`);
  }
});

test('crew plugin namespaces its skill as crew:ticket', () => {
  const crewDir = path.join(REPO, 'skills', 'crew');
  const pj = readJson(path.join(crewDir, '.claude-plugin', 'plugin.json'));
  assert.equal(pj.name, 'crew', 'plugin is named "crew"');
  assert.match(pj.name, NAME_RE);

  const skillMd = path.join(crewDir, 'skills', 'ticket', 'SKILL.md');
  assert.ok(fs.existsSync(skillMd), 'crew plugin contains skills/ticket/SKILL.md');

  const name = frontmatterName(fs.readFileSync(skillMd, 'utf8'));
  assert.equal(name, 'ticket', 'skill name is the bare "ticket"');
  assert.ok(!name.includes(':'), 'bare skill name carries no colon');
  assert.match(name, NAME_RE, 'skill name is a valid kebab-case identifier');
  // plugin "crew" + bare skill "ticket"  =>  invoked as  crew:ticket
});

test('crew init copies the crew plugin over intact (skills-dir plugin contract)', () => {
  const dir = mkTmp();
  try {
    mkProject(dir);
    const r = run(dir, ['init', '--yes']);
    assert.equal(r.code, 0, r.stderr);

    // A folder under .claude/skills/ that contains .claude-plugin/plugin.json
    // auto-loads as <name>@skills-dir, so its skills resolve as crew:ticket.
    const dst = path.join(dir, '.claude', 'skills', 'crew');
    const manifest = path.join(dst, '.claude-plugin', 'plugin.json');
    const skillMd = path.join(dst, 'skills', 'ticket', 'SKILL.md');

    assert.ok(fs.existsSync(manifest), 'plugin manifest landed in .claude/skills/crew/.claude-plugin/');
    assert.ok(fs.existsSync(skillMd), 'nested skill landed in .claude/skills/crew/skills/ticket/');
    assert.equal(readJson(manifest).name, 'crew', 'copied manifest still names the crew namespace');
    assert.equal(frontmatterName(fs.readFileSync(skillMd, 'utf8')), 'ticket', 'copied skill keeps its bare name');
  } finally {
    rmTmp(dir);
  }
});
