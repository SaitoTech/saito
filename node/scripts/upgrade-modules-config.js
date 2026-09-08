#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { parseConfig } = require('./modules');

const replacements = {
  assetstore: 'store',
  blog: null,
  diddy: null,
  explorerc: 'explorer',
  scripting: 'rustscript'
};

function upgradeConfig(content) {
  const document = parseConfig(content);
  const removed = new Set();
  const changes = [];

  for (const section of Object.values(document.sections)) {
    for (const [oldName, newName] of Object.entries(replacements)) {
      const oldPath = `${oldName}/${oldName}.js`;
      const matches = section.entries.filter((entry) => entry.path === oldPath);
      if (!matches.length) continue;
      for (const entry of matches) removed.add(entry.index);

      if (newName) {
        const newPath = `${newName}/${newName}.js`;
        const existing = section.entries.filter((entry) => entry.path === newPath);
        const enabled = matches.some((entry) => !entry.disabled);
        if (!existing.length) {
          const entry = matches.find((entry) => !entry.disabled) || matches[0];
          document.lines[entry.index] = entry.line.replace(oldPath, newPath);
          removed.delete(entry.index);
        } else if (enabled && existing.every((entry) => entry.disabled)) {
          // An enabled legacy module must retain an enabled replacement.
          const entry = existing[0];
          document.lines[entry.index] = entry.line.replace(/^(\s*)\/\/\s*/, '$1');
        }
      }
      changes.push(`${section.name}: ${oldName} → ${newName || 'removed'}`);
    }
  }

  const newline = content.includes('\r\n') ? '\r\n' : '\n';
  const updated = document.lines.filter((_, index) => !removed.has(index)).join(newline);
  const result = parseConfig(updated);
  // Enabling a commented replacement can put it after the former last entry.
  for (const section of Object.values(result.sections)) {
    const active = section.entries.filter((entry) => !entry.disabled);
    for (const entry of active.slice(0, -1)) {
      result.lines[entry.index] = entry.line.replace(/(['"])(\s*)$/, '$1,$2');
    }
  }
  return {
    content: result.lines.join(newline) + (document.trailingNewline ? newline : ''),
    changes
  };
}

function main() {
  let config = path.resolve(__dirname, '../config/modules.config.js');
  let dryRun = false;
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--help') {
      console.log(`Usage: node scripts/upgrade-modules-config.js [--config PATH] [--dry-run]

Upgrades core and lite entries from staging, preserving enabled/disabled state.
Removes blog and diddy; replaces assetstore, explorerc and scripting with store,
explorer and rustscript. Existing replacements are reused within each section.
Defaults to config/modules.config.js. Saves a backup before writing.`);
      return;
    } else if (args[i] === '--dry-run') {
      dryRun = true;
    } else if (args[i] === '--config' && args[i + 1] && !args[i + 1].startsWith('--')) {
      config = path.resolve(args[++i]);
    } else {
      throw new Error(`Invalid argument: ${args[i]} (see --help)`);
    }
  }

  config = fs.realpathSync(config);
  const original = fs.readFileSync(config, 'utf8');
  const result = upgradeConfig(original);
  if (!result.changes.length) {
    console.log('Module config is already up to date.');
    return;
  }
  console.log(result.changes.join('\n'));
  if (dryRun) {
    console.log('Dry run: no files changed.');
    return;
  }

  const backup = `${config}.backup-${randomUUID()}`;
  const temporary = `${config}.${randomUUID()}.tmp`;
  fs.copyFileSync(config, backup, fs.constants.COPYFILE_EXCL);
  try {
    fs.writeFileSync(temporary, result.content, { mode: fs.statSync(config).mode, flag: 'wx' });
    fs.renameSync(temporary, config);
  } finally {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
  console.log(`Updated ${config}\nBackup: ${backup}`);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = { upgradeConfig };
