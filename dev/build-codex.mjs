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

const DESIGN_HANDOFF_REFERENCE = `# Codex design handoff

Codex uses a repository-tracked Claude Design export because the Anthropic Design MCP cannot complete authorization from Codex. Claude Code continues to use the design server in the target repository's root \`.mcp.json\`; this contract applies only to the generated Codex package.

## Load the handoff

1. Read \`.crew.rc\` and resolve \`config.design-handoff\` relative to the active worktree root, not relative to the directory that contains the shared config in a bare-clone layout.
2. Treat \`none\`, a missing archive, a failed validation, or a missing relevant exported page as an unavailable design source for UI work; follow the calling role's BLOCKED or escalation contract and continue non-UI work normally.
3. Materialize the current archive with \`sh \${CREW_PLUGIN_ROOT}/scripts/design-handoff.sh <archive>\`; the command validates the ZIP, extracts it read-only into a fresh temporary directory, and prints that absolute directory.
4. Read \`CLAUDE.md\` and \`SKILL.md\` inside the materialized handoff first, then consult \`tokens/\`, \`components/\`, \`styles.css\`, and the root-level HTML page matching the route in scope.
5. Treat the handoff's tokens and component files as the declared-value oracle and its matching standalone HTML page as the rendered cross-check; never substitute the live app, memory, or a merely similar page for a missing design page.
6. Read only from the materialized directory. Re-run the helper on every dispatch and re-review so a replaced ZIP is picked up without a config or checksum change.

## Render a page

Open the matching root-level HTML file with Playwright using a \`file://\` URL and run the packaged fidelity extraction snippet against it. If the browser cannot load local files, serve only the temporary materialized directory on an ephemeral loopback port, stop that server after extraction, and never modify or commit the extracted files.
`;

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
    .replaceAll('`.mcp.json` is read by Claude Code at launch, so the two crew servers (Playwright + design) become available on the next session, not the current one.', 'The Codex plugin bundles Playwright and reads the design handoff configured in `.crew.rc`; the root `.mcp.json` remains the Claude Code adapter and becomes available to Claude Code on its next session.')
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

function adaptCodexAdjustDesign(body) {
  const detection = `#### Codex design handoff

Detect the repository-tracked Claude Design export during the project scan so Codex can read the intended UI without the unavailable Design MCP.

1. Resolve every tracked ZIP candidate with \`git ls-files '*.zip'\`, preferring files under \`docs/design-references/\`, and validate candidates without extracting them with \`sh \${CREW_PLUGIN_ROOT}/scripts/design-handoff.sh --check <candidate>\`.
2. When exactly one candidate validates, record its repo-relative path as \`design-handoff\`; when several validate, ask which one is authoritative; when none validates, record \`design-handoff: none\` and report that UI work will BLOCK while non-UI work remains available.
3. Show \`design-handoff\` in the Step 11 confirmation and write it to \`.crew.rc\`; on update, revalidate the same path and discover a replacement only when it is missing.

You will not:

- Copy or extract the design handoff into the repository during onboarding — keep the tracked ZIP as the single artifact and materialize it only in temporary storage at runtime.
`;

  return body
    .replace('\n---\n\n### Step 4 — Detect commands', `\n\n${detection}\n---\n\n### Step 4 — Detect commands`)
    .replace('    "ui-label": "ui",                         // UI-gate: tickets with it get the crew:ui-review visual-fidelity gate (or none)', '    "ui-label": "ui",                         // UI-gate: tickets with it get the crew:ui-review visual-fidelity gate (or none)\n    "design-handoff": "docs/design-references/design.zip", // Codex source-of-truth ZIP, repo-relative, or none')
    .replace('re-check the worktree layout, and re-write `.mcp.json`.', 're-check the worktree layout, revalidate `design-handoff`, and re-write `.mcp.json`.')
    .replace('`agent-ready-label` / `ui-label` / `instructions-label`', '`agent-ready-label` / `ui-label` / `design-handoff` / `instructions-label`')
    .replaceAll('against the design the design MCP serves', 'against the design the handoff defines')
    .replaceAll('tickets carrying it are verified against the design MCP before findings', 'tickets carrying it are verified against the design handoff before findings')
    .replace('| No `ui` label yet |', '| No valid `design-handoff` | UI work cannot be grounded or visually verified in Codex; add a Claude Design export ZIP to the repository and re-run `$crew-adjust update`. Non-UI work remains available. |\n| No `ui` label yet |')
    .replace('6. **MCP** — `.mcp.json` written with the two crew servers (Playwright + design); note if Node/npx is absent.', '6. **Design / MCP** — `design-handoff` validated for Codex; root `.mcp.json` written with Playwright + design for Claude Code; note if unzip or Node/npx is absent.')
    .replace('- Write a `.mcp.json` at the repo root provisioning the two crew MCP servers (Playwright + design) on every onboarding, shown in the Step 11 confirmation before it overwrites any existing file.', '- Validate and record the Codex `design-handoff` path, and write the Claude Code `.mcp.json` at the repo root with Playwright + design on every onboarding; show both before writing.')
    .replace('- _"This is a backend/library project, it doesn\'t need a browser or design MCP."_ — STOP. The two crew MCP servers go into every project\'s `.mcp.json`; flag a missing Node/npx as a gap (Step 13) rather than skipping the file.', '- _"Codex cannot log into the design MCP, so I will skip the design source."_ — STOP. Validate a tracked `design-handoff` for Codex; keep the root `.mcp.json` intact for Claude Code, and report a missing handoff as a UI-only blocker.')
    .replace('Provision the two crew MCP servers (Playwright + design) in a `.mcp.json` at the repo root, so every dispatched agent has the same browser and design tooling.', 'Keep the root `.mcp.json` provisioning Playwright + design for Claude Code, while Codex uses its bundled Playwright server and the repository-tracked `design-handoff`.')
    .replace('provisioning the two crew MCP servers — Playwright over stdio and the design server over HTTP — that the crew agents drive (`crew:qa` / `crew:reviewer` / `crew:ui-review`)', 'provisioning Playwright over stdio and the design server over HTTP for Claude Code; Codex agents use the plugin-bundled Playwright server and `design-handoff`')
    .replace('It also writes a sibling `.mcp.json` at the same root provisioning the two crew MCP servers (Playwright + design) — an onboarding artifact every agent reads directly, not a `.crew.rc` key (Step 12).', 'It also writes a sibling `.mcp.json` at the same root provisioning Playwright + design for Claude Code; Codex reads `design-handoff` from `.crew.rc` and uses its plugin-bundled Playwright server (Step 12).');
}

function adaptCodexDesign(body, source) {
  if (source === 'adjust') return adaptCodexAdjustDesign(body);
  if (!/design MCP|Design MCP|mcp__design__/.test(body)) return body;

  let adapted = body
    .replaceAll('the **design MCP** (the `design` server in `.mcp.json`)', 'the **design handoff** (`design-handoff` in `.crew.rc`)')
    .replaceAll('a **design MCP** (the `design` server in `.mcp.json`)', 'the **design handoff** (`design-handoff` in `.crew.rc`)')
    .replaceAll('the `design` server in `.mcp.json`', 'the `design-handoff` path in `.crew.rc`')
    .replaceAll('no `design` server in `.mcp.json`', 'no valid `design-handoff` in `.crew.rc`')
    .replaceAll('design MCP', 'design handoff')
    .replaceAll('Design MCP', 'Design handoff')
    .replaceAll('query the **design handoff**', 'materialize and read the **design handoff**')
    .replaceAll('query the design handoff', 'materialize and read the design handoff')
    .replaceAll('query it to ground', 'materialize and read it to ground')
    .replaceAll('no matching design project', 'no matching exported design page')
    .replaceAll('no matching project', 'no matching exported design page')
    .replaceAll('discovering the project that matches this app', 'selecting the exported page that matches the route')
    .replaceAll('discover the project that matches this app', 'select the exported page that matches the route')
    .replaceAll('discover the matching design project at runtime', 'select the matching exported page at runtime');

  adapted = adapted
    .replaceAll('design the design handoff serves', 'design the handoff defines')
    .replaceAll('exported design page/page', 'exported design page')
    .replaceAll('discover the design project at runtime', 'select the matching exported page at runtime');

  const marker = '## Operating context\n\n';
  if (adapted.includes(marker)) {
    adapted = adapted.replace(marker, `${marker}For Codex, follow \`\${CREW_PLUGIN_ROOT}/references/design-handoff.md\` whenever this role needs the design source; it defines how to validate, materialize, read, and render the current repository-tracked export.\n\n`);
  }

  if (source !== 'ui-review') {
    adapted = adapted.replace('\nNever hardcode an org, repo, board, label, milestone, or tool', '\n- **`design-handoff`** — the repo-relative Claude Design export ZIP; read and materialize it only when the work touches the UI.\n\nNever hardcode an org, repo, board, label, milestone, or tool');
    adapted = adapted.replace('\nNever hardcode an org, repo, board, label, or tool', '\n- **`design-handoff`** — the repo-relative Claude Design export ZIP; read and materialize it only when the work touches the UI.\n\nNever hardcode an org, repo, board, label, or tool');
    adapted = adapted.replace('\nNever hardcode an org, repo, board, label, or column', '\n- **`design-handoff`** — the repo-relative Claude Design export ZIP; read and materialize it only when the work touches the UI.\n\nNever hardcode an org, repo, board, label, or column');
  }

  if (source === 'ui-review') {
    adapted = adapted
      .replace(/- \*\*The design handoff\*\*[\s\S]*?the cross-check\)\./, '- **The design handoff** — the repository-tracked ZIP at `.crew.rc` key `design-handoff`, materialized with the packaged helper. Read its instructions, token files, component sources, and matching standalone HTML page as the source of truth.')
      .replace(/Pull the intended values for the in-scope route from the design handoff,[\s\S]*?not a pass \(Step 5\)\./, 'Load the intended values for the in-scope route from the current design handoff — its token files are the expected-value oracle and its matching standalone HTML page is the per-element cross-check. If the archive, tokens, or matching page cannot be read, this is a BLOCKED verdict, not a pass (Step 5).')
      .replace(/1\. List the design projects \(`mcp__design__list_projects`\)[\s\S]*?4\. Record in the `progress_log` exactly which design project, token files, and render you consulted, so the comment cites the source of truth it graded against\./, '1. Resolve `design-handoff` relative to the active worktree root and run `sh ${CREW_PLUGIN_ROOT}/scripts/design-handoff.sh <archive>`; capture the printed temporary directory.\n2. Read the handoff\'s `HANDOFF_CLAUDE.md` and `SKILL.md`, then read `tokens/base.css` and its imports; use the resulting CSS as the fidelity tool\'s `--design-css` oracle.\n3. Match the in-scope route to a root-level HTML page, open that standalone page with Playwright, and run the same extraction snippet used for the build; use its JSON as `--design-extract`.\n4. Record the tracked ZIP path, token files, and exported page in the `progress_log`, so the comment cites the exact source of truth it graded against.')
      .replaceAll('When Step 2 produced a `serve_url`, drive it the same way and run the same snippet, so the design and the build are measured by the identical engine (the tool\'s `--design-extract` input).', 'Drive the matching exported HTML page the same way and run the same snippet, so the design and the build are measured by the identical engine (the tool\'s `--design-extract` input).')
      .replaceAll('no valid `design-handoff` in `.crew.rc`, no matching exported design page, or neither its tokens nor a render could be read', 'no valid `design-handoff` in `.crew.rc`, unreadable tokens, or no matching exported design page')
      .replaceAll('if neither its tokens nor a render can be reached', 'if its tokens or matching exported page cannot be reached')
      .replaceAll('Guess at the matching design project — when no project plausibly matches this app', 'Guess at the matching exported page — when no page plausibly matches the route')
      .replaceAll('guess at a matching design project', 'guess at a matching exported page')
      .replaceAll('No design project obviously matches this app', 'No exported design page obviously matches this route')
      .replaceAll('if none plausibly matches', 'if no exported page plausibly matches')
      .replaceAll('rendered preview (the cross-check)', 'exported page render (the cross-check)')
      .replace(/The \*\*design handoff\*\* itself is provisioned[\s\S]*?each run\./, 'The **`design-handoff`** path is read from `.crew.rc`, resolved against the active worktree, and materialized fresh for each dispatch. Never hardcode an org, repo, board, label, or tool — read them fresh from `.crew.rc` each run.')
      .replace('- **`ui-label`** (default `ui`) — the label that gates this agent; you confirm the ticket carries it before grading.', '- **`ui-label`** (default `ui`) — the label that gates this agent; you confirm the ticket carries it before grading.\n- **`design-handoff`** — the repo-relative Claude Design export ZIP; missing, invalid, or `none` makes the UI verdict BLOCKED.')
      .replaceAll('design project + token files + render consulted', 'design ZIP + token files + exported page consulted');
  }

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
    },
  }, null, 2));
}

async function buildSkills() {
  for (const skill of SKILLS) {
    const source = `crew/skills/${skill}/SKILL.md`;
    const parsed = splitFrontmatter(await sourceFile(source), source);
    let body = adaptCodexDesign(adaptSharedTerms(parsed.body), skill);
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
      description: adaptCodexDesign(parsed.fields.description, agent),
      ...runtime,
      role_file: `./agents/${roleFile}`,
    };
    const body = adaptCodexDesign(adaptSharedTerms(parsed.body), agent)
      .replaceAll('CLAUDE.md', 'AGENTS.md')
      .replaceAll('HANDOFF_AGENTS.md', 'CLAUDE.md')
      .replaceAll('`.mcp.json`', 'the active MCP configuration')
      .replaceAll('in `.mcp.json`', 'in the active MCP configuration');
    put(`agents/${roleFile}`, body);
  }
  put('agents/manifest.json', JSON.stringify(manifest, null, 2));
}

async function copyRuntimeAssets() {
  put('crew.schema.json', await sourceFile('crew/crew.schema.json'));
  put('references/design-handoff.md', DESIGN_HANDOFF_REFERENCE);
  for (const file of ['scripts/gh-token.sh', 'scripts/design-handoff.sh', 'scripts/fidelity/README.md', 'scripts/fidelity/compare.cjs', 'scripts/fidelity/extract-snippet.js']) {
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
