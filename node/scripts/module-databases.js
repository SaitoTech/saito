#!/usr/bin/env node

'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');
const vm = require('node:vm');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');

const projectRoot = path.resolve(__dirname, '..');

function usage() {
  console.log(`Usage: node scripts/module-databases.js [options]

Checks databases used by modules in the core section of modules.config.js.
The complete version/schema check runs before any creation prompt.

Options:
  --config PATH     modules.config.js path (default: config/modules.config.js)
  --data-dir PATH   SQLite database directory (default: data)
  --repair          back up databases and apply safe, additive schema repairs
  --yes             create missing databases without an interactive prompt
  --help            show this help

Without --repair, only missing .sq3 files are created. Repair mode never drops
tables, columns, indexes, or data, and never rewrites differing definitions.`);
}

function parseArguments(argv) {
  const args = {
    config: path.join(projectRoot, 'config/modules.config.js'),
    dataDir: path.join(projectRoot, 'data'),
    repair: false,
    yes: false
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help') {
      usage();
      process.exit(0);
    }
    if (arg === '--yes') {
      args.yes = true;
      continue;
    }
    if (arg === '--repair') {
      args.repair = true;
      continue;
    }
    if (['--config', '--data-dir'].includes(arg)) {
      const value = argv[++i];
      if (!value) {
        throw new Error(`${arg} requires a path`);
      }
      const key = arg === '--data-dir' ? 'dataDir' : arg.slice(2);
      args[key] = path.resolve(process.cwd(), value);
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return args;
}

function loadModuleConfig(filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const commonJsSource = source.replace(/^\s*export\s+default\s+/, 'module.exports = ');
  if (commonJsSource === source) {
    throw new Error(`Expected an export default in ${filename}`);
  }

  const sandbox = { module: { exports: {} } };
  vm.runInNewContext(commonJsSource, sandbox, {
    filename,
    timeout: 1000
  });

  if (!Array.isArray(sandbox.module.exports.core)) {
    throw new Error(`${filename} does not export a core module array`);
  }
  return sandbox.module.exports;
}

function literalAssignment(source, property) {
  const match = source.match(new RegExp(`this\\.${property}\\s*=\\s*(['\"])([^'\"]+)\\1`));
  return match ? match[2] : null;
}

function moduleDefinition(entry) {
  const sourceFile = path.join(projectRoot, 'mods', entry);
  const source = fs.readFileSync(sourceFile, 'utf8');
  const dirname = entry.split('/')[0];
  const name = literalAssignment(source, 'name') || dirname;
  const slug = literalAssignment(source, 'slug') || dirname;
  const dbname = literalAssignment(source, 'dbname') || slug;
  const sqlDir = path.join(projectRoot, 'mods', dirname, 'sql');
  const sqlFiles = fs.existsSync(sqlDir)
    ? fs
        .readdirSync(sqlDir)
        .filter((filename) => filename.endsWith('.sql'))
        .sort()
        .map((filename) => path.join(sqlDir, filename))
    : [];

  if (/this\.shortlinks_enabled\s*=\s*(?:1|true)\b/.test(source)) {
    sqlFiles.push(path.join(projectRoot, 'lib/templates/sql/shortlinks1.sql'));
  }

  if (!/^[A-Za-z0-9._-]+$/.test(dbname)) {
    throw new Error(`Unsafe database name ${JSON.stringify(dbname)} in ${sourceFile}`);
  }

  return {
    entry,
    name,
    dbname,
    sqlFiles
  };
}

function quoteIdentifier(identifier) {
  return `"${identifier.replace(/"/g, '""')}"`;
}

function normalizeSql(sql) {
  return String(sql || '')
    .replace(/--[^\n]*/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\s*([(),])\s*/g, '$1')
    .trim()
    .toLowerCase();
}

function normalizeDefault(value) {
  if (value === null || value === undefined) return null;
  return String(value)
    .replace(/^\((.*)\)$/s, '$1')
    .trim()
    .replace(/"/g, "'")
    .toLowerCase();
}

function splitTableDefinition(createSql) {
  const openParen = createSql.indexOf('(');
  if (openParen === -1) return [];

  const parts = [];
  let start = openParen + 1;
  let depth = 0;
  let quote = null;
  for (let i = start; i < createSql.length; i++) {
    const character = createSql[i];
    if (quote) {
      const closing = quote === '[' ? ']' : quote;
      if (character === closing) {
        if (quote !== '[' && createSql[i + 1] === closing) {
          i++;
        } else {
          quote = null;
        }
      }
      continue;
    }
    if (["'", '"', '`', '['].includes(character)) {
      quote = character;
    } else if (character === '(') {
      depth++;
    } else if (character === ')') {
      if (depth === 0) {
        parts.push(createSql.slice(start, i).trim());
        break;
      }
      depth--;
    } else if (character === ',' && depth === 0) {
      parts.push(createSql.slice(start, i).trim());
      start = i + 1;
    }
  }
  return parts.filter(Boolean);
}

function unquoteIdentifier(identifier) {
  if (identifier.startsWith('[') && identifier.endsWith(']')) {
    return identifier.slice(1, -1);
  }
  if (/^["'`].*["'`]$/.test(identifier)) {
    const quote = identifier[0];
    return identifier.slice(1, -1).replace(new RegExp(`${quote}${quote}`, 'g'), quote);
  }
  return identifier;
}

function columnDefinitions(createSql) {
  const definitions = {};
  const tableConstraints = new Set(['constraint', 'primary', 'unique', 'check', 'foreign']);
  for (const part of splitTableDefinition(createSql)) {
    const clause = part.replace(/^(?:\s*--[^\n]*(?:\n|$)|\s*\/\*[\s\S]*?\*\/)+/, '').trim();
    const match = clause.match(/^\s*("(?:""|[^"])+"|`(?:``|[^`])+`|\[[^\]]+\]|[^\s]+)/);
    if (!match) continue;
    const name = unquoteIdentifier(match[1]);
    if (!tableConstraints.has(name.toLowerCase())) definitions[name] = clause;
  }
  return definitions;
}

async function repairArtifacts(db) {
  const rows = await db.all(`
    SELECT type, name, tbl_name, sql
      FROM sqlite_master
     WHERE name NOT LIKE 'sqlite_%'
       AND sql IS NOT NULL
       AND type IN ('table', 'index', 'view', 'trigger')
     ORDER BY type, name
  `);
  const artifacts = { tables: {}, indexes: {}, views: {}, triggers: {}, columns: {} };
  for (const row of rows) {
    const artifact = { table: row.tbl_name, sql: row.sql };
    const collection = row.type === 'index' ? 'indexes' : `${row.type}s`;
    artifacts[collection][row.name] = artifact;
    if (row.type === 'table') artifacts.columns[row.name] = columnDefinitions(row.sql);
  }
  return artifacts;
}

async function describeDatabase(db) {
  const objects = await db.all(`
    SELECT type, name, tbl_name, sql
      FROM sqlite_master
     WHERE name NOT LIKE 'sqlite_%'
       AND type IN ('table', 'view', 'trigger')
     ORDER BY type, name
  `);

  const schema = { tables: {}, views: {}, triggers: {} };
  for (const object of objects) {
    if (object.type === 'table') {
      const columns = await db.all(`PRAGMA table_xinfo(${quoteIdentifier(object.name)})`);
      const foreignKeys = await db.all(`PRAGMA foreign_key_list(${quoteIdentifier(object.name)})`);
      const indexes = await db.all(`PRAGMA index_list(${quoteIdentifier(object.name)})`);

      const indexDefinitions = [];
      for (const index of indexes.sort((a, b) => a.name.localeCompare(b.name))) {
        const indexColumns = await db.all(`PRAGMA index_xinfo(${quoteIdentifier(index.name)})`);
        const row = await db.get(
          'SELECT sql FROM sqlite_master WHERE type = ? AND name = ?',
          'index',
          index.name
        );
        indexDefinitions.push({
          name: index.name,
          unique: Number(index.unique),
          origin: index.origin,
          partial: Number(index.partial),
          columns: indexColumns.map((column) => ({
            seqno: column.seqno,
            cid: column.cid,
            name: column.name,
            desc: column.desc,
            coll: column.coll,
            key: column.key
          })),
          sql: normalizeSql(row && row.sql)
        });
      }

      schema.tables[object.name] = {
        sql: normalizeSql(object.sql),
        columns: columns.map((column) => ({
          cid: column.cid,
          name: column.name,
          type: String(column.type || '')
            .trim()
            .toUpperCase(),
          notnull: Number(column.notnull),
          default: normalizeDefault(column.dflt_value),
          pk: Number(column.pk),
          hidden: Number(column.hidden)
        })),
        foreignKeys: foreignKeys.map((foreignKey) => ({
          id: foreignKey.id,
          seq: foreignKey.seq,
          table: foreignKey.table,
          from: foreignKey.from,
          to: foreignKey.to,
          onUpdate: foreignKey.on_update,
          onDelete: foreignKey.on_delete,
          match: foreignKey.match
        })),
        indexes: indexDefinitions
      };
    } else {
      schema[`${object.type}s`][object.name] = {
        table: object.tbl_name,
        sql: normalizeSql(object.sql)
      };
    }
  }

  return schema;
}

function fingerprint(schema) {
  return crypto.createHash('sha256').update(JSON.stringify(schema)).digest('hex').slice(0, 12);
}

async function applyDefinitions(db, definition) {
  const warnings = [];
  for (const sqlFile of definition.sqlFiles) {
    try {
      await db.exec(fs.readFileSync(sqlFile, 'utf8'));
    } catch (error) {
      const message = `${path.relative(projectRoot, sqlFile)}: ${error.message}`;
      if (/duplicate column name:/i.test(error.message)) {
        warnings.push(message);
      } else {
        throw new Error(`could not build schema from ${message}`);
      }
    }
  }
  return warnings;
}

async function expectedSchema(definition) {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  try {
    const warnings = await applyDefinitions(db, definition);
    return {
      schema: await describeDatabase(db),
      artifacts: await repairArtifacts(db),
      warnings
    };
  } finally {
    await db.close();
  }
}

async function actualSchema(filename) {
  const db = await open({
    filename,
    mode: sqlite3.OPEN_READONLY,
    driver: sqlite3.Database
  });
  try {
    return await describeDatabase(db);
  } finally {
    await db.close();
  }
}

function valuesEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function diffNamedObjects(expected, actual, label, differences) {
  for (const name of Object.keys(expected)) {
    if (!actual[name]) {
      differences.push(`missing ${label} ${name}`);
    } else if (!valuesEqual(expected[name], actual[name])) {
      differences.push(`${label} ${name} definition differs`);
    }
  }
  for (const name of Object.keys(actual)) {
    if (!expected[name]) differences.push(`extra ${label} ${name}`);
  }
}

function diffSchemas(expected, actual) {
  const differences = [];
  const expectedTables = expected.tables;
  const actualTables = actual.tables;

  for (const tableName of Object.keys(expectedTables)) {
    const expectedTable = expectedTables[tableName];
    const actualTable = actualTables[tableName];
    if (!actualTable) {
      differences.push(`missing table ${tableName}`);
      continue;
    }

    const expectedColumns = new Map(expectedTable.columns.map((column) => [column.name, column]));
    const actualColumns = new Map(actualTable.columns.map((column) => [column.name, column]));
    for (const [columnName, column] of expectedColumns) {
      if (!actualColumns.has(columnName)) {
        differences.push(`missing column ${tableName}.${columnName}`);
      } else if (!valuesEqual(column, actualColumns.get(columnName))) {
        differences.push(`column ${tableName}.${columnName} definition differs`);
      }
    }
    for (const columnName of actualColumns.keys()) {
      if (!expectedColumns.has(columnName))
        differences.push(`extra column ${tableName}.${columnName}`);
    }

    const expectedIndexes = Object.fromEntries(
      expectedTable.indexes.map((index) => [index.name, index])
    );
    const actualIndexes = Object.fromEntries(
      actualTable.indexes.map((index) => [index.name, index])
    );
    diffNamedObjects(expectedIndexes, actualIndexes, 'index', differences);

    if (!valuesEqual(expectedTable.foreignKeys, actualTable.foreignKeys)) {
      differences.push(`table ${tableName} foreign keys differ`);
    }
    if (expectedTable.sql !== actualTable.sql) {
      differences.push(`table ${tableName} stored DDL differs`);
    }
  }

  for (const tableName of Object.keys(actualTables)) {
    if (!expectedTables[tableName]) differences.push(`extra table ${tableName}`);
  }

  diffNamedObjects(expected.views, actual.views, 'view', differences);
  diffNamedObjects(expected.triggers, actual.triggers, 'trigger', differences);
  return [...new Set(differences)];
}

function planRepairs(result) {
  const operations = [];
  const { expected, actual, artifacts } = result;

  for (const [tableName, expectedTable] of Object.entries(expected.tables)) {
    const actualTable = actual.tables[tableName];
    if (!actualTable) {
      operations.push({
        description: `create missing table ${tableName}`,
        sql: artifacts.tables[tableName].sql
      });
    } else {
      const expectedNames = expectedTable.columns.map((column) => column.name);
      const actualNames = actualTable.columns.map((column) => column.name);
      const actualIsExpectedPrefix = actualNames.every(
        (columnName, index) => expectedNames[index] === columnName
      );

      if (actualIsExpectedPrefix) {
        for (const column of expectedTable.columns.slice(actualNames.length)) {
          const clause = artifacts.columns[tableName] && artifacts.columns[tableName][column.name];
          const unsafeConstraint =
            !clause ||
            column.hidden !== 0 ||
            /\b(?:primary\s+key|unique|generated\s+always)\b/i.test(clause) ||
            (column.notnull === 1 && column.default === null);
          if (!unsafeConstraint) {
            operations.push({
              description: `add missing column ${tableName}.${column.name}`,
              sql: `ALTER TABLE ${quoteIdentifier(tableName)} ADD COLUMN ${clause}`
            });
          }
        }
      }
    }
  }

  for (const [indexName, artifact] of Object.entries(artifacts.indexes)) {
    const actualTable = actual.tables[artifact.table];
    const hasIndex = actualTable?.indexes.some((index) => index.name === indexName);
    if (!hasIndex) {
      operations.push({
        description: `create missing index ${indexName}`,
        sql: artifact.sql
      });
    }
  }

  for (const type of ['view', 'trigger']) {
    const plural = `${type}s`;
    for (const [name, artifact] of Object.entries(artifacts[plural])) {
      if (!actual[plural][name]) {
        operations.push({ description: `create missing ${type} ${name}`, sql: artifact.sql });
      }
    }
  }

  return operations;
}

function quoteSqlString(value) {
  return `'${value.replace(/'/g, "''")}'`;
}

function backupFilename(filename) {
  const timestamp = new Date()
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z');
  return `${filename}.backup-${timestamp}`;
}

async function repairDatabase(result, operations) {
  const backup = backupFilename(result.filename);
  if (fs.existsSync(backup)) throw new Error(`backup already exists: ${backup}`);

  const db = await open({ filename: result.filename, driver: sqlite3.Database });
  try {
    await db.exec(`VACUUM INTO ${quoteSqlString(backup)}`);
    await db.exec('BEGIN IMMEDIATE');
    try {
      for (const operation of operations) await db.exec(operation.sql);
      await db.exec('COMMIT');
    } catch (error) {
      await db.exec('ROLLBACK').catch(() => {});
      throw error;
    }
    const schema = await describeDatabase(db);
    return { backup, differences: diffSchemas(result.expected, schema) };
  } catch (error) {
    if (fs.existsSync(backup)) {
      throw new Error(`${error.message}; backup: ${backup}`);
    }
    throw error;
  } finally {
    await db.close();
  }
}

function prompt(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (answer) => {
      rl.close();
      resolve(/^y(?:es)?$/i.test(answer.trim()));
    });
  });
}

async function createDatabase(result, dataDir) {
  fs.mkdirSync(dataDir, { recursive: true });
  const target = result.filename;
  const temporary = path.join(
    dataDir,
    `.${result.definition.dbname}.sq3.${process.pid}.${Date.now()}.tmp`
  );
  let db;
  try {
    db = await open({ filename: temporary, driver: sqlite3.Database });
    const warnings = await applyDefinitions(db, result.definition);
    const createdSchema = await describeDatabase(db);
    await db.close();
    db = null;

    if (!valuesEqual(createdSchema, result.expected)) {
      throw new Error('created schema did not match the checked definition');
    }
    if (fs.existsSync(target)) {
      throw new Error(`${target} appeared while the audit was running; refusing to overwrite it`);
    }
    fs.renameSync(temporary, target);
    return warnings;
  } catch (error) {
    if (db) await db.close().catch(() => {});
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
    throw error;
  }
}

async function main() {
  const args = parseArguments(process.argv.slice(2));
  const config = loadModuleConfig(args.config);
  const definitions = config.core
    .map((entry) => moduleDefinition(entry))
    .filter((definition) => definition.sqlFiles.length > 0);

  const duplicateDatabaseNames = definitions.filter(
    (definition, index) =>
      definitions.findIndex((candidate) => candidate.dbname === definition.dbname) !== index
  );
  if (duplicateDatabaseNames.length) {
    throw new Error(
      `Multiple core modules use the same database: ${duplicateDatabaseNames
        .map((definition) => definition.dbname)
        .join(', ')}`
    );
  }

  console.log('Database schema version check (read-only)');
  console.log(`  config:  ${path.relative(projectRoot, args.config) || args.config}`);
  console.log(`  data:    ${path.relative(projectRoot, args.dataDir) || args.dataDir}`);

  const results = [];
  for (const definition of definitions) {
    const expected = await expectedSchema(definition);
    const filename = path.join(args.dataDir, `${definition.dbname}.sq3`);
    const exists = fs.existsSync(filename);
    const actual = exists ? await actualSchema(filename) : null;
    const differences = actual
      ? diffSchemas(expected.schema, actual)
      : ['database file is missing'];
    const expectedVersion = fingerprint(expected.schema);
    const actualVersion = actual ? fingerprint(actual) : 'missing';
    const status = differences.length === 0 ? 'MATCH' : exists ? 'DIFF' : 'MISSING';

    console.log(
      `  ${definition.name.padEnd(12)} ${status.padEnd(7)} code=${expectedVersion} db=${actualVersion}`
    );
    for (const warning of expected.warnings) console.log(`    definition warning: ${warning}`);
    for (const difference of differences) console.log(`    - ${difference}`);

    results.push({
      definition,
      filename,
      expected: expected.schema,
      artifacts: expected.artifacts,
      actual,
      exists,
      differences
    });
  }

  const missing = results.filter((result) => !result.exists);
  const different = results.filter((result) => result.exists && result.differences.length > 0);
  const matching = results.length - missing.length - different.length;
  console.log(
    `\nChecked ${results.length} database-backed core modules: ${matching} match, ${different.length} differ, ${missing.length} missing.`
  );

  if (missing.length) {
    console.log('\nMissing databases:');
    for (const result of missing) {
      console.log(`  - ${result.definition.name}: ${result.filename}`);
    }
  }

  const repairPlans = args.repair
    ? different
        .map((result) => ({ result, operations: planRepairs(result) }))
        .filter((plan) => plan.operations.length > 0)
    : [];
  const repairCount = repairPlans.reduce((total, plan) => total + plan.operations.length, 0);

  if (args.repair && different.length) {
    console.log('\nSafe additive repair plan:');
    for (const plan of repairPlans) {
      console.log(`  ${plan.result.definition.name}:`);
      for (const operation of plan.operations) console.log(`    - ${operation.description}`);
    }
    if (repairCount === 0) {
      console.log('  No additive repairs are available; the reported drift needs manual review.');
    }
    console.log('  Differing and extra definitions will not be removed or rewritten.');
  }

  const actionCount = missing.length + repairCount;
  if (actionCount === 0) {
    console.log(
      different.length
        ? 'No safe requested changes are available. Existing databases were not changed.'
        : 'No databases need to be created or repaired.'
    );
    if (different.length) process.exitCode = 1;
    return;
  }

  const actionSummary = [
    missing.length ? `create ${missing.length} database(s)` : '',
    repairCount ? `apply ${repairCount} additive repair(s)` : ''
  ]
    .filter(Boolean)
    .join(' and ');
  let approved = args.yes;
  if (repairCount) console.log('\nEach repaired database will be backed up first.');
  if (!approved && process.stdin.isTTY) {
    approved = await prompt(`\nProceed to ${actionSummary}? [y/N] `);
  } else if (!approved) {
    console.log(
      '\nNo interactive terminal detected; nothing changed. Re-run with --yes to approve.'
    );
  }

  if (!approved) {
    console.log('Nothing changed.');
    process.exitCode = 1;
    return;
  }

  if (missing.length) console.log('\nCreating missing databases:');
  let createFailures = 0;
  for (const result of missing) {
    try {
      const warnings = await createDatabase(result, args.dataDir);
      console.log(`  created ${result.filename}`);
      for (const warning of warnings) console.log(`    definition warning: ${warning}`);
    } catch (error) {
      createFailures++;
      console.error(`  failed ${result.filename}: ${error.message}`);
    }
  }

  const remainingDifferent = new Set(different.map((result) => result.filename));
  let repairFailures = 0;
  if (repairPlans.length) console.log('\nRepairing existing databases:');
  for (const plan of repairPlans) {
    try {
      const repaired = await repairDatabase(plan.result, plan.operations);
      console.log(`  repaired ${plan.result.filename}`);
      console.log(`    backup: ${repaired.backup}`);
      if (repaired.differences.length === 0) {
        remainingDifferent.delete(plan.result.filename);
      } else {
        console.log('    remaining differences:');
        for (const difference of repaired.differences) console.log(`      - ${difference}`);
      }
    } catch (error) {
      repairFailures++;
      console.error(`  failed ${plan.result.filename}: ${error.message}`);
    }
  }

  if (createFailures || repairFailures || remainingDifferent.size) process.exitCode = 1;
}

main().catch((error) => {
  console.error(`module-databases: ${error.message}`);
  process.exitCode = 2;
});
