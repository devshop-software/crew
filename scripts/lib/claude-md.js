const fs = require('fs');

const HEADING_RE = /^##\s+Workflow Config\s*$/m;

function ensureWorkflowConfig(claudeMdPath, templatePath, { dryRun = false } = {}) {
  const template = fs.readFileSync(templatePath, 'utf8');
  if (!fs.existsSync(claudeMdPath)) {
    if (!dryRun) fs.writeFileSync(claudeMdPath, '# Project\n\n' + template);
    return 'created';
  }
  const existing = fs.readFileSync(claudeMdPath, 'utf8');
  if (HEADING_RE.test(existing)) return 'present';
  const sep = existing.endsWith('\n\n') ? '' : existing.endsWith('\n') ? '\n' : '\n\n';
  if (!dryRun) fs.appendFileSync(claudeMdPath, sep + template);
  return 'appended';
}

module.exports = { ensureWorkflowConfig };
