const fs = require('fs');
const sqlite3 = require('sqlite3');
const SalesTableTemplate = require('../../../mods/store/lib/ui/sales-table.template');
const WithdrawalsTemplate = require('../../../mods/store/lib/ui/withdrawals.template');
const Database = require('../../../mods/store/lib/database');

const BUYER = 'sHs6UQb5TDN5WTJ4nnehSUo79uCMxZaCENrzPzGiV6pJ';
const SELLER = 'xM2vUs5XCpNjYjcgxk4yVhybDcayk3tnwZNWrFg7jRGs';
const OTHER = 'wAFsrNAXvXmk33ccQ8WJUqgoFnvVh5taEaMFKRbBYU1q';

function openMemory() {
  const sqlite = new sqlite3.Database(':memory:');
  const bind = (sql, params = {}) => {
    const bound = {};
    for (const key of Object.keys(params || {})) {
      if (sql.includes(key)) {
        bound[key] = params[key];
      }
    }
    return bound;
  };
  const run = (sql, params = {}) =>
    new Promise((resolve, reject) => {
      sqlite.run(sql, bind(sql, params), function onRun(err) {
        if (err) {
          reject(err);
          return;
        }
        resolve({ changes: this.changes });
      });
    });
  const exec = (sql) =>
    new Promise((resolve, reject) => {
      sqlite.exec(sql, (err) => (err ? reject(err) : resolve()));
    });
  const all = (sql, params = {}) =>
    new Promise((resolve, reject) => {
      sqlite.all(sql, bind(sql, params), (err, rows) => (err ? reject(err) : resolve(rows)));
    });
  return { run, exec, all, close: () => sqlite.close() };
}

function openUnfilteredMemory() {
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

function databaseFor(sqlite) {
  const app = {
    storage: {
      returnFileSystem: () => fs,
      returnDatabaseByName: async () => sqlite,
      queryDatabase: (sql, params) => sqlite.all(sql, params)
    }
  };
  const db = new Database(app, { dbname: 'store' });
  return db;
}

async function createListings(sqlite) {
  await sqlite.exec(`
    CREATE TABLE listings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      signature TEXT NOT NULL,
      block_hash_listed TEXT NOT NULL DEFAULT '',
      seller TEXT NOT NULL DEFAULT '',
      web3_ticker TEXT NOT NULL DEFAULT '',
      web3_amount TEXT NOT NULL DEFAULT '',
      block_id_sold INTEGER NOT NULL DEFAULT 0,
      block_hash_sold TEXT NOT NULL DEFAULT '',
      transaction_id_sold INTEGER NOT NULL DEFAULT 0,
      longest_chain_sold INTEGER NOT NULL DEFAULT 0,
      buyer TEXT NOT NULL DEFAULT '',
      note TEXT NOT NULL DEFAULT '',
      quantity_sold INTEGER NOT NULL DEFAULT 0,
      sold_at INTEGER NOT NULL DEFAULT 0,
      settlement_pending INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL DEFAULT 0
    );
  `);
}

describe('Store sales display', () => {
  const app = {
    wallet: {
      convertNolanToSaito: (nolan) => String(Number(nolan) / 100000000)
    }
  };

  test('a web3 sale shows the ticker total and the full buyer key', () => {
    const html = SalesTableTemplate({
      listings: [
        {
          app,
          title: 'Eternal Collectable',
          price: 0,
          web3_ticker: 'TRX',
          web3_amount: '1',
          quantity_sold: 1,
          buyer: BUYER,
          sold_at: 0,
          listing_signature: 'sale-sig'
        }
      ]
    });

    expect(html).toContain('1 TRX');
    expect(html).toContain(BUYER);
    expect(html).not.toContain('…');
    expect(html).toContain('data-action="copy-buyer"');
  });

  test('a SAITO sale keeps nolan formatting and an empty price is a dash', () => {
    const saito = SalesTableTemplate({
      listings: [
        {
          app,
          title: 'Vintage Collectable',
          price: 100000000,
          web3_ticker: '',
          web3_amount: '',
          quantity_sold: 1,
          buyer: BUYER,
          sold_at: 0
        }
      ]
    });
    const empty = SalesTableTemplate({
      listings: [
        {
          app,
          title: 'Unpriced',
          price: 0,
          quantity_sold: 1,
          buyer: '',
          sold_at: 0
        }
      ]
    });

    expect(saito).toContain('1 SAITO');
    expect(empty).toContain('—');
    expect(empty).not.toContain('TRX');
  });

  test('a fractional web3 quantity is multiplied without floating point', () => {
    const html = SalesTableTemplate({
      listings: [
        {
          app,
          title: 'Pair',
          price: 0,
          web3_ticker: 'TRX',
          web3_amount: '1.5',
          quantity_sold: 2,
          buyer: BUYER,
          sold_at: 0
        }
      ]
    });
    expect(html).toContain('3 TRX');
  });
});

describe('Store web3 sale proceeds', () => {
  let sqlite;
  let db;

  beforeEach(async () => {
    sqlite = openMemory();
    db = databaseFor(sqlite);
    await createListings(sqlite);
    await sqlite.run(
      `INSERT INTO listings (
         signature, block_hash_listed, seller, web3_ticker, web3_amount,
         block_id_sold, block_hash_sold, buyer, quantity_sold, sold_at
       ) VALUES
       ('trx-sale', 'listed-trx', $seller, 'TRX', '1', 8, 'sold-trx', $buyer, 1, 10),
       ('saito-sale', 'listed-saito', $seller, '', '', 9, 'sold-saito', $buyer, 1, 11),
       ('fresh-trx', 'listed-fresh', $seller, 'TRX', '2', 0, '', '', 0, 0)`,
      { $seller: SELLER, $buyer: BUYER }
    );
    await db.ensureListingSales();
  });

  afterEach(() => {
    sqlite.close();
  });

  test('schema backfill copies web3 details and leaves SAITO sales without a ticker', async () => {
    const rows = await sqlite.all(
      `SELECT signature, seller, web3_ticker, web3_amount FROM listing_sales ORDER BY signature`
    );
    const trx = rows.find((row) => row.signature === 'trx-sale');
    const saito = rows.find((row) => row.signature === 'saito-sale');

    expect(trx).toMatchObject({ seller: SELLER, web3_ticker: 'TRX', web3_amount: '1' });
    expect(saito).toMatchObject({ seller: SELLER, web3_ticker: '', web3_amount: '' });
  });

  test('markListingSold stores the web3 snapshot and a later update keeps withdrawal metadata', async () => {
    await db.markListingSold('fresh-trx', {
      block_hash_listed: 'listed-fresh',
      sold_block_id: 12,
      sold_block_hash: 'sold-fresh',
      buyer: BUYER,
      quantity_sold: 2
    });
    const inserted = await sqlite.all(
      `SELECT seller, web3_ticker, web3_amount, web3_payment_withdrawal_processed
         FROM listing_sales WHERE signature = 'fresh-trx'`
    );
    expect(inserted[0]).toMatchObject({
      seller: SELLER,
      web3_ticker: 'TRX',
      web3_amount: '2',
      web3_payment_withdrawal_processed: 0
    });

    await sqlite.run(
      `UPDATE listing_sales
          SET web3_payment_withdrawal_processed = 1,
              web3_payment_withdrawal_address = 'Taddress'
        WHERE signature = 'fresh-trx'`
    );
    await db.markListingSold('fresh-trx', {
      block_hash_listed: 'listed-fresh',
      sold_block_id: 12,
      sold_block_hash: 'sold-fresh',
      buyer: BUYER,
      quantity_sold: 2
    });
    const updated = await sqlite.all(
      `SELECT web3_ticker, web3_amount, web3_payment_withdrawal_processed, web3_payment_withdrawal_address
         FROM listing_sales WHERE signature = 'fresh-trx'`
    );
    expect(updated[0]).toMatchObject({
      web3_ticker: 'TRX',
      web3_amount: '2',
      web3_payment_withdrawal_processed: 1,
      web3_payment_withdrawal_address: 'Taddress'
    });
  });

  test('markListingSold updates the listing without the sale insert parameters', async () => {
    const raw = openUnfilteredMemory();
    const store = databaseFor(raw);
    await createListings(raw);
    await raw.run(
      `INSERT INTO listings (
         signature, block_hash_listed, seller, web3_ticker, web3_amount,
         settlement_pending, buyer
       ) VALUES ('completed-sale', 'listed-completed', $seller, 'TRX', '2', 1, '')`,
      { $seller: SELLER }
    );
    await store.ensureListingSales();

    const listingUpdate = `UPDATE listings
      SET buyer = $buyer, settlement_pending = 0, updated_at = $updated_at
      WHERE signature = $signature AND block_hash_listed = $block_hash_listed`;
    await expect(
      raw.run(listingUpdate, {
        $buyer: BUYER,
        $updated_at: 1,
        $signature: 'completed-sale',
        $block_hash_listed: 'listed-completed',
        $seller: SELLER,
        $web3_ticker: 'TRX',
        $web3_amount: '2',
        $created_at: 1,
        $inbound_payment_uuid: 'pay-hash',
        $transfer_uuid: '11'
      })
    ).rejects.toThrow(/SQLITE_RANGE/);

    const updateParams = [];
    const run = raw.run.bind(raw);
    raw.run = (sql, params) => {
      if (String(sql).includes('UPDATE listings')) {
        updateParams.push(params);
      }
      return run(sql, params);
    };
    const recorded = await store.markListingSold('completed-sale', {
      block_hash_listed: 'listed-completed',
      sold_block_id: 12,
      sold_block_hash: 'sold-completed',
      sold_transaction_id: 3,
      note: 'paid',
      buyer: BUYER,
      quantity_sold: 2,
      inbound_payment_uuid: 'pay-hash',
      transfer_uuid: '11'
    });
    expect(recorded).toEqual({ sale_recorded: true, listing_updated: true });
    expect(Object.keys(updateParams[0]).sort()).toEqual([
      '$block_hash_listed',
      '$block_hash_sold',
      '$block_id_sold',
      '$buyer',
      '$note',
      '$quantity_sold',
      '$signature',
      '$sold_at',
      '$transaction_id_sold',
      '$updated_at'
    ]);
    await store.markListingSold('completed-sale', {
      block_hash_listed: 'listed-completed',
      sold_block_id: 12,
      sold_block_hash: 'sold-completed',
      sold_transaction_id: 3,
      note: 'paid',
      buyer: BUYER,
      quantity_sold: 2,
      inbound_payment_uuid: 'pay-hash',
      transfer_uuid: '11'
    });

    const sales = await raw.all(
      `SELECT buyer, quantity_sold, web3_ticker, web3_amount, transfer_uuid
         FROM listing_sales WHERE signature = 'completed-sale'`
    );
    const listings = await raw.all(
      `SELECT buyer, settlement_pending, block_hash_sold, transaction_id_sold, quantity_sold
         FROM listings WHERE signature = 'completed-sale'`
    );
    expect(sales).toEqual([
      {
        buyer: BUYER,
        quantity_sold: 2,
        web3_ticker: 'TRX',
        web3_amount: '2',
        transfer_uuid: '11'
      }
    ]);
    expect(listings[0]).toMatchObject({
      buyer: BUYER,
      settlement_pending: 0,
      block_hash_sold: 'sold-completed',
      transaction_id_sold: 3,
      quantity_sold: 2
    });
    raw.close();
  });

  test('a failed listing update leaves the completed sale recorded', async () => {
    const raw = openUnfilteredMemory();
    const store = databaseFor(raw);
    await createListings(raw);
    await raw.run(
      `INSERT INTO listings (
         signature, block_hash_listed, seller, web3_ticker, web3_amount, settlement_pending
       ) VALUES ('kept-sale', 'listed-kept', $seller, 'TRX', '4', 1)`,
      { $seller: SELLER }
    );
    await store.ensureListingSales();

    const run = raw.run.bind(raw);
    raw.run = (sql, params) => {
      if (String(sql).includes('UPDATE listings')) {
        return Promise.reject(new Error('listing snapshot write failed'));
      }
      return run(sql, params);
    };
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});
    const result = await store.markListingSold('kept-sale', {
      block_hash_listed: 'listed-kept',
      sold_block_id: 15,
      sold_block_hash: 'sold-kept',
      sold_transaction_id: 4,
      buyer: BUYER,
      quantity_sold: 1
    });

    expect(result.sale_recorded).toBe(true);
    expect(result.listing_updated).toBe(false);
    expect(result.listing_error.message).toBe('listing snapshot write failed');
    const logged = error.mock.calls.find((call) =>
      String(call[0]).includes('listing update failed after the sale was recorded')
    );
    expect(logged[1]).toMatchObject({
      signature: 'kept-sale',
      block_hash_listed: 'listed-kept',
      block_hash_sold: 'sold-kept',
      transaction_id_sold: 4,
      error: 'listing snapshot write failed'
    });
    const sales = await raw.all(`SELECT signature FROM listing_sales WHERE signature = 'kept-sale'`);
    const listing = await raw.all(
      `SELECT buyer, settlement_pending FROM listings WHERE signature = 'kept-sale'`
    );
    expect(sales).toHaveLength(1);
    expect(listing[0]).toMatchObject({ buyer: '', settlement_pending: 1 });
    error.mockRestore();
    raw.close();
  });

  test('unprocessed proceeds stay pending until five canonical blocks have elapsed', async () => {
    await sqlite.run(
      `INSERT INTO listing_sales (
         signature, block_hash_listed, block_hash_sold, block_id_sold, seller, web3_ticker, web3_amount,
         quantity_sold, longest_chain_sold, web3_payment_withdrawal_processed
       ) VALUES
       ('off-chain', 'listed-off', 'sold-off', 1, $seller, 'TRX', '1.5', 2, 0, 0),
       ('paid', 'listed-paid', 'sold-paid', 1, $seller, 'TRX', '9', 1, 1, 1),
       ('other', 'listed-other', 'sold-other', 1, $other, 'TRX', '4', 1, 1, 0),
       ('eth', 'listed-eth', 'sold-eth', 8, $seller, 'ETH', '0.5', 1, 0, 0),
       ('young', 'listed-young', 'sold-young', 12, $seller, 'TRX', '2', 1, 1, 0),
       ('mature', 'listed-mature', 'sold-mature', 10, $seller, 'TRX', '3', 1, 1, 0)`,
      { $seller: SELLER, $other: OTHER }
    );

    const waiting = await db.returnWeb3WithdrawalBalances(SELLER, 14, 5);
    expect(waiting.pending.TRX).toBe('9');
    expect(waiting.pending.ETH).toBe('0.5');
    expect(waiting.eligible.TRX).toBeUndefined();

    const ready = await db.returnWeb3WithdrawalBalances(SELLER, 15, 5);
    expect(ready.pending).toEqual({ TRX: '6', ETH: '0.5' });
    expect(ready.eligible).toEqual({ TRX: '3' });

    const html = WithdrawalsTemplate({
      rows: [
        { ticker: 'TRX', eligible: ready.eligible.TRX, pending: ready.pending.TRX },
        { ticker: 'ETH', eligible: 0, pending: ready.pending.ETH },
        { ticker: 'SOL', eligible: 0, pending: 0 }
      ]
    });
    expect(html).toContain('>3<');
    expect(html).toContain('>6<');
    expect(html).toContain('>0.5<');
    expect(html).toContain('You can withdraw this');
    expect(html.match(/data-action="withdraw"/g).length).toBe(1);
    expect(html.match(/<span class="label">eligible<\/span>/g).length).toBe(3);
    expect(html.match(/<span class="label">pending<\/span>/g).length).toBe(3);
  });
});
