#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { parseConfig } = require('./modules');

const replacements = {
  assetstore: 'store',
  blog: null,
  diddy: null,
  explorerc: 'explorer',
  scripting: 'rustscript',
  status: null
};

function validateSyntax(content) {
  // Parse only: never execute the configuration or load module code.
  const syntax = spawnSync(process.execPath, ['--input-type=module', '--check'], {
    input: content,
    encoding: 'utf8'
  });
  if (syntax.error) throw syntax.error;
  if (syntax.status !== 0) {
    throw new Error(`Invalid config JavaScript:\n${syntax.stderr}`);
  }
}

function checkFormatting(content) {
  validateSyntax(content);
  const document = parseConfig(content);
  const issues = [];
  for (const section of Object.values(document.sections)) {
    if (!/^\s*(core|lite)\s*:\s*\[\s*(?:\/\/.*)?$/.test(document.lines[section.start])) {
      issues.push(`Line ${section.start + 1}: put module entries on separate lines`);
    }
    for (const entry of section.entries) {
      if (!/^\s*(?:\/\/\s*)?'[^']+',\s*$/.test(entry.line)) {
        issues.push(`Line ${entry.index + 1}: use single quotes and a trailing comma`);
      }
    }
    if (!/\],\s*$/.test(document.lines[section.end])) {
      issues.push(`Line ${section.end + 1}: add a trailing comma after the section array`);
    }
  }
  if (issues.length) throw new Error(`Config formatting issues:\n${issues.join('\n')}`);
}

function validateConfig(content, modulesDir) {
  validateSyntax(content);

  const missing = [];
  const warnings = [];
  for (const section of Object.values(parseConfig(content).sections)) {
    for (const entry of section.entries) {
      const filename = path.resolve(modulesDir, entry.path);
      const relative = path.relative(modulesDir, filename);
      let exists = false;
      if (
        relative &&
        !relative.startsWith(`..${path.sep}`) &&
        relative !== '..' &&
        !path.isAbsolute(relative)
      ) {
        try {
          exists = fs.statSync(filename).isFile();
        } catch (error) {
          if (!['ENOENT', 'ENOTDIR'].includes(error.code)) throw error;
        }
      }
      if (!exists) {
        const message = `${section.name}: ${entry.path}`;
        if (entry.disabled) warnings.push(`Missing commented module: ${message}`);
        else missing.push(message);
      }
    }
  }
  if (missing.length) {
    throw new Error(
      `Module files missing from ${modulesDir}:\n${missing.join('\n')}${warnings.length ? '\n' + warnings.join('\n') : ''}`
    );
  }
  return warnings;
}

function upgradeConfig(content, modulesDir = path.resolve(__dirname, '../mods')) {
  const document = parseConfig(content);
  for (const section of Object.values(document.sections)) {
    if (!/^\s*(core|lite)\s*:\s*\[\s*(?:\/\/.*)?$/.test(document.lines[section.start])) {
      throw new Error(`${section.name}: put module entries on separate lines`);
    }
  }
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
  // Work backwards so insertions do not shift the other section's line numbers.
  for (const section of Object.values(result.sections).sort((a, b) => b.start - a.start)) {
    for (const name of ['explorer', 'admin']) {
      const wanted = `${name}/${name}.js`;
      const existing = section.entries.filter((entry) => entry.path === wanted);
      if (!existing.length) {
        const indent = section.entries[0]?.indent || '    ';
        result.lines.splice(section.end, 0, `${indent}'${wanted}',`);
        changes.push(`${section.name}: added ${name}`);
      } else if (existing.every((entry) => entry.disabled)) {
        const entry = existing[0];
        result.lines[entry.index] = entry.line.replace(/^(\s*)\/\/\s*/, '$1');
        changes.push(`${section.name}: enabled ${name}`);
      }
    }
  }

  const normalized = parseConfig(result.lines.join(newline));
  for (const section of Object.values(normalized.sections)) {
    for (const entry of section.entries) {
      // The parser accepts unescaped module paths in either quote style.
      normalized.lines[entry.index] =
        `${entry.indent}${entry.disabled ? '//' : ''}'${entry.path.replace(/\\/g, '\\\\')}',`;
    }
    normalized.lines[section.end] = normalized.lines[section.end].replace(/\](,?)(\s*)$/, '],$2');
  }
  const output = normalized.lines.join(newline) + (document.trailingNewline ? newline : '');
  if (output !== content && !changes.length) changes.push('Normalized quotes and commas.');
  const warnings = validateConfig(output, modulesDir);
  return { content: output, changes, warnings };
}

function main() {
  let config = path.resolve(__dirname, '../config/modules.config.js');
  let dryRun = false;
  let sanity = false;
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--help') {
      console.log(`Usage: node scripts/upgrade-modules-config.js [--config PATH] [--dry-run] [--sanity]

--sanity only checks formatting and JavaScript syntax; exits nonzero on issues.
It never changes files, migrates entries or checks module paths.

Upgrades core and lite entries from staging, preserving enabled/disabled state.
Ensures explorer and admin are enabled in both sections. Removes status, blog
and diddy; replaces assetstore, explorerc and scripting with store,
explorer and rustscript. Existing replacements are reused within each section.
Normalizes module entries to single quotes and trailing commas; checks JS syntax.
Checks entries against this checkout's mods directory. Missing active modules
abort without writing; missing commented modules are reported as warnings.
Defaults to config/modules.config.js. Saves a backup before writing.`);
      return;
    } else if (args[i] === '--dry-run') {
      dryRun = true;
    } else if (args[i] === '--sanity') {
      sanity = true;
    } else if (args[i] === '--config' && args[i + 1] && !args[i + 1].startsWith('--')) {
      config = path.resolve(args[++i]);
    } else {
      throw new Error(`Invalid argument: ${args[i]} (see --help)`);
    }
  }

  config = fs.realpathSync(config);
  const original = fs.readFileSync(config, 'utf8');
  if (sanity) {
    checkFormatting(original);
    console.log('Module config formatting and JavaScript syntax are valid.');
    return;
  }
  const result = upgradeConfig(original);
  for (const warning of result.warnings) console.warn(`Warning: ${warning}`);
  console.log('JavaScript syntax and active module paths validated.');
  if (result.content === original) {
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
