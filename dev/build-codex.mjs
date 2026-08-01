import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEV_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(DEV_DIR, '..');
const CODEX_ROOT = join(REPO_ROOT, 'plugins', 'crew');
const CHECK = process.argv.includes('--check');

const SKILLS = ['adjust', 'pro', 'pulls', 'run'];
const AGENTS = [
  'findings',
  'gatherer',
  'implementation',
  'interpreter',
  'merge-judge',
  'mr-review',
  'planner',
  'pull-triage',
  'qa',
  'reviewer',
  'ui-review',
];

const CODEX_MODELS = {
  high: { model: 'gpt-5.6-terra', model_reasoning_effort: 'high' },
  xhigh: { model: 'gpt-5.6-sol', model_reasoning_effort: 'xhigh' },
};

const GENERATED = new Map();

function splitFrontmatter(markdown, source) {
  const match = markdown.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) throw new Error(`Missing frontmatter: ${source}`);
  const fields = {};
  for (const line of match[1].split('\n')) {
    const field = line.match(/^([a-zA-Z0-9_-]+):\s*(.*)$/);
    if (!field) continue;
    let value = field[2].trim();
    if (value.startsWith('"') && value.endsWith('"')) value = JSON.parse(value);
    fields[field[1]] = value;
  }
  return { fields, body: match[2] };
}

function yamlString(value) {
  return JSON.stringify(value);
}

function codexDescription(description, skill) {
  let adapted = description;
  for (const name of SKILLS) adapted = adapted.replaceAll(`/crew:${name}`, `$crew-${name}`);
  const withoutClaudeTrigger = adapted.replace(/\s+Use when the user invokes \$crew-[a-z-]+\.?$/, '');
  return `${withoutClaudeTrigger} Use when the user invokes $crew-${skill} or asks Codex to run the crew ${skill} workflow.`;
}

function adaptSharedTerms(body) {
  let adapted = body;
  for (const skill of SKILLS) adapted = adapted.replaceAll(`/crew:${skill}`, `$crew-${skill}`);
  adapted = adapted
    .replaceAll('CLAUDE_PLUGIN_ROOT', 'CREW_PLUGIN_ROOT')
    .replaceAll('Claude process PID', 'Codex process PID')
    .replaceAll('Claude process that owns the shell', 'Codex process that owns the shell')
    .replaceAll('Claude process owning the shell', 'Codex process owning the shell')
    .replaceAll('via the Agent tool', 'with Codex subagent tools')
    .replaceAll('via the Agent tool;', 'with Codex subagent tools;')
    .replaceAll('AskUserQuestion', 'the main-thread user-input capability')
    .replaceAll('<task-notification>', 'subagent completion update')
    .replaceAll('`Stop Task`', 'the subagent interrupt control')
    .replaceAll('dangerouslyDisableSandbox', 'a danger-full-access sandbox override')
    .replaceAll('--dangerously-skip-permissions', '--yolo')
    .replaceAll('`/pulls`', '`$crew-pulls`')
    .replaceAll('Agent tool', 'Codex subagent tools');
  adapted = adapted
    .replaceAll('V2 ships as a Claude Code plugin; the loop is plugin-only.', 'Crew ships as separate Claude Code and Codex plugins; the loop remains plugin-only.')
    .replaceAll('`.mcp.json` is read by Claude Code at launch, so the two crew servers (Playwright + design) become available on the next session, not the current one.', 'The Codex plugin bundles the two crew servers; the root `.mcp.json` is the Claude Code adapter and becomes available to Claude Code on its next session. Restart either host after changing MCP configuration.')
    .replaceAll('Activate when called from the `$crew-adjust` command.', 'Activate when the user explicitly invokes `$crew-adjust`.')
    .replaceAll('Activate when called from the `$crew-pro` command;', 'Activate when the user explicitly invokes `$crew-pro`;')
    .replaceAll('Activate when called from the `$crew-run` command;', 'Activate when the user explicitly invokes `$crew-run`;')
    .replaceAll('Activate when called from the `$crew-pulls` command;', 'Activate when the user explicitly invokes `$crew-pulls`;')
    .replaceAll('Read `$ARGUMENTS` to choose the scope of the run.', 'Read any text following `$crew-adjust` in the user prompt to choose the scope of the run.')
    .replaceAll('| `$ARGUMENTS` | Scope |', '| Invocation text | Scope |')
    .replaceAll('If it exists and `$ARGUMENTS` is empty', 'If it exists and no text follows `$crew-adjust`')
    .replaceAll('If `$ARGUMENTS` is `update`', 'If the text following `$crew-adjust` is `update`');
  return adapted;
}

function injectCodexRuntime(body, skill) {
  const common = skill === 'adjust'
    ? 'This is the Codex adapter generated from the canonical Claude workflow. Resolve `CREW_PLUGIN_ROOT` from this loaded `SKILL.md` by walking up two directories, hold that absolute value for every packaged schema/script command, and never treat the target repository as the plugin root.'
    : 'This is the Codex adapter generated from the canonical Claude workflow. Resolve `CREW_PLUGIN_ROOT` from this loaded `SKILL.md` by walking up two directories. Before the first logical `crew:<role>` dispatch, read `${CREW_PLUGIN_ROOT}/agents/manifest.json`; spawn a Codex subagent with that role\'s exact `model` and `model_reasoning_effort`, set the requested working directory, pass the absolute `CREW_PLUGIN_ROOT` value, and require it to read its absolute role file under `${CREW_PLUGIN_ROOT}/agents/` in full before acting. Keep the role instructions out of the dispatch prompt itself.';
  const marker = '## Role\n\n';
  if (!body.includes(marker)) throw new Error(`Missing Role section in ${skill}`);
  return body.replace(marker, `${marker}${common}\n\n`);
}

function adaptDispatchLanguage(body) {
  return body
    .replace(/- \*\*Agent type:\*\* `agent_type: crew:<phase>` \(`crew:implementation`, `crew:qa`, `crew:reviewer`, `crew:mr-review`, `crew:ui-review`, `crew:findings`\)\./g, '- **Agent role:** resolve the logical `crew:<phase>` entry from `${CREW_PLUGIN_ROOT}/agents/manifest.json` and use its role file as the subagent\'s instructions.')
    .replace(/- \*\*Agent type:\*\* `agent_type: crew:<phase>` \(`crew:gatherer`, `crew:interpreter`, `crew:planner`\)\./g, '- **Agent role:** resolve `gatherer`, `interpreter`, or `planner` from `${CREW_PLUGIN_ROOT}/agents/manifest.json` and use its role file as the subagent\'s instructions.')
    .replace(/- \*\*Model \/ effort:\*\* each agent declares its own `model` and `effort` in its frontmatter — pass neither at dispatch \(the Codex subagent tools has no `effort` parameter, and a `model` override would only shadow what the agent already declares\)\. The heavy reasoning lives in the agents; you stay thin\./g, '- **Model / effort:** pass the exact `model` and `model_reasoning_effort` from `${CREW_PLUGIN_ROOT}/agents/manifest.json` when spawning; the heavy reasoning lives in the subagents and you stay thin.')
    .replace(/Dispatch with Codex subagent tools, same shape as `\$crew-run` — you own dispatch and bookkeeping, never the work\. Each agent declares its own `model` and `effort` in its frontmatter, so pass neither at dispatch \(the Codex subagent tools has no `effort` parameter, and a `model` override would only shadow what the agent already declares\)\./g, 'Dispatch with Codex subagent tools, same shape as `$crew-run` — you own dispatch and bookkeeping, never the work. Resolve every role from `${CREW_PLUGIN_ROOT}/agents/manifest.json`, pass its exact `model` and `model_reasoning_effort`, and require the spawned subagent to read the corresponding absolute role file before acting.')
    .replace(/- \*\*Background:\*\* dispatch the long phases \(implementation, qa, fix-loop rounds\) with `run_in_background: true` so you stay responsive to status queries; reviewer and mr-review can run foreground\./g, '- **Concurrency:** spawn long phases asynchronously so the main thread remains responsive to status queries; wait for reviewer and mr-review results directly when no other useful orchestration work remains.')
    .replace(/- \*\*The interview is yours, not a dispatch:\*\* you run `the main-thread user-input capability`/g, '- **The interview is yours, not a dispatch:** use the Codex user-input UI, or ask a direct question in chat when that UI is unavailable,')
    .replace(/Do \*\*not\*\* inline the agents' instructions; the agent files own their behavior\./g, 'Do **not** inline the agents\' instructions; pass the absolute generated role-file path and require the subagent to read it in full.')
    .replace(/> Do \*\*not\*\* inline the agent's instructions here — the agent files own their own behavior\. Your prompt supplies context \(the ticket number, the map URL, the milestone list, config\) and the handoff contract, nothing more\./g, '> Do **not** inline the agent\'s instructions here. Pass the absolute generated role-file path; the prompt supplies the ticket number, map URL, milestone list, config, and handoff contract, nothing more.')
    .replace(/the only foreground, attended step is your own `the main-thread user-input capability` interview/g, 'the only foreground, attended step is your own Codex user-input interview')
    .replace(/> Do \*\*not\*\* inline the agent's instructions here — the agent files own their own behavior\. Your prompt supplies context \(paths, numbers, config\) and the handoff contract, nothing more\./g, '> Do **not** inline the agent\'s instructions here. Pass the absolute generated role-file path; the prompt supplies paths, numbers, config, and the handoff contract, nothing more.')
    .replace(/you learn a phase finished from a `subagent completion update`/g, 'you may learn a phase finished from a subagent completion update')
    .replace(/learn they finished from a `subagent completion update`/g, 'may learn they finished from a subagent completion update')
    .replace(/the harness may even drop its task entry/g, 'the client may lose its task status')
    .replace(/a zombied agent; the harness may even drop its task entry, so the subagent interrupt control returns "No task found"/g, 'a stalled or lost subagent whose status is no longer available');
}

async function sourceFile(path) {
  return readFile(join(REPO_ROOT, path), 'utf8');
}

function put(path, content) {
  GENERATED.set(join(CODEX_ROOT, path), content.endsWith('\n') ? content : `${content}\n`);
}

async function buildManifest() {
  const claudeManifest = JSON.parse(await sourceFile('crew/.claude-plugin/plugin.json'));
  const description = 'Autonomous GitHub-issue-driven development for Codex: onboard a repository, plan instruction tickets, build and review issues through specialized subagents, and merge ready pull requests.';
  put('.codex-plugin/plugin.json', JSON.stringify({
    name: 'crew',
    version: claudeManifest.version,
    description,
    author: claudeManifest.author,
    repository: claudeManifest.repository,
    license: claudeManifest.license,
    keywords: ['codex', 'github', 'workflow', 'planning', 'code-review'],
    skills: './skills/',
    mcpServers: './.mcp.json',
    interface: {
      displayName: 'Crew',
      shortDescription: 'Plan, build, review, and merge GitHub work',
      longDescription: description,
      developerName: claudeManifest.author.name,
      category: 'Developer Tools',
      capabilities: ['Interactive', 'Write'],
      defaultPrompt: [
        'Use $crew-adjust to onboard this repository.',
        'Use $crew-pro to plan an instruction ticket.',
        'Use $crew-run to process the agent-ready queue.',
      ],
    },
  }, null, 2));
  put('.mcp.json', JSON.stringify({
    mcpServers: {
      playwright: { command: 'npx', args: ['@playwright/mcp@latest'] },
      design: { type: 'http', url: 'https://api.anthropic.com/v1/design/mcp' },
    },
  }, null, 2));
}

async function buildSkills() {
  for (const skill of SKILLS) {
    const source = `crew/skills/${skill}/SKILL.md`;
    const parsed = splitFrontmatter(await sourceFile(source), source);
    let body = adaptSharedTerms(parsed.body);
    body = injectCodexRuntime(body, skill);
    body = adaptDispatchLanguage(body);
    const name = `crew-${skill}`;
    const description = codexDescription(parsed.fields.description, skill);
    put(`skills/${name}/SKILL.md`, `---\nname: ${name}\ndescription: ${yamlString(description)}\n---\n${body}`);
    put(`skills/${name}/agents/openai.yaml`, `interface:\n  display_name: ${yamlString(`Crew ${skill[0].toUpperCase()}${skill.slice(1)}`)}\n  short_description: ${yamlString(`Run the Crew ${skill} workflow`)}\n  default_prompt: ${yamlString(`Use $${name} to run the Crew ${skill} workflow in this repository.`)}\n`);
  }
}

async function buildAgents() {
  const manifest = {};
  for (const agent of AGENTS) {
    const source = `crew/agents/${agent}.md`;
    const parsed = splitFrontmatter(await sourceFile(source), source);
    const runtime = CODEX_MODELS[parsed.fields.effort];
    if (!runtime) throw new Error(`No Codex model mapping for ${agent}: ${parsed.fields.effort}`);
    const roleFile = `${agent}.md`;
    manifest[agent] = {
      description: parsed.fields.description,
      ...runtime,
      role_file: `./agents/${roleFile}`,
    };
    const body = adaptSharedTerms(parsed.body)
      .replaceAll('CLAUDE.md', 'AGENTS.md')
      .replaceAll('`.mcp.json`', 'the active MCP configuration')
      .replaceAll('in `.mcp.json`', 'in the active MCP configuration');
    put(`agents/${roleFile}`, body);
  }
  put('agents/manifest.json', JSON.stringify(manifest, null, 2));
}

async function copyRuntimeAssets() {
  put('crew.schema.json', await sourceFile('crew/crew.schema.json'));
  for (const file of ['scripts/gh-token.sh', 'scripts/fidelity/README.md', 'scripts/fidelity/compare.cjs', 'scripts/fidelity/extract-snippet.js']) {
    put(file, await sourceFile(`crew/${file}`));
  }
}

async function verifyOrWrite() {
  const stale = [];
  for (const [path, expected] of GENERATED) {
    if (CHECK) {
      let actual;
      try { actual = await readFile(path, 'utf8'); } catch { actual = undefined; }
      if (actual !== expected) stale.push(relative(REPO_ROOT, path));
      continue;
    }
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, expected);
  }
  if (CHECK && stale.length) throw new Error(`Codex adapter is stale:\n${stale.map((path) => `- ${path}`).join('\n')}`);
}

if (!CHECK) {
  await rm(CODEX_ROOT, { recursive: true, force: true });
}
await buildManifest();
await buildSkills();
await buildAgents();
await copyRuntimeAssets();
await verifyOrWrite();
console.log(CHECK ? 'codex adapter · up to date' : `codex adapter · generated ${GENERATED.size} files`);
