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

module.exports = { chooseEditAction };
