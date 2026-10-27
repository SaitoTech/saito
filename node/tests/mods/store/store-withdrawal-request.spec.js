const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3');
const StoreDatabase = require('../../../mods/store/lib/database');
const StoreWithdrawals = require('../../../mods/store/lib/withdrawal');
const { canonicalJson, verifyQuote } = require('../../../mods/store/lib/withdrawal-quote');

const USER = 'user-public-key';
const STORE = 'store-public-key';
const TREASURY = 'treasury-public-key';
const ADDRESS = 'T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb';
const PRIVATE = 'store-private';

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
        resolve({ changes: this.changes, lastID: this.lastID });
      });
    });
  const exec = (sql) =>
    new Promise((resolve, reject) => {
      sqlite.exec(sql, (err) => (err ? reject(err) : resolve()));
    });
  const all = (sql, params = {}) =>
    new Promise((resolve, reject) => {
      sqlite.all(sql, bind(sql, params), (err, rows) => (err ? reject(err) : resolve(rows || [])));
    });
  return { run, exec, all, close: () => sqlite.close() };
}

function appFor(sqlite, { peers = [], mixin = null } = {}) {
  const sent = [];
  const app = {
    storage: {
      returnFileSystem: () => fs,
      returnDatabaseByName: async () => sqlite,
      queryDatabase: (sql, params) => sqlite.all(sql, params),
      runDatabase: (sql, params) => sqlite.run(sql, params)
    },
    blockchain: { getLatestBlockId: async () => 20 },
    wallet: {
      getPrivateKey: async () => PRIVATE,
      convertSaitoToNolan: (amount) => String(Math.round(Number(amount) * 100000000))
    },
    crypto: {
      signMessage(message, privateKey) {
        return `signed:${privateKey}:${message}`;
      },
      verifyMessage(message, signature, publicKey) {
        return (
          (publicKey === STORE || publicKey === TREASURY) &&
          signature === `signed:${PRIVATE}:${message}`
        );
      }
    },
    modules: {
      returnModule(name) {
        if (name === 'Mixin') {
          return mixin;
        }
        if (name === 'BuySaito') {
          return { authorized_public_key: TREASURY };
        }
        return null;
      }
    },
    network: {
      peers,
      sendRequestAsTransaction(request, data, callback, peer) {
        sent.push({ request, data, peer });
        callback({ transfer_id: 44 });
      }
    },
    sent
  };
  return app;
}

async function serviceFor(options = {}) {
  const sqlite = openMemory();
  const salesSql = fs.readFileSync(
    path.join(__dirname, '../../../mods/store/sql/listing_sales.sql'),
    'utf8'
  );
  const withdrawalSql = fs.readFileSync(
    path.join(__dirname, '../../../mods/store/sql/withdrawals.sql'),
    'utf8'
  );
  await sqlite.exec(salesSql);
  await sqlite.exec(withdrawalSql);
  const app = appFor(sqlite, options);
  const database = new StoreDatabase(app, { dbname: 'store' });
  const mod = {
    app,
    publicKey: options.storeKey || STORE,
    fee: options.fee ?? 0,
    web3_withdrawal_blocks: 5,
    warehouse: { db: database }
  };
  return { sqlite, app, service: new StoreWithdrawals(mod), mod };
}

async function insertSale(sqlite, fields = {}) {
  const row = {
    signature: 'sale-sig',
    block_hash_listed: 'listed',
    block_id_sold: 10,
    block_hash_sold: 'sold',
    seller: USER,
    web3_ticker: 'TRX',
    web3_amount: '3',
    quantity_sold: 1,
    longest_chain_sold: 1,
    transfer_uuid: '11',
    inbound_payment_uuid: 'pay-hash',
    ...fields
  };
  await sqlite.run(
    `INSERT INTO listing_sales (
       signature, block_hash_listed, block_id_sold, block_hash_sold, transaction_id_sold,
       longest_chain_sold, seller, web3_ticker, web3_amount, quantity_sold,
       transfer_uuid, inbound_payment_uuid, web3_payment_withdrawal_processed,
       web3_payment_withdrawal_request
     ) VALUES (
       $signature, $listed, $block, $sold, 1,
       $chain, $seller, $ticker, $amount, $quantity,
       $transfer, $payment, $processed, $request
     )`,
    {
      $signature: row.signature,
      $listed: row.block_hash_listed,
      $block: row.block_id_sold,
      $sold: row.block_hash_sold,
      $chain: row.longest_chain_sold,
      $seller: row.seller,
      $ticker: row.web3_ticker,
      $amount: row.web3_amount,
      $quantity: row.quantity_sold,
      $transfer: row.transfer_uuid,
      $payment: row.inbound_payment_uuid,
      $processed: row.processed || 0,
      $request: row.request || ''
    }
  );
}

function withdrawalTx(data, signature, { to = data.publickey, amount = '0', sig = 'tx-sig-1' } = {}) {
  return {
    signature: sig,
    from: [{ publicKey: USER }],
    to: [{ publicKey: to, amount }],
    returnMessage() {
      return { request: 'store-withdrawal', data, signature };
    }
  };
}

describe('store withdrawal quotes', () => {
  let ctx;

  beforeEach(async () => {
    ctx = await serviceFor();
    await insertSale(ctx.sqlite);
  });

  afterEach(() => ctx.sqlite.close());

  test('a quote is derived from eligible sales and signed by the store', async () => {
    await insertSale(ctx.sqlite, {
      signature: 'missing-ids',
      block_hash_listed: 'listed-2',
      transfer_uuid: '',
      inbound_payment_uuid: ''
    });
    const quote = await ctx.service.createQuote({
      seller: USER,
      ticker: 'trx',
      withdrawalAddress: ADDRESS
    });

    expect(quote.err).toBeUndefined();
    expect(quote.data.amount).toBe('0');
    expect(quote.data.publickey).toBe(TREASURY);
    expect(quote.data.ticker).toBe('TRX');
    expect(quote.data.withdrawal_amount).toBe('3');
    expect(quote.data.withdrawal_address).toBe(ADDRESS);
    expect(quote.data.transfer_uuids).toEqual(['11']);
    expect(quote.data.payment_uuids).toEqual(['pay-hash']);
    expect(verifyQuote(ctx.app, quote.data, quote.signature, STORE)).toBe(true);
    expect(verifyQuote(ctx.app, { ...quote.data, withdrawal_amount: '9' }, quote.signature, STORE)).toBe(false);
    const reordered = {
      ...quote.data,
      transfer_uuids: ['pay-hash'],
      payment_uuids: ['11']
    };
    expect(verifyQuote(ctx.app, reordered, quote.signature, STORE)).toBe(false);
    expect(canonicalJson(quote.data)).toContain('"timestamp"');
  });

  test('two quotes in the same millisecond get different timestamps', async () => {
    const first = await ctx.service.createQuote({ seller: USER, ticker: 'TRX', withdrawalAddress: ADDRESS });
    const second = await ctx.service.createQuote({ seller: USER, ticker: 'TRX', withdrawalAddress: ADDRESS });
    expect(first.data.timestamp).not.toBe(second.data.timestamp);
  });

  test('no eligible proceeds returns an error', async () => {
    const empty = await serviceFor();
    const quote = await empty.service.createQuote({
      seller: USER,
      ticker: 'TRX',
      withdrawalAddress: ADDRESS
    });
    expect(quote.err).toBe('No eligible proceeds are available for withdrawal.');
    empty.sqlite.close();
  });
});

describe('store withdrawal acceptance', () => {
  let ctx;

  beforeEach(async () => {
    ctx = await serviceFor({
      mixin: {
        receiveStoreWithdrawal: jest.fn(async () => ({ transfer_id: 8 }))
      }
    });
    ctx.mod.publicKey = TREASURY;
    await insertSale(ctx.sqlite);
  });

  afterEach(() => ctx.sqlite.close());

  async function quotedTx(overrides) {
    const quote = await ctx.service.createQuote({
      seller: USER,
      ticker: 'TRX',
      withdrawalAddress: ADDRESS
    });
    return { quote, tx: withdrawalTx(quote.data, quote.signature, overrides) };
  }

  test('a valid request is reserved once and submitted to the local mixin module', async () => {
    const { tx } = await quotedTx();
    const result = await ctx.service.acceptSubmittedTransaction(tx);
    expect(result.status).toBe('submitted');
    expect(result.message).toContain('has not been sent');
    expect(ctx.app.modules.returnModule('Mixin').receiveStoreWithdrawal).toHaveBeenCalledTimes(1);

    const wrapped = {
      signature: 'wrapper-sig',
      from: [{ publicKey: USER }],
      returnMessage() {
        return { request: 'store-withdrawal', data: { module: 'Store', transaction: tx } };
      }
    };
    const again = await ctx.service.acceptSubmittedTransaction(wrapped);
    expect(again.status).toBe('submitted');
    const rows = await ctx.sqlite.all(`SELECT * FROM store_withdrawals`);
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('submitted');
    const sales = await ctx.sqlite.all(`SELECT web3_payment_withdrawal_request, web3_payment_withdrawal_processed FROM listing_sales`);
    expect(sales[0].web3_payment_withdrawal_request).toBe(rows[0].request_id);
    expect(sales[0].web3_payment_withdrawal_processed).toBe(0);
    expect(ctx.app.modules.returnModule('Mixin').receiveStoreWithdrawal).toHaveBeenCalledTimes(1);
  });

  test('tampered quote data is rejected without a reservation', async () => {
    const { quote } = await quotedTx();
    const tampered = { ...quote.data, withdrawal_amount: '9' };
    const result = await ctx.service.acceptSubmittedTransaction(withdrawalTx(tampered, quote.signature, { sig: 'tampered' }));
    expect(result.err).toMatch(/signature/);
    expect(await ctx.sqlite.all(`SELECT * FROM store_withdrawals`)).toEqual([]);
    const sales = await ctx.sqlite.all(`SELECT web3_payment_withdrawal_request FROM listing_sales`);
    expect(sales[0].web3_payment_withdrawal_request).toBe('');
  });

  test('the treasury recipient and SAITO amount must match the quote', async () => {
    const wrongRecipient = await quotedTx({ to: 'someone-else', sig: 'wrong-to' });
    expect((await ctx.service.acceptSubmittedTransaction(wrongRecipient.tx)).err).toMatch(/SAITO/);

    ctx.mod.fee = 1;
    const underpaid = await ctx.service.createQuote({ seller: USER, ticker: 'TRX', withdrawalAddress: ADDRESS });
    const tx = withdrawalTx(underpaid.data, underpaid.signature, { amount: '1', sig: 'underpaid' });
    expect((await ctx.service.acceptSubmittedTransaction(tx)).err).toMatch(/SAITO/);
    expect(await ctx.sqlite.all(`SELECT * FROM store_withdrawals`)).toEqual([]);
  });

  test('an expired quote and a second transaction for the same quote are rejected', async () => {
    const { quote, tx } = await quotedTx();
    quote.data.timestamp = `${Date.now() - 26 * 60 * 1000}-1`;
    quote.signature = ctx.app.crypto.signMessage(canonicalJson(quote.data), PRIVATE);
    const expired = withdrawalTx(quote.data, quote.signature, { sig: 'expired' });
    expect((await ctx.service.acceptSubmittedTransaction(expired)).err).toMatch(/expired/);

    const first = await quotedTx({ sig: 'first-tx' });
    expect((await ctx.service.acceptSubmittedTransaction(first.tx)).status).toBe('submitted');
    const second = withdrawalTx(first.quote.data, first.quote.signature, { sig: 'second-tx' });
    expect((await ctx.service.acceptSubmittedTransaction(second)).err).toMatch(/already used/);
    expect(await ctx.sqlite.all(`SELECT * FROM store_withdrawals`)).toHaveLength(1);
  });

  test('concurrent requests cannot reserve the same sale', async () => {
    const { quote } = await quotedTx();
    const first = withdrawalTx(quote.data, quote.signature, { sig: 'race-1' });
    const second = withdrawalTx(quote.data, quote.signature, { sig: 'race-2' });
    const results = await Promise.all([
      ctx.service.acceptSubmittedTransaction(first),
      ctx.service.acceptSubmittedTransaction(second)
    ]);
    const submitted = results.filter((result) => result.status === 'submitted');
    const rejected = results.filter((result) => result.err);
    expect(submitted).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(await ctx.sqlite.all(`SELECT * FROM store_withdrawals`)).toHaveLength(1);
  });

  test('a failed reservation does not leave a partial update', async () => {
    await insertSale(ctx.sqlite, {
      signature: 'sale-2',
      block_hash_listed: 'listed-2',
      block_hash_sold: 'sold-2',
      transfer_uuid: '12',
      inbound_payment_uuid: 'pay-2',
      web3_amount: '1'
    });
    const quote = await ctx.service.createQuote({ seller: USER, ticker: 'TRX', withdrawalAddress: ADDRESS });
    expect(quote.data.transfer_uuids).toEqual(['11', '12']);
    await ctx.sqlite.run(
      `UPDATE listing_sales SET web3_payment_withdrawal_request = 'other' WHERE transfer_uuid = '12'`
    );
    const result = await ctx.service.acceptSubmittedTransaction(withdrawalTx(quote.data, quote.signature));
    expect(result.err).toMatch(/no longer eligible/);
    const sales = await ctx.sqlite.all(
      `SELECT transfer_uuid, web3_payment_withdrawal_request FROM listing_sales ORDER BY transfer_uuid`
    );
    expect(sales).toEqual([
      { transfer_uuid: '11', web3_payment_withdrawal_request: '' },
      { transfer_uuid: '12', web3_payment_withdrawal_request: 'other' }
    ]);
    expect(await ctx.sqlite.all(`SELECT * FROM store_withdrawals`)).toEqual([]);
  });

  test('a connected treasury peer receives the withdrawal and a missing peer keeps the reservation', async () => {
    const remote = await serviceFor({ peers: [{ publicKey: TREASURY }] });
    await insertSale(remote.sqlite);
    const quote = await remote.service.createQuote({
      seller: USER,
      ticker: 'TRX',
      withdrawalAddress: ADDRESS
    });
    const tx = withdrawalTx(quote.data, quote.signature);
    const submitted = await remote.service.acceptSubmittedTransaction(tx);
    expect(submitted.status).toBe('submitted');
    expect(remote.app.sent[0].peer).toBe(TREASURY);
    expect(remote.app.sent[0].request).toBe('store-withdrawal');

    const offline = await serviceFor({ peers: [] });
    await insertSale(offline.sqlite);
    const offlineQuote = await offline.service.createQuote({
      seller: USER,
      ticker: 'TRX',
      withdrawalAddress: ADDRESS
    });
    const offlineTx = withdrawalTx(offlineQuote.data, offlineQuote.signature, { sig: 'offline' });
    const failed = await offline.service.acceptSubmittedTransaction(offlineTx);
    expect(failed.status).toBe('forward_failed');
    expect(failed.err).toMatch(/not connected/);
    const reserved = await offline.sqlite.all(`SELECT status, last_error FROM store_withdrawals`);
    expect(reserved[0].status).toBe('forward_failed');
    const sale = await offline.sqlite.all(`SELECT web3_payment_withdrawal_request FROM listing_sales`);
    expect(sale[0].web3_payment_withdrawal_request).not.toBe('');

    offline.app.network.peers = [{ publicKey: TREASURY }];
    const retried = await offline.service.acceptSubmittedTransaction(offlineTx);
    expect(retried.status).toBe('submitted');
    expect(await offline.sqlite.all(`SELECT * FROM store_withdrawals`)).toHaveLength(1);

    remote.sqlite.close();
    offline.sqlite.close();
  });
});
