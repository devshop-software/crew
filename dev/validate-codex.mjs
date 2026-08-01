import { readFile, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CODEX_ROOT = join(REPO_ROOT, 'plugins', 'crew');
const errors = [];
const CLAUDE_RESIDUE = ['/crew:', 'CLAUDE_PLUGIN_ROOT', 'AskUserQuestion', 'Agent tool', '<task-notification>', 'model: opus', '$ARGUMENTS', 'run_in_background', 'agent_type:', 'dangerouslyDisableSandbox'];

function fail(message) {
  errors.push(message);
}

const plugin = JSON.parse(await readFile(join(CODEX_ROOT, '.codex-plugin', 'plugin.json'), 'utf8'));
if (plugin.name !== 'crew') fail('plugin name must be crew');
if (plugin.skills !== './skills/') fail('plugin skills path must be ./skills/');
if (plugin.mcpServers !== './.mcp.json') fail('plugin MCP path must be ./.mcp.json');
const mcp = JSON.parse(await readFile(join(CODEX_ROOT, '.mcp.json'), 'utf8'));
if (!mcp.mcpServers?.playwright) fail('Codex plugin must bundle Playwright MCP');
if (mcp.mcpServers?.design) fail('Codex plugin must not bundle the unavailable Anthropic Design MCP');
await readFile(join(CODEX_ROOT, 'references', 'design-handoff.md'), 'utf8');
await readFile(join(CODEX_ROOT, 'scripts', 'design-handoff.sh'), 'utf8');

const skillRoot = join(CODEX_ROOT, 'skills');
for (const entry of await readdir(skillRoot, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const path = join(skillRoot, entry.name, 'SKILL.md');
  const markdown = await readFile(path, 'utf8');
  const match = markdown.match(/^---\n([\s\S]*?)\n---\n/);
  if (!match) {
    fail(`${entry.name}: missing frontmatter`);
    continue;
  }
  const keys = match[1].split('\n').map((line) => line.match(/^([a-zA-Z0-9_-]+):/)?.[1]).filter(Boolean);
  if (keys.join(',') !== 'name,description') fail(`${entry.name}: frontmatter must contain only name and description`);
  if (!match[1].includes(`name: ${entry.name}`)) fail(`${entry.name}: name must match directory`);
  for (const residue of CLAUDE_RESIDUE) {
    if (markdown.includes(residue)) fail(`${entry.name}: contains Claude-only residue ${residue}`);
  }
  await readFile(join(skillRoot, entry.name, 'agents', 'openai.yaml'), 'utf8');
}

const agents = JSON.parse(await readFile(join(CODEX_ROOT, 'agents', 'manifest.json'), 'utf8'));
if (Object.keys(agents).length !== 11) fail(`expected 11 Codex agent roles, found ${Object.keys(agents).length}`);
for (const [name, agent] of Object.entries(agents)) {
  if (!agent.model || !agent.model_reasoning_effort || !agent.role_file) fail(`${name}: incomplete runtime mapping`);
  const role = await readFile(join(CODEX_ROOT, agent.role_file), 'utf8');
  for (const residue of CLAUDE_RESIDUE) {
    if (role.includes(residue)) fail(`${name}: role file contains Claude-only residue ${residue}`);
  }
  if (/design MCP|mcp__design__/.test(role)) fail(`${name}: role file contains unavailable Codex design-MCP instructions`);
}

if (errors.length) {
  console.error(errors.map((error) => `- ${error}`).join('\n'));
  process.exit(1);
}
console.log('codex adapter · valid (4 skills, 11 agent roles)');
