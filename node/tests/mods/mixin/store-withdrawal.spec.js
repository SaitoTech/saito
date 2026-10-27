const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3');
const MixinDatabase = require('../../../mods/mixin/lib/database');
const Transfers = require('../../../mods/mixin/lib/transfers');
const { receiveStoreWithdrawal } = require('../../../mods/mixin/lib/store-withdrawal');
const { canonicalJson } = require('../../../mods/store/lib/withdrawal-quote');

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

function signed(data) {
  return `signed:${PRIVATE}:${canonicalJson(data)}`;
}

function dataFor(overrides = {}) {
  return {
    amount: '0',
    publickey: TREASURY,
    ticker: 'TRX',
    withdrawal_amount: '3',
    withdrawal_address: ADDRESS,
    transfer_uuids: ['1'],
    payment_uuids: ['pay-hash'],
    timestamp: `${Date.now()}-1`,
    ...overrides
  };
}

function txFor(data, signature = signed(data)) {
  return {
    signature: `saito-${data.timestamp}`,
    from: [{ publicKey: USER }],
    to: [{ publicKey: data.publickey, amount: '0' }],
    returnMessage() {
      return { request: 'store-withdrawal', data, signature };
    }
  };
}

async function mixinFor() {
  const sqlite = openMemory();
  const sql = fs.readFileSync(path.join(__dirname, '../../../mods/mixin/sql/transfers.sql'), 'utf8');
  await sqlite.exec(sql);
  await sqlite.run(
    `INSERT INTO transfers (
       purpose, mode, inbound_tx_hash, inbound_ticker, inbound_amount, status, created_at, updated_at
     ) VALUES ('store-purchase', 'manual', 'pay-hash', 'TRX', '3', 'inbound_confirmed', 1, 1)`
  );
  const app = {
    storage: {
      returnDatabaseByName: async () => sqlite,
      queryDatabase: (sql, params) => sqlite.all(sql, params),
      runDatabase: (sql, params) => sqlite.run(sql, params)
    },
    wallet: {
      convertSaitoToNolan: (amount) => String(Math.round(Number(amount) * 100000000))
    },
    crypto: {
      verifyMessage(message, signature, publicKey) {
        return signature === `signed:${PRIVATE}:${message}` && (publicKey === STORE || publicKey === TREASURY);
      }
    }
  };
  const mod = {
    app,
    publicKey: TREASURY,
    dbname: 'mixin',
    database: null,
    delegated_payment_publickeys: [STORE]
  };
  mod.database = new MixinDatabase(app, mod);
  await mod.database.ensureStoreWithdrawalClaims();
  return { sqlite, mod };
}

describe('mixin store withdrawals', () => {
  let ctx;

  beforeEach(async () => {
    ctx = await mixinFor();
  });

  afterEach(() => ctx.sqlite.close());

  test('an authorized store creates one manual withdrawal and a replay returns it', async () => {
    const data = dataFor();
    const tx = txFor(data);
    const created = await receiveStoreWithdrawal(ctx.mod, tx, { publicKey: STORE });
    expect(created.err).toBeUndefined();
    expect(created.message).toContain('has not been sent');

    const rows = await ctx.sqlite.all(`SELECT * FROM transfers WHERE purpose = 'store-withdrawal'`);
    expect(rows).toHaveLength(1);
    expect(rows[0].mode).toBe('manual');
    expect(rows[0].status).toBe('other');
    expect(rows[0].inbound_ticker).toBe('SAITO');
    expect(rows[0].inbound_amount).toBe('0');
    expect(rows[0].inbound_sender).toBe(USER);
    expect(rows[0].outbound_ticker).toBe('TRX');
    expect(rows[0].outbound_amount).toBe('3');
    expect(rows[0].outbound_address).toBe(ADDRESS);
    expect(rows[0].outbound_tx_sig).toBe('');
    expect(rows[0].requester_publickey).toBe(USER);
    const payload = JSON.parse(rows[0].payload);
    expect(payload.transfer_uuids).toEqual(['1']);
    expect(payload.payment_uuids).toEqual(['pay-hash']);

    const replay = await receiveStoreWithdrawal(ctx.mod, txFor(data), { publicKey: STORE });
    expect(replay.transfer_id).toBe(created.transfer_id);
    expect(replay.replayed).toBe(true);
    expect(await ctx.sqlite.all(`SELECT id FROM transfers WHERE purpose = 'store-withdrawal'`)).toHaveLength(1);
  });

  test('the mixin module itself may submit its own withdrawal', async () => {
    const data = dataFor({ timestamp: `${Date.now()}-local` });
    const result = await receiveStoreWithdrawal(ctx.mod, txFor(data), { publicKey: TREASURY });
    expect(result.transfer_id).toBeGreaterThan(0);
  });

  test('the paying user does not need to be a mixin delegate', async () => {
    const data = dataFor({ timestamp: `${Date.now()}-user` });
    const result = await receiveStoreWithdrawal(ctx.mod, txFor(data), { publicKey: USER });
    expect(result.err).toBeUndefined();
    expect(result.transfer_id).toBeGreaterThan(0);
  });

  test('a configured store delegate is accepted and an unlisted signer is not', async () => {
    ctx.mod.app.crypto.verifyMessage = (message, signature, publicKey) =>
      signature === `signed:${publicKey}:${message}`;
    const delegated = dataFor({ publickey: STORE, timestamp: `${Date.now()}-delegate` });
    const accepted = await receiveStoreWithdrawal(
      ctx.mod,
      {
        ...txFor(delegated, `signed:${STORE}:${canonicalJson(delegated)}`),
        to: [{ publicKey: STORE, amount: '0' }]
      },
      { publicKey: USER }
    );
    expect(accepted.transfer_id).toBeGreaterThan(0);

    const strangerData = dataFor({ publickey: 'stranger', timestamp: `${Date.now()}-stranger` });
    const rejected = await receiveStoreWithdrawal(
      ctx.mod,
      {
        ...txFor(strangerData, `signed:stranger:${canonicalJson(strangerData)}`),
        to: [{ publicKey: 'stranger', amount: '0' }]
      },
      { publicKey: 'stranger' }
    );
    expect(rejected.err).toMatch(/not authorized/);
    expect(await ctx.sqlite.all(`SELECT id FROM transfers WHERE purpose = 'store-withdrawal'`)).toHaveLength(1);
  });

  test('an invalid quote signature creates nothing', async () => {
    const data = dataFor({ timestamp: `${Date.now()}-bad-sig` });
    const result = await receiveStoreWithdrawal(ctx.mod, txFor(data, 'not-a-signature'), { publicKey: STORE });
    expect(result.err).toMatch(/not valid/);
    expect(await ctx.sqlite.all(`SELECT * FROM store_withdrawal_claims`)).toEqual([]);
  });

  test('invalid identifiers, a bad address, and reserved proceeds are rejected', async () => {
    const missing = dataFor({ transfer_uuids: ['99'], payment_uuids: ['missing'], timestamp: `${Date.now()}-missing` });
    expect((await receiveStoreWithdrawal(ctx.mod, txFor(missing), { publicKey: STORE })).err).toMatch(/not found/);

    const badAddress = dataFor({
      withdrawal_address: 'not-an-address',
      timestamp: `${Date.now()}-address`
    });
    expect((await receiveStoreWithdrawal(ctx.mod, txFor(badAddress), { publicKey: STORE })).err).toMatch(/address/);

    const first = dataFor({ timestamp: `${Date.now()}-first` });
    expect((await receiveStoreWithdrawal(ctx.mod, txFor(first), { publicKey: STORE })).transfer_id).toBeGreaterThan(0);
    const second = dataFor({ timestamp: `${Date.now()}-second` });
    expect((await receiveStoreWithdrawal(ctx.mod, txFor(second), { publicKey: STORE })).err).toMatch(/already reserved/);
    expect(await ctx.sqlite.all(`SELECT id FROM transfers WHERE purpose = 'store-withdrawal'`)).toHaveLength(1);
  });

  test('the withdrawal amount must match the backing proceeds', async () => {
    const data = dataFor({ withdrawal_amount: '9', timestamp: `${Date.now()}-too-much` });
    const result = await receiveStoreWithdrawal(ctx.mod, txFor(data), { publicKey: USER });
    expect(result.err).toMatch(/does not match the unspent proceeds/);
    expect(await ctx.sqlite.all(`SELECT * FROM store_withdrawal_claims`)).toEqual([]);
  });

  test('a failed transfer insert does not leave a reservation', async () => {
    const raw = ctx.sqlite.run.bind(ctx.sqlite);
    ctx.sqlite.run = (sql, params) => {
      if (String(sql).includes("purpose, mode, payload")) {
        return Promise.reject(new Error('disk full'));
      }
      return raw(sql, params);
    };
    const result = await receiveStoreWithdrawal(ctx.mod, txFor(dataFor({ timestamp: `${Date.now()}-fail` })), {
      publicKey: USER
    });
    expect(result.err).toMatch(/disk full/);
    expect(await ctx.sqlite.all(`SELECT * FROM store_withdrawal_claims`)).toEqual([]);
    expect(await ctx.sqlite.all(`SELECT id FROM transfers WHERE purpose = 'store-withdrawal'`)).toEqual([]);
  });

  test('concurrent requests cannot reserve the same proceeds twice', async () => {
    const first = dataFor({ timestamp: `${Date.now()}-a` });
    const second = dataFor({ timestamp: `${Date.now()}-b` });
    const results = await Promise.all([
      receiveStoreWithdrawal(ctx.mod, txFor(first), { publicKey: USER }),
      receiveStoreWithdrawal(ctx.mod, txFor(second), { publicKey: USER })
    ]);
    const created = results.filter((item) => item.transfer_id);
    expect(created).toHaveLength(1);
    expect(results.some((item) => /already reserved|does not match/.test(item.err || ''))).toBe(true);
    expect(await ctx.sqlite.all(`SELECT id FROM transfers WHERE purpose = 'store-withdrawal'`)).toHaveLength(1);
  });

  test('a manual withdrawal is tracked through inclusion and reorganization', async () => {
    ctx.mod.accounts = { getCredentials: () => null };
    ctx.mod.database.getCredentials = async () => [];
    ctx.mod.app.wallet.getPrivateKey = async () => 'private';
    const data = dataFor({ timestamp: `${Date.now()}-chain` });
    const tx = txFor(data);
    const created = await receiveStoreWithdrawal(ctx.mod, tx, { publicKey: USER });
    const transfers = new Transfers(ctx.mod.app, ctx.mod);
    const block = { id: 30, hash: 'withdraw-block', transactions: [{ signature: tx.signature }] };

    await transfers.onNewBlock(block, true);
    let row = (await ctx.sqlite.all(`SELECT * FROM transfers WHERE id = $id`, { $id: created.transfer_id }))[0];
    expect(row.status).toBe('other');
    expect(row.inbound_tx_sig).toBe(tx.signature);
    expect(row.inbound_block_hash).toBe('withdraw-block');
    expect(row.inbound_longest_chain).toBe(1);
    expect(row.inbound_confirmations).toBe(1);
    expect(row.outbound_tx_sig).toBe('');

    await transfers.onNewBlock(block, true);
    const again = await ctx.sqlite.all(`SELECT id FROM transfers WHERE purpose = 'store-withdrawal'`);
    expect(again).toHaveLength(1);

    await transfers.onChainReorganization(30, 'withdraw-block', false);
    row = (await ctx.sqlite.all(`SELECT * FROM transfers WHERE id = $id`, { $id: created.transfer_id }))[0];
    expect(row.inbound_block_hash).toBe('');
    expect(row.inbound_longest_chain).toBe(0);
    expect(row.inbound_tx_sig).toBe(tx.signature);
    expect(row.status).toBe('other');

    await transfers.onNewBlock({ id: 31, hash: 'withdraw-block-2', transactions: [{ signature: tx.signature }] }, true);
    row = (await ctx.sqlite.all(`SELECT * FROM transfers WHERE id = $id`, { $id: created.transfer_id }))[0];
    expect(row.inbound_block_hash).toBe('withdraw-block-2');
    expect(await ctx.sqlite.all(`SELECT * FROM store_withdrawal_claims`)).toHaveLength(1);
  });

  test('a mismatched payment hash does not consume the transfer', async () => {
    const data = dataFor({ payment_uuids: ['other-hash'], timestamp: `${Date.now()}-hash` });
    const result = await receiveStoreWithdrawal(ctx.mod, txFor(data), { publicKey: STORE });
    expect(result.err).toMatch(/not found/);
    expect(await ctx.sqlite.all(`SELECT * FROM store_withdrawal_claims`)).toEqual([]);
  });
});
