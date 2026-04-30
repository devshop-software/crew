const readline = require('readline');

// One-shot confirm — creates and closes its own readline. OK for a single
// question; if you need several in a row use Prompter so the interface (and
// stdin's internal buffer) stays alive across them.
function confirm(question, defaultYes = false) {
  const p = new Prompter();
  return p.confirm(question, defaultYes).finally(() => p.close());
}

class Prompter {
  constructor() {
    this._rl = readline.createInterface({ input: process.stdin });
    this._lines = [];
    this._waiters = [];
    this._closed = false;
    this._rl.on('line', (line) => {
      if (this._waiters.length) this._waiters.shift()(line);
      else this._lines.push(line);
    });
    this._rl.on('close', () => {
      this._closed = true;
      while (this._waiters.length) this._waiters.shift()(null);
    });
  }
  _question(prompt) {
    process.stdout.write(prompt);
    if (this._lines.length) return Promise.resolve(this._lines.shift());
    if (this._closed) return Promise.resolve(null);
    return new Promise((resolve) => this._waiters.push(resolve));
  }
  async confirm(question, defaultYes = false) {
    const hint = defaultYes ? '[Y/n]' : '[y/N]';
    const answer = await this._question(`${question} ${hint} > `);
    if (answer === null) return defaultYes;
    const a = answer.trim().toLowerCase();
    if (a === '') return defaultYes;
    return a === 'y' || a === 'yes';
  }
  async chooseEditAction(skillName) {
    while (true) {
      console.log(`The skill '${skillName}' has local edits.`);
      console.log('  (b) backup edits and replace  [default]');
      console.log('  (k) keep edits, skip update');
      console.log('  (r) replace, discard edits');
      const answer = await this._question('> ');
      if (answer === null) return 'backup';
      const a = (answer || '').trim().toLowerCase();
      if (a === '' || a === 'b') return 'backup';
      if (a === 'k') return 'keep';
      if (a === 'r') return 'replace';
    }
  }
  close() { this._rl.close(); }
}

// Back-compat shims for init.js
function chooseEditAction(skillName) {
  const p = new Prompter();
  return p.chooseEditAction(skillName).finally(() => p.close());
}

function confirmAbsorbForeign(skillNames) {
  console.log('');
  console.log('The following skills already exist in .claude/skills/ but are not tracked by crew:');
  console.log('');
  for (const n of skillNames) console.log(`  - ${n}`);
  console.log('');
  console.log('Override and absorb them? Originals will be backed up to .claude/skills/.bak/<utc>/.');
  return confirm('[y/N]', false);
}

module.exports = { confirm, chooseEditAction, confirmAbsorbForeign, Prompter };
