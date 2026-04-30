const readline = require('readline');

function chooseEditAction(skillName) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const ask = () => {
      console.log(`The skill '${skillName}' has local edits.`);
      console.log('  (b) backup edits and replace  [default]');
      console.log('  (k) keep edits, skip update');
      console.log('  (r) replace, discard edits');
      rl.question('> ', (answer) => {
        const a = (answer || '').trim().toLowerCase();
        if (a === '' || a === 'b') { rl.close(); resolve('backup'); }
        else if (a === 'k') { rl.close(); resolve('keep'); }
        else if (a === 'r') { rl.close(); resolve('replace'); }
        else ask();
      });
    };
    ask();
  });
}

function confirmAbsorbForeign(skillNames) {
  return new Promise((resolve) => {
    console.log('');
    console.log('The following skills already exist in .claude/skills/ but are not tracked by crew:');
    console.log('');
    for (const n of skillNames) console.log(`  - ${n}`);
    console.log('');
    console.log('Override and absorb them? Originals will be backed up to .claude/skills/.bak/<utc>/.');
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question('[y/N] > ', (answer) => {
      rl.close();
      const a = (answer || '').trim().toLowerCase();
      resolve(a === 'y' || a === 'yes');
    });
  });
}

module.exports = { chooseEditAction, confirmAbsorbForeign };
