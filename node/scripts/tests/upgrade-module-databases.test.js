'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const { loadModuleConfig, moduleDefinition, describeDatabase } = require('../module-databases');
const {
  targetSchema,
  upgradeDatabase,
  compatibilityProblems
} = require('../upgrade-module-databases');
const root = path.resolve(__dirname, '../..');
const connect = (filename) => open({ filename, driver: sqlite3.Database });

function temporary(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'saito-sql-upgrade-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function stagingSql(file) {
  return execFileSync('git', ['show', `staging:node/${file}`], { cwd: root, encoding: 'utf8' });
}

test('upgrade every active core staging schema and rerun without changes', async (t) => {
  const dir = temporary(t);
  const definitions = loadModuleConfig(path.join(root, 'config/modules.config.js'))
    .core.map(moduleDefinition)
    .filter((d) => d.sqlFiles.length);
  const files = execFileSync('git', ['ls-tree', '-r', '--name-only', 'staging'], {
    cwd: root,
    encoding: 'utf8'
  })
    .trim()
    .split('\n');
  for (const definition of definitions) {
    const filename = path.join(dir, `${definition.dbname}.sq3`);
    const sqlFiles = files
      .filter(
        (file) =>
          file.startsWith(`mods/${definition.entry.split('/')[0]}/sql/`) && file.endsWith('.sql')
      )
      .sort();
    if (sqlFiles.length) {
      const db = await connect(filename);
      try {
        for (const file of sqlFiles) await db.exec(stagingSql(file));
      } finally {
        await db.close();
      }
    }
    const target = await targetSchema(definition);
    const before = fs.existsSync(filename) ? fs.readFileSync(filename) : null;
    await upgradeDatabase(filename, definition, target, true);
    if (before) assert.deepEqual(fs.readFileSync(filename), before);
    else assert.equal(fs.existsSync(filename), false);
    await upgradeDatabase(filename, definition, target);
    const db = await connect(filename);
    try {
      assert.deepEqual(
        compatibilityProblems(target.schema, await describeDatabase(db)),
        [],
        definition.dbname
      );
    } finally {
      await db.close();
    }
    const upgraded = fs.readFileSync(filename);
    const second = await upgradeDatabase(filename, definition, target);
    assert.deepEqual(second.operations, [], definition.dbname);
    assert.equal(second.backup, undefined);
    assert.deepEqual(fs.readFileSync(filename), upgraded);
  }
  assert.equal(definitions.length, 18);
  assert.equal(fs.existsSync(path.join(dir, 'warehouse.sq3')), false);
});

test('Migration CHECK rebuild preserves rows, extras, indexes, triggers, views, FKs and sequence', async (t) => {
  const dir = temporary(t);
  const filename = path.join(dir, 'migration.sq3');
  const definition = moduleDefinition('migration/migration.js');
  const target = await targetSchema(definition);
  let db = await connect(filename);
  await db.exec(stagingSql('mods/migration/sql/migration2.sql'));
  await db.exec(`ALTER TABLE auto_migration ADD COLUMN operator_note TEXT DEFAULT 'Keep Me';
    CREATE INDEX operator_note_idx ON auto_migration(operator_note);
    CREATE TABLE audit (migration_id INTEGER REFERENCES auto_migration(id));
    CREATE TRIGGER migration_audit AFTER INSERT ON auto_migration BEGIN INSERT INTO audit VALUES (new.id); END;
    CREATE VIEW pending_migrations AS SELECT * FROM auto_migration WHERE status='pending';
    INSERT INTO auto_migration (id, public_key, nolan_received, email) VALUES (7, 'alice', 9007199254740993, 'Alice@Example.com');
    INSERT INTO auto_migration (id) VALUES (1000);
    DELETE FROM audit WHERE migration_id=1000;
    DELETE FROM auto_migration WHERE id=1000;`);
  await db.close();
  const result = await upgradeDatabase(filename, definition, target);
  assert.ok(result.backup && fs.existsSync(result.backup));
  db = await connect(filename);
  try {
    const row = await db.get(
      'SELECT *, CAST(nolan_received AS TEXT) AS precise FROM auto_migration WHERE id=7'
    );
    assert.equal(row.precise, '9007199254740993');
    assert.equal(row.email, 'Alice@Example.com');
    assert.equal(row.operator_note, 'Keep Me');
    assert.equal(row.issuance_tx, '');
    assert.equal((await db.get('SELECT COUNT(*) AS n FROM pending_migrations')).n, 1);
    await db.exec("INSERT INTO auto_migration (status) VALUES ('awaiting_mixin')");
    assert.equal((await db.get('SELECT MAX(id) AS id FROM auto_migration')).id, 1001);
    assert.equal((await db.get('SELECT COUNT(*) AS n FROM audit')).n, 2);
    assert.ok(await db.get("SELECT 1 FROM sqlite_master WHERE name='operator_note_idx'"));
    assert.deepEqual(await db.all('PRAGMA foreign_key_check'), []);
    await assert.rejects(
      db.exec("INSERT INTO auto_migration (status) VALUES ('invalid')"),
      /CHECK/
    );
  } finally {
    await db.close();
  }
  assert.deepEqual((await upgradeDatabase(filename, definition, target)).operations, []);
});

test('append missing BuySaito columns despite arbitrary existing order and preserve values', async (t) => {
  const filename = path.join(temporary(t), 'buysaito.sq3');
  const definition = moduleDefinition('buysaito/buysaito.js');
  const target = await targetSchema(definition);
  let db = await connect(filename);
  await db.exec(stagingSql('mods/buysaito/sql/purchases.sql'));
  await db.exec(
    "ALTER TABLE purchases ADD COLUMN issuance_at INTEGER DEFAULT 0; INSERT INTO purchases (status, paid, issuance_at) VALUES ('confirmed', 'signed-tx', 123)"
  );
  await db.close();
  await upgradeDatabase(filename, definition, target);
  db = await connect(filename);
  try {
    const row = await db.get('SELECT * FROM purchases');
    assert.equal(row.issuance_at, 123);
    assert.equal(row.paid, 'signed-tx');
    assert.equal(row.issuance_tx, '');
    assert.equal(row.issuance_block_id, 0);
  } finally {
    await db.close();
  }
  assert.deepEqual((await upgradeDatabase(filename, definition, target)).operations, []);
});

test('failed unique index creation rolls back the entire database upgrade', async (t) => {
  const filename = path.join(temporary(t), 'explorer.sq3');
  const definition = moduleDefinition('explorer/explorer.js');
  const target = await targetSchema(definition);
  let db = await connect(filename);
  const create = target.artifacts.tables.blocks.sql.replace(
    /,\s*calculated_total_supply TEXT,\s*utxo_graveyard_treasury_total TEXT/,
    ''
  );
  await db.exec(create);
  await db.exec(
    "INSERT INTO blocks (block_id, block_hash) VALUES (1, 'duplicate'), (1, 'duplicate')"
  );
  const before = await describeDatabase(db);
  await db.close();
  await assert.rejects(upgradeDatabase(filename, definition, target), /UNIQUE constraint failed/);
  db = await connect(filename);
  try {
    assert.deepEqual(await describeDatabase(db), before);
    assert.equal((await db.get('SELECT COUNT(*) AS n FROM blocks')).n, 2);
  } finally {
    await db.close();
  }
});

test('Store preserves legacy crypto and chain field values when appending replacement columns', async (t) => {
  const filename = path.join(temporary(t), 'store.sq3');
  const definition = moduleDefinition('store/store.js');
  const target = await targetSchema(definition);
  let db = await connect(filename);
  await db.exec(target.artifacts.tables.orders.sql);
  for (const field of ['utxo_slip', 'access_hash', 'access_script', 'p2sh_address']) {
    await db.exec(`ALTER TABLE orders RENAME COLUMN ${field} TO payment_${field}`);
  }
  for (const [to, from] of Object.entries({
    block_id_received: 'block_id_added',
    block_hash_received: 'block_hash_added',
    transaction_id_received: 'transaction_id_added',
    longest_chain_received: 'longest_chain_added',
    block_id_fulfilled: 'block_id_confirmed',
    block_hash_fulfilled: 'block_hash_confirmed',
    transaction_id_fulfilled: 'transaction_id_confirmed',
    longest_chain_fulfilled: 'longest_chain_confirmed'
  })) {
    await db.exec(`ALTER TABLE orders RENAME COLUMN ${to} TO ${from}`);
  }
  await db.exec(
    `INSERT INTO orders (order_tx_sig, nft_id, payment_tx_sig, payment_utxo_slip, payment_access_hash, payment_access_script, payment_p2sh_address, block_id_added, block_id_confirmed) VALUES ('order', 'nft', 'payment', 'slip', 'hash', 'script', 'address', 10, 20)`
  );
  await db.exec(target.artifacts.tables.listings.sql);
  for (const name of [
    'block_id_sold',
    'block_hash_sold',
    'transaction_id_sold',
    'longest_chain_sold'
  ]) {
    await db.exec(`ALTER TABLE listings DROP COLUMN ${name}`);
  }
  for (const [to, from] of Object.entries({
    block_id_listed: 'block_id',
    block_hash_listed: 'block_hash',
    transaction_id_listed: 'transaction_id',
    longest_chain_listed: 'longest_chain'
  })) {
    await db.exec(`ALTER TABLE listings RENAME COLUMN ${to} TO ${from}`);
  }
  await db.exec(`ALTER TABLE listings ADD COLUMN spent INTEGER DEFAULT 0;
    INSERT INTO listings (signature, nft_id, block_id, block_hash, transaction_id, spent) VALUES ('listing', 'nft', 30, 'block-hash', 3, 1)`);
  await db.close();
  await upgradeDatabase(filename, definition, target);
  db = await connect(filename);
  try {
    const row = await db.get('SELECT * FROM orders');
    assert.equal(row.utxo_slip, 'slip');
    assert.equal(row.access_hash, 'hash');
    assert.equal(row.access_script, 'script');
    assert.equal(row.p2sh_address, 'address');
    assert.equal(row.block_id_received, 10);
    assert.equal(row.block_id_fulfilled, 20);
    const listing = await db.get('SELECT * FROM listings');
    assert.equal(listing.block_id_listed, 30);
    assert.equal(listing.block_id_sold, 30);
    assert.equal(listing.longest_chain_sold, 1);
    assert.equal(listing.block_hash_sold, 'block-hash');
    assert.equal(listing.in_flight, 0);
  } finally {
    await db.close();
  }
  assert.deepEqual((await upgradeDatabase(filename, definition, target)).operations, []);
});

test('CLI respects core selection and dry-run creates no directories', (t) => {
  const dir = temporary(t);
  const config = path.join(dir, 'modules.config.js');
  const data = path.join(dir, 'data');
  fs.writeFileSync(
    config,
    `export default { core: ['buysaito/buysaito.js', /* 'store/store.js' */], lite: ['explorer/explorer.js'] };`
  );
  const run = (...args) =>
    execFileSync(
      process.execPath,
      ['scripts/upgrade-module-databases.js', '--config', config, '--data-dir', data, ...args],
      { cwd: root, encoding: 'utf8' }
    );
  assert.match(run('--dry-run'), /buysaito: would upgrade/);
  assert.equal(fs.existsSync(data), false);
  assert.match(run(), /buysaito: upgraded/);
  assert.deepEqual(fs.readdirSync(data), ['buysaito.sq3']);
  assert.match(run(), /buysaito: up to date/);
});

test('dry-run rejects unknown CHECK changes without modifying data', async (t) => {
  const filename = path.join(temporary(t), 'migration.sq3');
  const definition = moduleDefinition('migration/migration.js');
  const target = await targetSchema(definition);
  const db = await connect(filename);
  await db.exec(
    stagingSql('mods/migration/sql/migration2.sql').replace("'failed'", "'custom_status'")
  );
  await db.close();
  const before = fs.readFileSync(filename);
  await assert.rejects(upgradeDatabase(filename, definition, target, true), /incompatible CHECK/);
  assert.deepEqual(fs.readFileSync(filename), before);
});
