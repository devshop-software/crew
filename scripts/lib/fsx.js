const fs = require('fs');
const path = require('path');

function copyFolder(src, dst, { dryRun = false } = {}) {
  if (dryRun) return;
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name);
    const d = path.join(dst, e.name);
    if (e.isDirectory()) copyFolder(s, d);
    else if (e.isFile()) fs.copyFileSync(s, d);
  }
}

function backupFolder(src, bakBase, { dryRun = false } = {}) {
  const dst = path.join(bakBase, path.basename(src));
  if (dryRun) return dst;
  fs.mkdirSync(bakBase, { recursive: true });
  fs.renameSync(src, dst);
  return dst;
}

function removeFolder(p, { dryRun = false } = {}) {
  if (dryRun) return;
  if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true });
}

function backupRoot(skillsDir) {
  const ts = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
  return path.join(skillsDir, '.bak', ts);
}

module.exports = { copyFolder, backupFolder, removeFolder, backupRoot };
