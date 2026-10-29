const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3');
const Database = require('../../../mods/store/lib/database');
const Refunds = require('../../../mods/store/lib/refunds');

jest.mock('../../../lib/saito/transaction', () => ({
  default: class Transaction {
    deserialize_from_web(app, data) {
      this.serialized = data;
      this.signature = JSON.parse(data).signature;
    }
  }
}));

function openMemory() {
  const sqlite = new sqlite3.Database(':memory:');
  const run = (sql, params = {}) =>
    new Promise((resolve, reject) => {
      sqlite.run(sql, params, function onRun(err) {
        if (err) {
          reject(err);
          return;
        }
        resolve({ changes: this.changes, lastID: this.lastID });
      });
    });
  const exec = (sql) =>
    new Promise((resolve, reject) => {
      sqlite.exec(sql, (err) => (err ? reject(err) : resolve()));
    });
  const all = (sql, params = {}) =>
    new Promise((resolve, reject) => {
      sqlite.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows || [])));
    });
  return { run, exec, all, close: () => sqlite.close() };
}

function harness(sqlite, { retryMs = 60 * 60 * 1000, signer } = {}) {
  const propagated = [];
  let sequence = 0;
  const app = {
    BROWSER: 0,
    storage: {
      returnFileSystem: () => fs,
      returnDatabaseByName: async () => sqlite,
      queryDatabase: (sql, params) => sqlite.all(sql, params)
    },
    network: {
      propagateTransaction: jest.fn(async (tx) => {
        propagated.push(tx.serialized);
      })
    }
  };
  const mod = {
    app,
    dbname: 'store',
    refund_retry_ms: retryMs,
    warehouse: null,
    createOrderRefundTransaction: jest.fn(
      signer ||
        (async () => {
          sequence += 1;
          const signature = `refund-sig-${sequence}`;
          const serialized = JSON.stringify({ signature });
          return {
            signature,
            sign: async () => {},
            serialize_to_web: () => serialized
          };
        })
    )
  };
  const db = new Database(app, mod);
  mod.warehouse = { db };
  const refunds = new Refunds(mod);
  return { app, mod, db, refunds, propagated };
}

async function schema(sqlite) {
  await sqlite.exec(`
    CREATE TABLE orders (
      id INTEGER PRIMARY KEY,
      status TEXT NOT NULL DEFAULT 'pending',
      buyer TEXT NOT NULL DEFAULT '',
      order_tx_sig TEXT NOT NULL DEFAULT '',
      payment_tx_sig TEXT NOT NULL DEFAULT '',
      payment_output_index INTEGER NOT NULL DEFAULT 0,
      payment_amount INTEGER NOT NULL DEFAULT 0,
      block_hash_received TEXT NOT NULL DEFAULT '',
      block_id_received INTEGER NOT NULL DEFAULT 0,
      utxo_slip TEXT NOT NULL DEFAULT '',
      access_script TEXT NOT NULL DEFAULT '',
      updated_at INTEGER NOT NULL DEFAULT 0
    );
  `);
  const sql = fs.readFileSync(
    path.join(__dirname, '../../../mods/store/sql/order_refunds.sql'),
    'utf8'
  );
  for (const statement of sql.split(';').map((part) => part.trim()).filter(Boolean)) {
    await sqlite.exec(statement);
  }
}

function purchase(overrides = {}) {
  return {
    id: 0,
    buyer: 'buyer-key',
    order_tx_sig: 'purchase-sig',
    payment_tx_sig: 'purchase-sig',
    payment_output_index: 0,
    payment_amount: 5,
    block_hash_received: 'received-hash',
    block_id_received: 12,
    utxo_slip: '{"publicKey":"buyer-key"}',
    access_script: 'script',
    ...overrides
  };
}

describe('at-most-once refunds', () => {
  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    console.error.mockRestore();
    console.log.mockRestore();
  });

  test('a failed refund intent is not broadcast', async () => {
    const sqlite = openMemory();
    const { refunds, propagated, db } = harness(sqlite);
    db.claimRefundIntent = async () => {
      throw new Error('intent write failed');
    };

    const result = await refunds.issue(purchase());

    expect(result.reason).toBe('intent-not-saved');
    expect(propagated).toEqual([]);
    sqlite.close();
  });

  test('a saved refund is broadcast after a crash and a later failure keeps its signature', async () => {
    const sqlite = openMemory();
    await schema(sqlite);
    const { refunds, propagated, db, app } = harness(sqlite);
    const serialized = JSON.stringify({ signature: 'refund-sig-saved' });
    await sqlite.run(
      `INSERT INTO order_refunds (
         payment_tx_sig, payment_output_index, block_hash_received, refund_tx_sig, refund_tx,
         refund_status, created_at, refund_prepared_at
       ) VALUES ('purchase-sig', 0, 'received-hash', 'refund-sig-saved', $serialized, 'prepared', $now, $now)`,
      { $serialized: serialized, $now: Date.now() }
    );

    await refunds.resume();
    expect(propagated).toEqual([serialized]);
    expect(app.network.propagateTransaction).toHaveBeenCalledTimes(1);

    app.network.propagateTransaction.mockImplementation(async (tx) => {
      propagated.push(tx.serialized);
      throw new Error('peer timeout');
    });
    await refunds.resume();
    const row = await db.returnRefundByPayment('purchase-sig', 0, 'received-hash');
    expect(row.refund_tx_sig).toBe('refund-sig-saved');
    expect(row.refund_tx).toBe(serialized);
    expect(row.refund_status).toBe('uncertain');
    expect(propagated).toEqual([serialized, serialized]);
    sqlite.close();
  });

  test('repeated failOrder calls and early refunds reuse one signed transaction', async () => {
    const sqlite = openMemory();
    await schema(sqlite);
    const { refunds, db, mod, propagated } = harness(sqlite);
    await sqlite.run(
      `INSERT INTO orders (id, status, buyer, payment_tx_sig, block_hash_received) VALUES (4, 'pending', 'buyer-key', 'purchase-sig', 'received-hash')`
    );
    const order = purchase({ id: 4 });

    await refunds.issue(order, { refund_public_key: 'buyer-key', reason: 'unable-to-fulfill' });
    await refunds.issue(order, { refund_public_key: 'buyer-key', reason: 'unable-to-fulfill' });
    await refunds.issue(purchase({ id: 0 }), { reason: 'underpaid' });

    const rows = await sqlite.all(`SELECT refund_tx_sig, refund_tx, refund_status FROM order_refunds`);
    expect(rows).toHaveLength(1);
    expect(rows[0].refund_status).toBe('submitted');
    expect(propagated.every((item) => item === rows[0].refund_tx)).toBe(true);
    expect(JSON.parse(rows[0].refund_tx).signature).toBe(rows[0].refund_tx_sig);
    const stored = await db.returnRefundBySignature(rows[0].refund_tx_sig);
    expect(stored.refund_status).not.toBe('confirmed');
    expect(mod.createOrderRefundTransaction).toHaveBeenCalledTimes(1);
    sqlite.close();
  });

  test('concurrent workers and distinct outputs keep one transaction per payment output', async () => {
    const sqlite = openMemory();
    await schema(sqlite);
    let sequence = 0;
    const signer = async () => {
      sequence += 1;
      const signature = `race-${sequence}`;
      const serialized = JSON.stringify({ signature });
      await new Promise((resolve) => setTimeout(resolve, 20));
      return { signature, sign: async () => {}, serialize_to_web: () => serialized };
    };
    const { refunds, propagated } = harness(sqlite, { signer });

    await Promise.all([
      refunds.issue(purchase({ payment_output_index: 0 })),
      refunds.issue(purchase({ payment_output_index: 0 }))
    ]);
    await refunds.issue(purchase({ payment_output_index: 1, payment_tx_sig: 'purchase-sig' }));

    const rows = await sqlite.all(
      `SELECT payment_output_index, refund_tx_sig, refund_tx FROM order_refunds ORDER BY payment_output_index`
    );
    expect(rows).toHaveLength(2);
    expect(rows[0].payment_output_index).toBe(0);
    expect(rows[1].payment_output_index).toBe(1);
    expect(rows[0].refund_tx_sig).not.toBe(rows[1].refund_tx_sig);
    const first = rows[0].refund_tx;
    expect(propagated.filter((item) => item === first).length).toBeGreaterThan(0);
    expect(propagated.every((item) => item === first || item === rows[1].refund_tx)).toBe(true);
    sqlite.close();
  });

  test('confirmation, reorganization, expiry, and a blocked input do not sign a replacement', async () => {
    const sqlite = openMemory();
    await schema(sqlite);
    const { refunds, db, app, propagated } = harness(sqlite, { retryMs: 1000 });
    const order = purchase();
    await refunds.issue(order);
    const prepared = await db.returnRefundByPayment('purchase-sig', 0, 'received-hash');
    expect(prepared.refund_status).toBe('submitted');

    const tx = {
      signature: prepared.refund_tx_sig,
      returnMessage: () => ({ module: 'Store', request: 'order-refund' })
    };
    const blk = { id: 18, hash: 'refund-block', transactions: [tx] };
    await refunds.observeInclusion(blk, tx);
    const confirmed = await db.returnRefundBySignature(prepared.refund_tx_sig);
    expect(confirmed.refund_status).toBe('confirmed');
    expect(confirmed.block_id_refunded).toBe(18);
    expect(confirmed.block_hash_refunded).toBe('refund-block');
    expect(confirmed.transaction_id_refunded).toBe(0);
    expect(confirmed.longest_chain_refunded).toBe(1);

    await db.updateRefundChainState(18, 'refund-block', false);
    const reorged = await db.returnRefundBySignature(prepared.refund_tx_sig);
    expect(reorged.refund_status).toBe('uncertain');
    expect(reorged.refund_tx).toBe(prepared.refund_tx);
    await refunds.resume();
    expect(propagated.every((item) => item === prepared.refund_tx)).toBe(true);

    await sqlite.run(`UPDATE order_refunds SET created_at = 1, refund_status = 'uncertain'`);
    await refunds.resume();
    const expired = await db.returnRefundBySignature(prepared.refund_tx_sig);
    expect(expired.refund_status).toBe('needs_manual');
    expect(expired.refund_tx_sig).toBe(prepared.refund_tx_sig);
    const callsAfterExpiry = app.network.propagateTransaction.mock.calls.length;

    await refunds.resume();
    expect(app.network.propagateTransaction.mock.calls.length).toBe(callsAfterExpiry);

    const spentSqlite = openMemory();
    await schema(spentSqlite);
    const blocked = harness(spentSqlite, {
      signer: async () => {
        throw new Error('payment input spent by other-tx');
      }
    });
    await blocked.refunds.issue(purchase({ payment_tx_sig: 'other-payment', block_hash_received: 'other-block' }));
    const blockedRow = await blocked.db.returnRefundByPayment('other-payment', 0, 'other-block');
    expect(blockedRow.refund_status).toBe('needs_manual');
    expect(blockedRow.refund_tx_sig).toBe('');
    expect(blocked.propagated).toEqual([]);
    await blocked.refunds.issue(purchase({ payment_tx_sig: 'other-payment', block_hash_received: 'other-block' }));
    const still = await blocked.db.returnRefundByPayment('other-payment', 0, 'other-block');
    expect(still.refund_tx_sig).toBe('');
    sqlite.close();
    spentSqlite.close();
  });

  test('a status-write failure after broadcast does not create a second transaction', async () => {
    const sqlite = openMemory();
    await schema(sqlite);
    const { refunds, db, propagated } = harness(sqlite);
    const original = db.markRefundStatus.bind(db);
    let marks = 0;
    db.markRefundStatus = async (...args) => {
      marks += 1;
      if (marks === 1) {
        throw new Error('status write failed');
      }
      return original(...args);
    };

    await refunds.issue(purchase());
    const first = await db.returnRefundByPayment('purchase-sig', 0, 'received-hash');
    expect(first.refund_status).toBe('prepared');
    await refunds.issue(purchase());
    const second = await db.returnRefundByPayment('purchase-sig', 0, 'received-hash');
    expect(second.refund_tx_sig).toBe(first.refund_tx_sig);
    expect(second.refund_tx).toBe(first.refund_tx);
    expect(new Set(propagated)).toEqual(new Set([first.refund_tx]));
    sqlite.close();
  });
});
