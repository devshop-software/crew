const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

function walkSorted(folder) {
  const out = [];
  function walk(dir, rel) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const r = rel ? path.join(rel, e.name) : e.name;
      if (e.isDirectory()) walk(path.join(dir, e.name), r);
      else if (e.isFile()) out.push(r);
    }
  }
  walk(folder, '');
  return out.sort();
}

function hashSkill(folder) {
  const h = crypto.createHash('sha256');
  for (const rel of walkSorted(folder)) {
    h.update(rel + '\n');
    h.update(fs.readFileSync(path.join(folder, rel)));
    h.update('\n');
  }
  return 'sha256-' + h.digest('hex');
}

module.exports = { hashSkill, walkSorted };
