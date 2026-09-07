#!/usr/bin/env node
'use strict';

// Upgrade staging databases to the SQL definitions in this checkout.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const {
  loadModuleConfig,
  moduleDefinition,
  expectedSchema,
  describeDatabase,
  repairArtifacts,
  planRepairs,
  columnDefinitions,
  quoteIdentifier: qi,
  quoteSqlString: qs
} = require('./module-databases');

const root = path.resolve(__dirname, '..');
const oldStatusCheck =
  /CHECK\s*\(\s*status\s+IN\s*\(\s*'pending'\s*,\s*'issuing'\s*,\s*'succeeded'\s*,\s*'failed'\s*\)\s*\)/i;
const newStatusCheck =
  "CHECK (status IN ('awaiting_mixin','pending','issuing','succeeded','failed'))";

function argumentsFor(argv) {
  const args = {
    config: path.join(root, 'config/modules.config.js'),
    dataDir: path.join(root, 'data'),
    dryRun: false
  };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--dry-run') args.dryRun = true;
    else if (argv[i] === '--help') {
      console.log(`Usage: node scripts/upgrade-module-databases.js [--dry-run] [--config PATH] [--data-dir PATH]

Upgrade databases for active core modules using this checkout's SQL definitions.
Creates missing databases/tables/indexes and appends missing columns in any order.
Also upgrades Migration's staging status CHECK constraint, preserving its data.
Existing databases are backed up before changes; each upgrade is transactional.
Stop the node before applying. --dry-run only reads schemas and prints the plan.`);
      return null;
    } else if (['--config', '--data-dir'].includes(argv[i])) {
      const key = argv[i] === '--config' ? 'config' : 'dataDir';
      if (!argv[++i] || argv[i].startsWith('--')) throw new Error(`${key} requires a path`);
      args[key] = path.resolve(argv[i]);
    } else throw new Error(`Unknown argument: ${argv[i]}`);
  }
  return args;
}

// Compare SQL tokens, retaining literal case and ignoring comments/formatting.
function tokens(sql) {
  return (sql.match(/--[^\n]*|\/\*[\s\S]*?\*\/|'(?:''|[^'])*'|"(?:""|[^"])*"|\w+|[^\s]/g) || [])
    .filter((token) => !token.startsWith('--') && !token.startsWith('/*'))
    .map((token) => (/^["']/.test(token) ? token : token.toLowerCase()));
}

function checks(sql) {
  const parts = tokens(sql);
  const result = [];
  for (let i = 0; i < parts.length; i++) {
    if (parts[i] !== 'check' || parts[i + 1] !== '(') continue;
    const start = i;
    let depth = 0;
    do {
      i++;
      if (parts[i] === '(') depth++;
      if (parts[i] === ')') depth--;
    } while (depth > 0 && i < parts.length);
    result.push(JSON.stringify(parts.slice(start, i + 1)));
  }
  return result.sort();
}

function indexShape(index) {
  return JSON.stringify({
    unique: index.unique,
    partial: index.partial,
    columns: index.columns.filter((c) => c.key).map(({ cid, ...column }) => column),
    // Include expressions and partial-index predicates, but ignore CREATE syntax.
    expression: index.sql ? tokens(index.sql.slice(index.sql.indexOf('('))) : null
  });
}

function compatibilityProblems(expected, actual, allowMissing = false) {
  const problems = [];
  for (const [name, table] of Object.entries(expected.tables)) {
    const existing = actual.tables[name];
    if (!existing) {
      if (!allowMissing) problems.push(`missing table ${name}`);
      continue;
    }
    for (const column of table.columns) {
      const old = existing.columns.find((item) => item.name === column.name);
      if (!old) {
        if (!allowMissing) problems.push(`missing column ${name}.${column.name}`);
      } else {
        const { cid: expectedPosition, ...wanted } = column;
        const { cid: actualPosition, ...found } = old;
        if (JSON.stringify(wanted) !== JSON.stringify(found))
          problems.push(`incompatible column ${name}.${column.name}`);
      }
    }
    // Missing CHECKs on new columns are validated after the ALTER statements.
    const missingChecks = allowMissing
      ? Object.entries(columnDefinitions(table.sql))
          .filter(([column]) => !existing.columns.some((item) => item.name === column))
          .flatMap(([, sql]) => checks(sql))
      : [];
    const requiredChecks = checks(table.sql).filter((check) => !missingChecks.includes(check));
    const actualChecks = checks(existing.sql);
    if (JSON.stringify(requiredChecks) !== JSON.stringify(actualChecks)) {
      problems.push(`incompatible CHECK constraints on ${name}`);
    }
    if (JSON.stringify(table.foreignKeys) !== JSON.stringify(existing.foreignKeys)) {
      problems.push(`incompatible foreign keys on ${name}`);
    }
    for (const index of table.indexes) {
      const found =
        index.origin === 'c'
          ? existing.indexes.find((item) => item.name === index.name)
          : existing.indexes.find(
              (item) => item.origin !== 'c' && indexShape(item) === indexShape(index)
            );
      if (!found) {
        if (!allowMissing || index.origin !== 'c')
          problems.push(`missing index/constraint ${index.name}`);
      } else if (indexShape(index) !== indexShape(found))
        problems.push(`incompatible index ${index.name}`);
    }
  }
  for (const type of ['views', 'triggers']) {
    for (const [name, object] of Object.entries(expected[type])) {
      if (!actual[type][name]) {
        if (!allowMissing) problems.push(`missing ${type}: ${name}`);
      } else if (
        JSON.stringify(tokens(object.sql)) !== JSON.stringify(tokens(actual[type][name].sql))
      ) {
        problems.push(`incompatible ${type}: ${name}`);
      }
    }
  }
  return problems;
}

async function targetSchema(definition) {
  const target = await expectedSchema(definition);
  // Store also adds these two persistent fields in lib/database.js:ensureSchema.
  if (definition.entry === 'store/store.js') {
    const db = await open({ filename: ':memory:', driver: sqlite3.Database });
    try {
      for (const file of definition.sqlFiles) await db.exec(fs.readFileSync(file, 'utf8'));
      for (const column of ['in_flight', 'reserved_order_id']) {
        if (!target.schema.tables.listings.columns.some((item) => item.name === column)) {
          await db.exec(`ALTER TABLE listings ADD COLUMN ${column} INTEGER NOT NULL DEFAULT 0`);
        }
      }
      target.schema = await describeDatabase(db);
      target.artifacts = await repairArtifacts(db);
    } finally {
      await db.close();
    }
  }
  return target;
}

function upgradePlan(definition, target, actual) {
  const operations = planRepairs(
    { expected: target.schema, artifacts: target.artifacts, actual },
    true
  );
  for (const [name, table] of Object.entries(target.schema.tables)) {
    if (!actual.tables[name]) continue;
    for (const column of table.columns) {
      if (
        !actual.tables[name].columns.some((item) => item.name === column.name) &&
        !operations.some((item) => item.description === `add missing column ${name}.${column.name}`)
      ) {
        throw new Error(
          `Cannot safely append ${name}.${column.name}; its constraints require a separate migration`
        );
      }
    }
  }
  // Preserve legacy Store crypto values when adding the replacement columns.
  if (definition.entry === 'store/store.js' && actual.tables.orders) {
    for (const name of ['utxo_slip', 'access_hash', 'access_script', 'p2sh_address']) {
      const columns = actual.tables.orders.columns.map((column) => column.name);
      if (!columns.includes(name) && columns.includes(`payment_${name}`)) {
        const operation = operations.find(
          (item) => item.description === `add missing column orders.${name}`
        );
        if (operation)
          operation.sql += `; UPDATE orders SET ${qi(name)} = ${qi(`payment_${name}`)}`;
      }
    }
  }
  if (definition.entry === 'store/store.js') {
    const chainFields = {
      listings: {
        block_id_listed: 'block_id',
        block_hash_listed: 'block_hash',
        transaction_id_listed: 'transaction_id',
        longest_chain_listed: 'longest_chain'
      },
      orders: {
        block_id_received: 'block_id_added',
        block_hash_received: 'block_hash_added',
        transaction_id_received: 'transaction_id_added',
        longest_chain_received: 'longest_chain_added',
        block_id_fulfilled: 'block_id_confirmed',
        block_hash_fulfilled: 'block_hash_confirmed',
        transaction_id_fulfilled: 'transaction_id_confirmed',
        longest_chain_fulfilled: 'longest_chain_confirmed'
      }
    };
    for (const [table, fields] of Object.entries(chainFields)) {
      const columns = actual.tables[table]?.columns.map((column) => column.name) || [];
      for (const [to, from] of Object.entries(fields)) {
        const operation = operations.find(
          (item) => item.description === `add missing column ${table}.${to}`
        );
        if (operation && columns.includes(from)) {
          operation.sql += `; UPDATE ${qi(table)} SET ${qi(to)} = ${qi(from)}`;
        }
      }
    }
    const listingColumns = actual.tables.listings?.columns.map((column) => column.name) || [];
    if (
      !listingColumns.includes('block_id_sold') &&
      ['spent', 'block_id', 'block_hash', 'transaction_id', 'longest_chain'].every((name) =>
        listingColumns.includes(name)
      )
    ) {
      operations.push({
        description: 'preserve legacy sold listing chain fields',
        sql: `UPDATE listings
        SET block_id_sold=block_id, block_hash_sold=block_hash,
            transaction_id_sold=transaction_id, longest_chain_sold=longest_chain
        WHERE spent=1 AND block_id != 0`
      });
    }
  }
  if (
    definition.entry === 'migration/migration.js' &&
    oldStatusCheck.test(actual.tables.auto_migration?.sql || '')
  ) {
    operations.push({
      description: 'allow awaiting_mixin in auto_migration.status (rebuild table)',
      rebuildMigration: true
    });
  }
  return operations;
}

async function rebuildMigration(db) {
  const { sql } = await db.get(
    "SELECT sql FROM sqlite_master WHERE type='table' AND name='auto_migration'"
  );
  if (!oldStatusCheck.test(sql)) return;
  const temp = '__core_upgrade_auto_migration';
  if (await db.get('SELECT 1 FROM sqlite_master WHERE name=?', temp))
    throw new Error(`table ${temp} already exists`);
  const objects = await db.all(
    "SELECT sql FROM sqlite_master WHERE tbl_name='auto_migration' AND type IN ('index','trigger') AND sql IS NOT NULL"
  );
  const columns = await db.all('PRAGMA table_xinfo(auto_migration)');
  const names = columns
    .filter((c) => !c.hidden)
    .map((c) => qi(c.name))
    .join(', ');
  // Copy entirely within SQLite: token amounts and row IDs may exceed JS safe integers.
  await db.exec(
    `CREATE TEMP TABLE __core_upgrade_sequence AS SELECT seq FROM sqlite_sequence WHERE name='auto_migration'`
  );
  const create = sql.replace(
    /^(CREATE TABLE\s+(?:IF NOT EXISTS\s+)?)(?:"auto_migration"|`auto_migration`|\[auto_migration\]|auto_migration)/i,
    `$1${qi(temp)}`
  );
  if (create === sql) throw new Error('Unsupported auto_migration CREATE TABLE syntax');
  await db.exec(create.replace(oldStatusCheck, newStatusCheck));
  await db.exec(`INSERT INTO ${qi(temp)} (${names}) SELECT ${names} FROM auto_migration`);
  await db.exec('DROP TABLE auto_migration');
  // Existing views continue to refer to the final, original table name.
  await db.exec('PRAGMA legacy_alter_table=ON');
  await db.exec(`ALTER TABLE ${qi(temp)} RENAME TO auto_migration`);
  await db.exec('PRAGMA legacy_alter_table=OFF');
  await db.exec(
    `UPDATE sqlite_sequence SET seq = MAX(seq, COALESCE((SELECT seq FROM __core_upgrade_sequence), seq)) WHERE name='auto_migration'`
  );
  await db.exec('DROP TABLE temp.__core_upgrade_sequence');
  for (const object of objects) await db.exec(object.sql);
}

async function upgradeDatabase(filename, definition, target, dryRun = false) {
  const exists = fs.existsSync(filename);
  let db;
  let backup;
  let temporary;
  try {
    // A dry run never opens a database for writing or creates a missing directory.
    if (!exists && dryRun) return { operations: ['create database'], changed: false };
    if (!exists) {
      fs.mkdirSync(path.dirname(filename), { recursive: true });
      temporary = `${filename}.${crypto.randomUUID()}.tmp`;
    }
    db = await open({
      filename: temporary || filename,
      driver: sqlite3.Database,
      mode: dryRun
        ? sqlite3.OPEN_READONLY
        : exists
          ? sqlite3.OPEN_READWRITE
          : sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE
    });
    await db.exec('PRAGMA busy_timeout=5000');
    const actual = await describeDatabase(db);
    const operations = upgradePlan(definition, target, actual);
    const comparable = JSON.parse(JSON.stringify(actual));
    if (operations.some((operation) => operation.rebuildMigration)) {
      comparable.tables.auto_migration.sql = comparable.tables.auto_migration.sql.replace(
        oldStatusCheck,
        newStatusCheck
      );
    }
    const problems = compatibilityProblems(target.schema, comparable, true);
    if (problems.length) throw new Error(problems.join('; '));
    if (!operations.length) {
      const remaining = compatibilityProblems(target.schema, actual);
      if (remaining.length) throw new Error(remaining.join('; '));
      return { operations: [], changed: false };
    }
    if (dryRun) return { operations: operations.map((op) => op.description), changed: false };
    if (exists) {
      backup = `${filename}.backup-${new Date().toISOString().replace(/[:.]/g, '-')}-${crypto.randomUUID()}`;
      await db.exec(`VACUUM INTO ${qs(backup)}`);
      fs.chmodSync(backup, fs.statSync(filename).mode & 0o777);
    }
    await db.exec('PRAGMA foreign_keys=OFF');
    await db.exec('BEGIN IMMEDIATE');
    try {
      // Re-plan under the write lock so a concurrent run cannot add columns twice.
      const locked = await describeDatabase(db);
      for (const operation of upgradePlan(definition, target, locked)) {
        if (operation.rebuildMigration) await rebuildMigration(db);
        else await db.exec(operation.sql);
      }
      const remaining = compatibilityProblems(target.schema, await describeDatabase(db));
      if (remaining.length) throw new Error(remaining.join('; '));
      if ((await db.all('PRAGMA foreign_key_check')).length)
        throw new Error('foreign_key_check failed');
      const integrity = await db.all('PRAGMA quick_check');
      if (integrity.some((row) => Object.values(row)[0] !== 'ok'))
        throw new Error('quick_check failed');
      await db.exec('COMMIT');
    } catch (error) {
      await db.exec('ROLLBACK');
      throw error;
    }
    await db.close();
    db = null;
    if (temporary) {
      // link fails if another process created the destination; never overwrite it.
      fs.linkSync(temporary, filename);
      fs.unlinkSync(temporary);
      temporary = null;
    }
    return { operations: operations.map((op) => op.description), changed: true, backup };
  } catch (error) {
    throw new Error(`${error.message}${backup ? `; backup: ${backup}` : ''}`);
  } finally {
    if (db) await db.close();
    if (temporary) fs.rmSync(temporary, { force: true });
  }
}

async function main(argv = process.argv.slice(2)) {
  const args = argumentsFor(argv);
  if (!args) return;
  const definitions = loadModuleConfig(args.config)
    .core.map(moduleDefinition)
    .filter((d) => d.sqlFiles.length);
  const names = definitions.map((d) => d.dbname);
  if (new Set(names).size !== names.length)
    throw new Error('Multiple core modules use the same database');
  // Build every target before making changes, catching invalid definitions early.
  const targets = [];
  for (const definition of definitions) targets.push(await targetSchema(definition));
  console.log(
    `${args.dryRun ? 'Dry run' : 'Upgrade'}: ${definitions.length} active core module databases in ${args.dataDir}`
  );
  let failures = 0;
  for (let i = 0; i < definitions.length; i++) {
    const definition = definitions[i];
    try {
      const result = await upgradeDatabase(
        path.join(args.dataDir, `${definition.dbname}.sq3`),
        definition,
        targets[i],
        args.dryRun
      );
      console.log(
        `${definition.dbname}: ${result.operations.length ? (result.changed ? 'upgraded' : 'would upgrade') : 'up to date'}`
      );
      for (const operation of result.operations) console.log(`  - ${operation}`);
      if (result.backup) console.log(`  backup: ${result.backup}`);
    } catch (error) {
      failures++;
      console.error(`${definition.dbname}: FAILED: ${error.message}`);
    }
  }
  if (failures) process.exitCode = 1;
}

module.exports = { main, targetSchema, upgradeDatabase, compatibilityProblems };
if (require.main === module)
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 2;
  });
