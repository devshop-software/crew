#!/usr/bin/env node
const path = require('path');

const COMMANDS = ['init', 'update', 'uninstall', 'list', 'doctor'];

function usage() {
  return [
    'Usage: crew <command> [flags]',
    '',
    'Commands:',
    '  init       Install skills into the current project (or --global).',
    '  update     Replace managed skills with newer package versions.',
    '  uninstall  Remove managed skills and the manifest.',
    '  list       Show installed skills.',
    '  doctor     Report drift; never modifies anything.',
    '',
    'Flags:',
    '  --global         Target ~/.claude/skills/ (no CLAUDE.md handling).',
    '  --force          Override prompts and refusals.',
    '  --yes            Non-interactive (CI-safe defaults).',
    '  --dry-run        Print actions, write nothing.',
    '  --no-claude-md   On init only: skip CLAUDE.md append.',
    '  --no-self-update On update only: skip pulling a newer package via the local PM.'
  ].join('\n');
}

function parseArgs(argv) {
  const flags = { global: false, force: false, yes: false, dryRun: false, noClaudeMd: false, noSelfUpdate: false };
  let command = null;
  for (const a of argv) {
    if (a.startsWith('--')) {
      switch (a) {
        case '--global': flags.global = true; break;
        case '--force': flags.force = true; break;
        case '--yes': flags.yes = true; break;
        case '--dry-run': flags.dryRun = true; break;
        case '--no-claude-md': flags.noClaudeMd = true; break;
        case '--no-self-update': flags.noSelfUpdate = true; break;
        case '--help': process.stdout.write(usage() + '\n'); process.exit(0);
        default:
          process.stderr.write(`Unknown flag: ${a}\n\n${usage()}\n`);
          process.exit(2);
      }
    } else if (!command) {
      command = a;
    } else {
      process.stderr.write(`Unexpected argument: ${a}\n\n${usage()}\n`);
      process.exit(2);
    }
  }
  if (!command || !COMMANDS.includes(command)) {
    process.stderr.write(`${usage()}\n`);
    process.exit(2);
  }
  return { command, flags };
}

(async () => {
  const { command, flags } = parseArgs(process.argv.slice(2));
  const cmd = require(path.join(__dirname, 'commands', `${command}.js`));
  try {
    const code = await cmd(flags);
    process.exit(code || 0);
  } catch (e) {
    const log = require('./lib/log');
    log.error(e.message);
    process.exit(e.exitCode || 3);
  }
})();
