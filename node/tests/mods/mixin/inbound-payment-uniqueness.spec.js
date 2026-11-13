const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');

const Database = require('../../../mods/mixin/lib/database');
const Transfers = require('../../../mods/mixin/lib/transfers');
const { SYNTHETIC_INBOUND_TX_HASH } = Database;

async function openDatabase() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  const sql = fs.readFileSync(
    path.join(__dirname, '../../../mods/mixin/sql/transfers.sql'),
    'utf8'
  );
  await db.exec(sql);
  return db;
}

function databaseFor(db) {
  return new Database(
    {
      storage: {
        queryDatabase: (sql, params) => db.all(sql, params),
        runDatabase: (sql, params) => db.run(sql, params)
      }
    },
    { slug: 'mixin' }
  );
}

async function insertTransfer(db, fields) {
  const result = await db.run(
    `INSERT INTO transfers (
       purpose, status, mode, inbound_tx_hash, inbound_address, created_at, updated_at
     ) VALUES ($purpose, $status, 'automatic', $hash, $address, $now, $now)`,
    {
      $purpose: fields.purpose,
      $status: fields.status || 'inbound_awaiting',
      $hash: fields.inbound_tx_hash || '',
      $address: fields.inbound_address || '',
      $now: Date.now()
    }
  );
  return result.lastID;
}

function transfersFor(database) {
  const credited = [];
  const mod = {
    database,
    creditDepositAddress: jest.fn((address, amount, hash) => {
      credited.push({ address, amount, hash });
    })
  };
  const app = {
    network: { sendRequestAsTransaction: jest.fn() },
    connection: { emit: jest.fn() }
  };
  return { transfers: new Transfers(app, mod), credited, app };
}

describe('unique Mixin inbound payment ownership', () => {
  test('the schema excludes only the exact admin-test sentinel', () => {
    const sql = fs.readFileSync(
      path.join(__dirname, '../../../mods/mixin/sql/transfers.sql'),
      'utf8'
    );
    expect(sql).toContain('transfers_inbound_tx_hash_uidx');
    expect(sql).toContain(`inbound_tx_hash <> '${SYNTHETIC_INBOUND_TX_HASH}'`);
    expect(SYNTHETIC_INBOUND_TX_HASH).toBe('admin-test');
  });

  test('two store transfers cannot claim the same inbound hash', async () => {
    const db = await openDatabase();
    const database = databaseFor(db);
    const first = await insertTransfer(db, { purpose: 'store-purchase' });
    const second = await insertTransfer(db, { purpose: 'store-purchase' });
    const { transfers, credited } = transfersFor(database);

    const owned = await transfers.recordStorePurchaseInboundPayment(
      { id: first, purpose: 'store-purchase', inbound_address: 'Taddress' },
      { hash: 'mix-hash', id: 'snap-1', sender: 'Tsender', amount: 2 }
    );
    const rejected = await transfers.recordStorePurchaseInboundPayment(
      { id: second, purpose: 'store-purchase', inbound_address: 'Taddress' },
      { hash: 'mix-hash', id: 'snap-1', sender: 'Tsender', amount: 2 }
    );

    expect(owned.status).toBe('inbound_confirmed');
    expect(owned.inbound_tx_hash).toBe('mix-hash');
    expect(rejected.status).toBe('inbound_awaiting');
    expect(rejected.inbound_tx_hash).toBe('');
    expect(rejected.last_error).toContain('already claimed by transfer');
    expect(credited).toHaveLength(1);
  });

  test('a store transfer and a migration transfer cannot claim the same hash', async () => {
    const db = await openDatabase();
    const database = databaseFor(db);
    const storeId = await insertTransfer(db, { purpose: 'store-purchase' });
    const migrationId = await insertTransfer(db, { purpose: 'migration' });
    await database.claimInboundPayment(storeId, {
      status: 'inbound_confirmed',
      inbound_tx_hash: 'shared-hash'
    });
    const result = await database.claimInboundPayment(migrationId, {
      status: 'inbound_confirmed',
      inbound_tx_hash: 'shared-hash'
    });
    const migration = await db.get('SELECT status, inbound_tx_hash FROM transfers WHERE id = ?', migrationId);

    expect(result.ok).toBe(false);
    expect(result.conflict).toMatchObject({ id: storeId, purpose: 'store-purchase' });
    expect(migration.inbound_tx_hash).toBe('');
    expect(migration.status).toBe('inbound_awaiting');
  });

  test('concurrent claims leave the hash on exactly one transfer', async () => {
    const db = await openDatabase();
    const database = databaseFor(db);
    const first = await insertTransfer(db, { purpose: 'buysaito' });
    const second = await insertTransfer(db, { purpose: 'store-purchase' });
    const results = await Promise.all([
      database.claimInboundPayment(first, {
        status: 'inbound_confirmed',
        inbound_tx_hash: 'race-hash'
      }),
      database.claimInboundPayment(second, {
        status: 'inbound_confirmed',
        inbound_tx_hash: 'race-hash'
      })
    ]);
    const rows = await db.all(
      `SELECT id, inbound_tx_hash, status FROM transfers WHERE inbound_tx_hash = 'race-hash'`
    );

    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.filter((result) => !result.ok)).toHaveLength(1);
    expect(rows).toHaveLength(1);
  });

  test('recording the same payment again for its owner is safe', async () => {
    const db = await openDatabase();
    const database = databaseFor(db);
    const id = await insertTransfer(db, { purpose: 'store-purchase', inbound_address: 'Taddress' });
    const { transfers, credited } = transfersFor(database);
    const row = { id, purpose: 'store-purchase', inbound_address: 'Taddress', status: 'inbound_awaiting' };
    const first = await transfers.recordStorePurchaseInboundPayment(row, {
      hash: 'mix-hash',
      id: 'snap-1',
      sender: 'Tsender',
      amount: 2
    });
    const second = await transfers.recordStorePurchaseInboundPayment(first, {
      hash: 'mix-hash',
      id: 'snap-1',
      sender: 'Tsender',
      amount: 2
    });

    expect(second.id).toBe(first.id);
    expect(second.inbound_tx_hash).toBe('mix-hash');
    expect(credited).toHaveLength(1);
    expect(
      await db.get(`SELECT COUNT(*) AS total FROM transfers WHERE inbound_tx_hash = 'mix-hash'`)
    ).toEqual({ total: 1 });
  });

  test('empty hashes and the admin-test sentinel can be shared, and a lookalike hash cannot', async () => {
    const db = await openDatabase();
    await insertTransfer(db, { purpose: 'store-purchase', inbound_tx_hash: '' });
    await insertTransfer(db, { purpose: 'buysaito', inbound_tx_hash: '' });
    await insertTransfer(db, { purpose: 'store-purchase', inbound_tx_hash: 'admin-test' });
    await insertTransfer(db, { purpose: 'buysaito', inbound_tx_hash: 'admin-test' });
    await insertTransfer(db, { purpose: 'store-purchase', inbound_tx_hash: 'admin-test-1' });
    await expect(
      insertTransfer(db, { purpose: 'migration', inbound_tx_hash: 'admin-test-1' })
    ).rejects.toThrow(/UNIQUE/);
    const waiting = await db.get(
      `SELECT COUNT(*) AS total FROM transfers WHERE inbound_tx_hash = ''`
    );
    const synthetic = await db.get(
      `SELECT COUNT(*) AS total FROM transfers WHERE inbound_tx_hash = 'admin-test'`
    );
    expect(waiting.total).toBe(2);
    expect(synthetic.total).toBe(2);
  });

  test('existing duplicate hashes are reported and left in place', async () => {
    const db = await openDatabase();
    const database = databaseFor(db);
    await db.exec('DROP INDEX IF EXISTS transfers_inbound_tx_hash_uidx');
    await insertTransfer(db, { purpose: 'store-purchase', inbound_tx_hash: 'old-hash' });
    await insertTransfer(db, { purpose: 'buysaito', inbound_tx_hash: 'old-hash' });
    await insertTransfer(db, { purpose: 'store-purchase', inbound_tx_hash: 'admin-test' });
    await insertTransfer(db, { purpose: 'migration', inbound_tx_hash: 'admin-test' });
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});

    const result = await database.ensureInboundPaymentUniqueness();
    const rows = await db.all(
      `SELECT id, purpose, inbound_tx_hash FROM transfers WHERE inbound_tx_hash = 'old-hash' ORDER BY id`
    );
    const index = await db.get(
      `SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'transfers_inbound_tx_hash_uidx'`
    );

    expect(result.enforced).toBe(false);
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.purpose)).toEqual(['store-purchase', 'buysaito']);
    expect(index).toBeUndefined();
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining('uniqueness index was not created'),
      expect.objectContaining({
        inbound_tx_hash: 'old-hash',
        transfers: [
          { id: rows[0].id, purpose: 'store-purchase' },
          { id: rows[1].id, purpose: 'buysaito' }
        ]
      })
    );
    error.mockRestore();
  });
});
