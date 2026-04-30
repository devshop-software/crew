const isTty = process.stdout.isTTY;
const color = (code, s) => isTty ? `\x1b[${code}m${s}\x1b[0m` : s;
const dim = s => color('2', s);
const red = s => color('31', s);
const yellow = s => color('33', s);
const green = s => color('32', s);

const pad = s => String(s).padEnd(6);

const log = {
  action(verb, target) { console.log(`  ${green(pad(verb))} ${target}`); },
  info(msg) { console.log(`  ${pad('')} ${msg}`); },
  warn(msg) { console.log(`  ${yellow(pad('warn'))} ${msg}`); },
  error(msg) { console.error(`  ${red(pad('error'))} ${msg}`); },
  dryRun(verb, target) { console.log(`  ${dim('[dry]')} ${pad(verb)} ${target}`); },
  plain(msg) { console.log(msg); }
};

module.exports = log;
