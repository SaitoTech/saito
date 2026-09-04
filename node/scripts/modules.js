#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_CONFIG_FILE = path.resolve(__dirname, '../config/modules.config.js');
const CONFIG_FILE = process.env.MODULES_CONFIG_FILE
  ? path.resolve(process.cwd(), process.env.MODULES_CONFIG_FILE)
  : DEFAULT_CONFIG_FILE;
const SECTIONS = ['core', 'lite'];
const CHANGE_COMMANDS = new Set(['add', 'enable', 'disable', 'remove']);

function usage(message) {
  const print = message ? console.error : console.log;
  if (message) {
    console.error(`Error: ${message}\n`);
  }

  print(`Usage:
  npm run modules -- add <module> [--lite|--core] [--sort]
  npm run modules -- enable <module> [--lite|--core] [--sort]
  npm run modules -- disable <module> [--lite|--core] [--sort]
  npm run modules -- remove <module> [--lite|--core] [--sort]
  npm run modules -- check <module>
  npm run modules -- sort [--lite|--core]
  npm run modules -- backup <name>
  npm run modules -- use <name>
  npm run modules -- --sort`);
  process.exitCode = 1;
}

function parseArguments(argv) {
  const options = { core: false, lite: false, sort: false };
  const positional = [];

  for (const argument of argv) {
    if (argument === '--core' || argument === '--lite') {
      options[argument.slice(2)] = true;
    } else if (argument === '--sort') {
      options.sort = true;
    } else if (argument === '--help' || argument === '-h') {
      options.help = true;
    } else if (argument.startsWith('--')) {
      throw new Error(`unknown option: ${argument}`);
    } else {
      positional.push(argument);
    }
  }

  const [command, ...values] = positional;
  return { command, values, options };
}

function modulePath(moduleName) {
  const name = moduleName.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name)) {
    throw new Error(`invalid module name: ${moduleName}`);
  }
  return `${name}/${name}.js`;
}

function backupName(values) {
  const name = values.join('').replace(/\s/g, '');
  if (!name) {
    throw new Error('backup name cannot be empty');
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name) || name === '..') {
    throw new Error(`invalid backup name: ${name}`);
  }
  return name;
}

function readConfig(filename = CONFIG_FILE) {
  try {
    return fs.readFileSync(filename, 'utf8');
  } catch (error) {
    throw new Error(`unable to read ${filename}: ${error.message}`);
  }
}

function parseModuleLine(line, index) {
  const match = line.match(/^(\s*)(\/\/\s*)?(['"])([^'"]+)\3\s*,?\s*$/);
  if (!match) {
    return null;
  }
  return {
    index,
    line,
    indent: match[1],
    disabled: Boolean(match[2]),
    path: match[4]
  };
}

function parseConfig(content) {
  const trailingNewline = content.endsWith('\n');
  const lines = content.split(/\r?\n/);
  if (trailingNewline) {
    lines.pop();
  }

  const sections = {};
  let active = null;

  lines.forEach((line, index) => {
    const opening = line.match(/^\s*(core|lite)\s*:\s*\[/);
    if (opening) {
      if (active) {
        throw new Error(`nested ${opening[1]} section at line ${index + 1}`);
      }
      const name = opening[1];
      if (sections[name]) {
        throw new Error(`duplicate ${name} section at line ${index + 1}`);
      }
      active = { name, start: index, end: null, entries: [] };
      sections[name] = active;
      return;
    }

    if (!active) {
      return;
    }

    if (/^\s*\],?\s*$/.test(line)) {
      active.end = index;
      active = null;
      return;
    }

    const entry = parseModuleLine(line, index);
    if (entry) {
      sections[active.name].entries.push(entry);
    } else if (line.trim() && !/^\s*\/\/(?!\s*['"])/.test(line)) {
      throw new Error(`unexpected content in ${active.name} section at line ${index + 1}`);
    }
  });

  if (active) {
    throw new Error(`unterminated ${active.name} section`);
  }
  for (const name of SECTIONS) {
    if (!sections[name] || sections[name].end === null) {
      throw new Error(`missing ${name} section`);
    }
  }

  return { lines, sections, trailingNewline };
}

function serialize(document) {
  return document.lines.join('\n') + (document.trailingNewline ? '\n' : '');
}

function writeConfig(content) {
  const directory = path.dirname(CONFIG_FILE);
  const temporary = path.join(
    directory,
    `.${path.basename(CONFIG_FILE)}.${process.pid}.${Date.now()}.tmp`
  );
  const mode = fs.statSync(CONFIG_FILE).mode;

  try {
    fs.writeFileSync(temporary, content, { mode });
    fs.renameSync(temporary, CONFIG_FILE);
  } catch (error) {
    try {
      fs.unlinkSync(temporary);
    } catch (_) {
      // The temporary file may not have been created or may already be renamed.
    }
    throw new Error(`unable to update ${CONFIG_FILE}: ${error.message}`);
  }
}

function statusOf(entries) {
  if (entries.length === 0) {
    return 'not installed';
  }
  const enabled = entries.some((entry) => !entry.disabled);
  const disabled = entries.some((entry) => entry.disabled);
  if (enabled && disabled) {
    return 'installed (duplicate enabled and disabled entries)';
  }
  return enabled ? 'installed, enabled' : 'installed, disabled';
}

function entriesFor(section, wantedPath) {
  return section.entries.filter((entry) => entry.path === wantedPath);
}

function mutateSection(document, sectionName, command, wantedPath) {
  const section = document.sections[sectionName];
  const matches = entriesFor(section, wantedPath);

  if (command === 'add') {
    if (matches.length > 0) {
      return { changed: false, message: `already there (${statusOf(matches)})` };
    }
    const indent = section.entries[0]?.indent ?? '    ';
    document.lines.splice(section.end, 0, `${indent}'${wantedPath}',`);
    return { changed: true, message: 'added and enabled' };
  }

  if (matches.length === 0) {
    return { changed: false, message: 'not installed' };
  }

  if (command === 'remove') {
    for (const entry of [...matches].sort((a, b) => b.index - a.index)) {
      document.lines.splice(entry.index, 1);
    }
    return { changed: true, message: 'removed' };
  }

  const shouldDisable = command === 'disable';
  const changes = matches.filter((entry) => entry.disabled !== shouldDisable);
  if (changes.length === 0) {
    return {
      changed: false,
      message: `already ${shouldDisable ? 'disabled' : 'enabled'}`
    };
  }

  for (const entry of changes) {
    document.lines[entry.index] = shouldDisable
      ? entry.line.replace(/^(\s*)/, '$1//')
      : entry.line.replace(/^(\s*)\/\/\s*/, '$1');
  }
  return { changed: true, message: shouldDisable ? 'disabled' : 'enabled' };
}

function changeModules(command, moduleName, targets, sortRequested) {
  const wantedPath = modulePath(moduleName);
  let content = readConfig();
  let changed = false;
  const changedSections = [];
  const results = [];

  // Reparse after every mutation so indexes remain accurate.
  for (const sectionName of targets) {
    const document = parseConfig(content);
    const result = mutateSection(document, sectionName, command, wantedPath);
    results.push(`${sectionName}: ${result.message}`);
    if (result.changed) {
      content = serialize(document);
      changed = true;
      changedSections.push(sectionName);
    }
  }

  if (command === 'add' && changedSections.length > 0) {
    content = sortContent(content, changedSections);
  }

  if (sortRequested) {
    const sorted = sortContent(content);
    changed ||= sorted !== content;
    content = sorted;
  }

  if (changed) {
    writeConfig(content);
  }
  for (const result of results) {
    console.log(`${moduleName} — ${result}`);
  }
  if (sortRequested) {
    console.log('Modules sorted: core and lite');
  }
}

function checkModule(moduleName) {
  const wantedPath = modulePath(moduleName);
  const document = parseConfig(readConfig());
  for (const sectionName of SECTIONS) {
    const matches = entriesFor(document.sections[sectionName], wantedPath);
    console.log(`${moduleName} — ${sectionName}: ${statusOf(matches)}`);
  }
}

function sortContent(content, sectionNames = SECTIONS) {
  const document = parseConfig(content);

  // Work from the lower section upward so earlier line indexes stay valid.
  const sections = [...sectionNames]
    .map((name) => document.sections[name])
    .sort((a, b) => b.start - a.start);

  for (const section of sections) {
    const nonEntries = document.lines
      .slice(section.start + 1, section.end)
      .filter((line) => line.trim() && !parseModuleLine(line, -1));
    if (nonEntries.length > 0) {
      throw new Error(`cannot sort comments inside the ${section.name} section`);
    }

    const byPath = new Map();
    for (const entry of section.entries) {
      const key = entry.path.toLowerCase();
      const current = byPath.get(key);
      if (!current || (current.disabled && !entry.disabled)) {
        byPath.set(key, entry);
      }
    }
    const entries = [...byPath.values()].sort((a, b) =>
      a.path.toLowerCase().localeCompare(b.path.toLowerCase(), 'en')
    );
    const indent = section.entries[0]?.indent ?? '    ';
    const replacement = entries.map(
      (entry) => `${indent}${entry.disabled ? '//' : ''}'${entry.path}',`
    );
    document.lines.splice(section.start + 1, section.end - section.start - 1, ...replacement);
  }

  return serialize(document);
}

function sortModules(sectionNames = SECTIONS) {
  const content = readConfig();
  const sorted = sortContent(content, sectionNames);
  if (sorted !== content) {
    writeConfig(sorted);
  }
  console.log(`Modules sorted: ${sectionNames.join(' and ')}`);
}

function backupModules(values) {
  const name = backupName(values);
  const destination = `${CONFIG_FILE}.${name}`;
  try {
    fs.copyFileSync(CONFIG_FILE, destination, fs.constants.COPYFILE_EXCL);
  } catch (error) {
    if (error.code === 'EEXIST') {
      throw new Error(`backup already exists: ${path.basename(destination)}`);
    }
    throw new Error(`unable to create backup: ${error.message}`);
  }
  console.log(`Backup created: ${path.basename(destination)}`);
}

function useBackup(values) {
  const name = backupName(values);
  const source = `${CONFIG_FILE}.${name}`;
  const content = readConfig(source);
  parseConfig(content);
  writeConfig(content);
  console.log(`Module set restored from: ${path.basename(source)}`);
}

function main() {
  let parsed;
  try {
    parsed = parseArguments(process.argv.slice(2));
  } catch (error) {
    usage(error.message);
    return;
  }

  const { command, values, options } = parsed;
  if (options.help) {
    usage();
    process.exitCode = 0;
    return;
  }

  try {
    if (!command && options.sort && values.length === 0) {
      if (options.core || options.lite) {
        throw new Error('--core and --lite require a change command');
      }
      sortModules();
      return;
    }

    if (CHANGE_COMMANDS.has(command)) {
      if (values.length !== 1) {
        throw new Error(`${command} requires exactly one module name`);
      }
      const targets =
        options.core || options.lite ? SECTIONS.filter((name) => options[name]) : SECTIONS;
      changeModules(command, values[0], targets, options.sort);
      return;
    }

    if (command === 'check') {
      if (values.length !== 1) {
        throw new Error('check requires exactly one module name');
      }
      if (options.core || options.lite || options.sort) {
        throw new Error('check always reports both core and lite');
      }
      checkModule(values[0]);
      return;
    }

    if (command === 'sort') {
      if (values.length !== 0) {
        throw new Error('sort does not accept a module name');
      }
      if (options.sort) {
        throw new Error('use either sort or --sort, not both');
      }
      const targets =
        options.core || options.lite ? SECTIONS.filter((name) => options[name]) : SECTIONS;
      sortModules(targets);
      return;
    }

    if (command === 'backup' || command === 'use') {
      if (values.length === 0) {
        throw new Error(`${command} requires a name`);
      }
      if (options.core || options.lite || options.sort) {
        throw new Error(`${command} does not accept section or sort options`);
      }
      if (command === 'backup') {
        backupModules(values);
      } else {
        useBackup(values);
      }
      return;
    }

    throw new Error(command ? `unknown command: ${command}` : 'a command is required');
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exitCode = 1;
  }
}

main();
