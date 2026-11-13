const sqlite3 = require('sqlite3');
const Database = require('../../../mods/store/lib/database');
const { OrderUpdateError } = require('../../../mods/store/lib/database');
const Warehouse = require('../../../mods/store/lib/warehouse');

jest.mock('../../../mods/store/lib/archive', () => ({
  loadTransactionFromArchive: jest.fn(async () => ({ signature: 'listing-tx' }))
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

function appFor(sqlite, blockchain = null) {
  return {
    BROWSER: 0,
    storage: {
      returnDatabaseByName: async () => sqlite,
      queryDatabase: (sql, params) => sqlite.all(sql, params)
    },
    blockchain,
    network: { propagateTransaction: jest.fn(async () => null) }
  };
}

async function createOrders(sqlite) {
  await sqlite.exec(`
    CREATE TABLE orders (
      id INTEGER PRIMARY KEY,
      status TEXT NOT NULL DEFAULT 'pending',
      settlement_tx_sig TEXT NOT NULL DEFAULT '',
      settlement_tx TEXT NOT NULL DEFAULT '',
      block_id_fulfilled INTEGER NOT NULL DEFAULT 0,
      block_hash_fulfilled TEXT NOT NULL DEFAULT '',
      transaction_id_fulfilled INTEGER NOT NULL DEFAULT 0,
      longest_chain_fulfilled INTEGER NOT NULL DEFAULT 0,
      longest_chain_received INTEGER NOT NULL DEFAULT 1,
      buyer TEXT NOT NULL DEFAULT '',
      nft_id TEXT NOT NULL DEFAULT '',
      price INTEGER NOT NULL DEFAULT 0,
      order_tx_sig TEXT NOT NULL DEFAULT '',
      updated_at INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE listing_sales (
      id INTEGER PRIMARY KEY,
      signature TEXT NOT NULL
    );
  `);
}

describe('order update failures', () => {
  test('updateOrder reports a driver failure and a missing row separately', async () => {
    const sqlite = openMemory();
    await createOrders(sqlite);
    const db = new Database(appFor(sqlite), { dbname: 'store' });
    await sqlite.run(`INSERT INTO orders (id, status) VALUES (7, 'settling')`);

    const saved = await db.updateOrder(7, { status: 'fulfilled' });
    expect(saved).toEqual({ changes: 1 });

    await expect(db.updateOrder(99, { status: 'fulfilled' })).rejects.toMatchObject({
      name: 'OrderUpdateError',
      kind: 'row_count',
      orderId: 99,
      changes: 0
    });

    const driver = openMemory();
    await createOrders(driver);
    const failing = new Database(appFor(driver), { dbname: 'store' });
    driver.run = async () => {
      throw new Error('SQLITE_BUSY: disk I/O error');
    };
    await expect(failing.updateOrder(7, { status: 'fulfilled' })).rejects.toMatchObject({
      kind: 'driver',
      orderId: 7,
      cause: expect.objectContaining({ message: 'SQLITE_BUSY: disk I/O error' })
    });
    expect(OrderUpdateError).toBeDefined();
    sqlite.close();
    driver.close();
  });

  test('a failed order update leaves the completed sale and does not mark the order fulfilled', async () => {
    const sqlite = openMemory();
    await createOrders(sqlite);
    const app = appFor(sqlite);
    const mod = { dbname: 'store', image_cache: {}, fulfillment_reconcile_blocks: 8 };
    const warehouse = new Warehouse(app, mod);
    await sqlite.run(
      `INSERT INTO orders (id, status, settlement_tx_sig, order_tx_sig) VALUES (3, 'settling', 'settle-sig', 'purchase-sig')`
    );
    await sqlite.run(`INSERT INTO listing_sales (signature) VALUES ('kept-sale')`);
    const raw = sqlite.run.bind(sqlite);
    sqlite.run = (sql, params) => {
      if (String(sql).includes('UPDATE orders')) {
        return Promise.reject(new Error('SQLITE_BUSY: disk I/O error'));
      }
      return raw(sql, params);
    };
    warehouse.recordFulfillmentSpends = async () => {};
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});

    await warehouse.confirmSettlement(
      { id: 40, hash: 'block-sold', transactions: [{ signature: 'settle-sig' }] },
      {
        signature: 'settle-sig',
        returnMessage: () => ({ fulfill_sale: { sale_signature: 'purchase-sig' } })
      }
    );

    const sales = await sqlite.all(`SELECT signature FROM listing_sales`);
    const orders = await sqlite.all(`SELECT status, block_id_fulfilled FROM orders WHERE id = 3`);
    expect(sales).toEqual([{ signature: 'kept-sale' }]);
    expect(orders[0]).toEqual({ status: 'settling', block_id_fulfilled: 0 });
    expect(error).toHaveBeenCalledWith(
      'Store: order fulfillment update failed',
      expect.objectContaining({ order_id: 3, settlement_tx_sig: 'settle-sig', block_hash: 'block-sold' })
    );
    error.mockRestore();
    sqlite.close();
  });

  test('reconciliation records the original settlement without creating another', async () => {
    const sqlite = openMemory();
    await createOrders(sqlite);
    const settlement = {
      signature: 'settle-sig',
      returnMessage: () => ({ fulfill_sale: { sale_signature: 'purchase-sig', buyer: 'buyer' } })
    };
    const block = { id: 40, hash: 'block-sold', transactions: [settlement] };
    const app = appFor(sqlite, {
      getLatestBlockId: async () => 40,
      getLongestChainHashAtId: async (id) => (id === 40 ? 'block-sold' : ''),
      getBlock: async (hash) => (hash === 'block-sold' ? block : null)
    });
    const mod = {
      dbname: 'store',
      image_cache: {},
      fulfillment_reconcile_blocks: 8,
      createFulfillmentTransaction: jest.fn()
    };
    const warehouse = new Warehouse(app, mod);
    warehouse.recordFulfillmentSpends = async () => {};
    await sqlite.run(
      `INSERT INTO orders (id, status, settlement_tx_sig, settlement_tx, order_tx_sig, longest_chain_received)
       VALUES (3, 'settling', 'settle-sig', 'saved-bytes', 'purchase-sig', 1)`
    );

    await warehouse.reconcileUnrecordedFulfillments();

    const row = (await sqlite.all(`SELECT status, block_hash_fulfilled, settlement_tx_sig, settlement_tx FROM orders`))[0];
    expect(row).toEqual({
      status: 'fulfilled',
      block_hash_fulfilled: 'block-sold',
      settlement_tx_sig: 'settle-sig',
      settlement_tx: 'saved-bytes'
    });
    expect(mod.createFulfillmentTransaction).not.toHaveBeenCalled();
    expect(app.network.propagateTransaction).not.toHaveBeenCalled();
    sqlite.close();
  });

  test('one orphaned fulfillment failure does not stop the next order', async () => {
    const sqlite = openMemory();
    await createOrders(sqlite);
    const app = appFor(sqlite);
    const warehouse = new Warehouse(app, { dbname: 'store', image_cache: {} });
    await sqlite.run(
      `INSERT INTO orders (id, status, block_id_fulfilled, longest_chain_fulfilled, longest_chain_received, settlement_tx_sig)
       VALUES (1, 'fulfilled', 9, 0, 1, 'old-1'), (2, 'fulfilled', 9, 0, 1, 'old-2')`
    );
    const original = warehouse.db.updateOrder.bind(warehouse.db);
    warehouse.db.updateOrder = async (id, fields) => {
      if (id === 1) {
        throw new OrderUpdateError('Order 1 update failed', { orderId: 1, kind: 'driver' });
      }
      return original(id, fields);
    };
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'log').mockImplementation(() => {});

    await warehouse.resetOrphanedFulfillments();

    const rows = await sqlite.all(`SELECT id, status FROM orders ORDER BY id`);
    expect(rows).toEqual([
      { id: 1, status: 'fulfilled' },
      { id: 2, status: 'pending' }
    ]);
    console.error.mockRestore();
    console.log.mockRestore();
    sqlite.close();
  });

  test('a settlement is not propagated when its order update fails', async () => {
    const sqlite = openMemory();
    await createOrders(sqlite);
    const app = appFor(sqlite);
    const mod = {
      dbname: 'store',
      image_cache: {},
      createFulfillmentTransaction: async () => ({
        signature: 'settle-new',
        serialize_to_web: () => 'settle-bytes'
      })
    };
    const warehouse = new Warehouse(app, mod);
    warehouse.db.markListingSettlementPending = async () => {};
    warehouse.syncSummaryForBucket = async () => {};
    warehouse.db.updateOrder = async () => {
      throw new OrderUpdateError('Order 4 update failed', { orderId: 4, kind: 'driver' });
    };
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});

    const propagated = await warehouse.fulfillOrder(
      { id: 4, nft_id: 'nft', price: 1 },
      [{ signature: 'listing', block_hash_listed: 'listed' }]
    );

    expect(propagated).toBe(false);
    expect(app.network.propagateTransaction).not.toHaveBeenCalled();
    console.error.mockRestore();
    console.log.mockRestore();
    console.warn.mockRestore();
    sqlite.close();
  });
});
