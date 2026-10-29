jest.mock('@mixin.dev/mixin-node-sdk', () => ({
  MixinApi: jest.fn()
}));

const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3');

jest.mock('../../../lib/saito/transaction', () => ({
  default: class Transaction {
    deserialize_from_web(_app, raw) {
      Object.assign(this, JSON.parse(raw));
    }
    returnMessage() {
      return this.msg;
    }
    isValid() {
      return this.valid !== false;
    }
    serialize_to_web() {
      return JSON.stringify({
        signature: this.signature,
        msg: this.msg,
        to: this.to,
        from: this.from,
        valid: this.valid !== false
      });
    }
  }
}));

const Mixin = require('../../../mods/mixin/mixin');
const Database = require('../../../mods/mixin/lib/database');
const Transfers = require('../../../mods/mixin/lib/transfers');
const { receiveTreasuryPayout } = require('../../../mods/mixin/lib/treasury');

const APP = 'app-server';
const TREASURY = 'treasury-key';
const BUYER = 'buyer-key';

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

function wallet(balance = 10000000000n) {
  return {
    getBalance: jest.fn(async () => balance),
    convertSaitoToNolan: (amount) => BigInt(Math.round(Number(amount) * 100000000)),
    createUnsignedTransactionWithDefaultFee: jest.fn(async (recipient) => ({
      to: [{ publicKey: recipient }],
      from: [{ publicKey: APP }],
      msg: null,
      signature: '',
      valid: true,
      isValid() {
        return this.valid;
      },
      returnMessage() {
        return this.msg;
      },
      async sign() {
        const data = this.msg?.data || {};
        this.signature = `sig-${this.msg.request}-${data.source_transfer_id || data.id || recipient}-${data.outbound_amount || ''}`;
      },
      serialize_to_web() {
        return JSON.stringify({
          signature: this.signature,
          msg: this.msg,
          to: this.to,
          from: this.from,
          valid: this.valid
        });
      }
    }))
  };
}

async function databaseFor(sqlite) {
  const sqlDir = path.join(__dirname, '../../../mods/mixin/sql');
  await sqlite.exec(fs.readFileSync(path.join(sqlDir, 'transfers.sql'), 'utf8'));
  const app = {
    storage: {
      returnDatabaseByName: async () => sqlite,
      queryDatabase: (sql, params) => sqlite.all(sql, params),
      runDatabase: (sql, params) => sqlite.run(sql, params),
      executeDatabase: (sql) => sqlite.exec(sql)
    }
  };
  const mod = { app, slug: 'mixin', database: null };
  mod.database = new Database(app, mod);
  await mod.database.ensureTransfersSchema();
  await mod.database.ensureTreasurySchema();
  return mod.database;
}

function treasuryTx(data, { valid = true, signer = APP } = {}) {
  return {
    signature: `sig-mixin-issue-treasury-payout-${data.source_transfer_id}-${data.outbound_amount}`,
    from: [{ publicKey: signer }],
    valid,
    isValid() {
      return this.valid;
    },
    returnMessage() {
      return { module: 'Mixin', request: 'mixin-issue-treasury-payout', data };
    },
    serialize_to_web() {
      return JSON.stringify({
        signature: this.signature,
        msg: this.returnMessage(),
        from: this.from,
        valid: this.valid
      });
    }
  };
}

async function pair() {
  const appSqlite = openMemory();
  const treasurySqlite = openMemory();
  const appDatabase = await databaseFor(appSqlite);
  const treasuryDatabase = await databaseFor(treasurySqlite);
  const sent = [];
  const appWallet = wallet();
  const treasuryWallet = wallet();
  treasuryWallet.addTransactionToPending = jest.fn(async () => {});
  treasuryWallet.createUnsignedTransactionWithDefaultFee = jest.fn(async (recipient) => ({
    to: [{ publicKey: recipient }],
    from: [{ publicKey: TREASURY }],
    msg: null,
    signature: '',
    valid: true,
    async sign() {
      this.signature = `payout-${this.msg.request || this.msg.module}-${recipient}`;
    },
    serialize_to_web() {
      return JSON.stringify({
        signature: this.signature,
        msg: this.msg,
        to: this.to,
        from: this.from,
        valid: true
      });
    }
  }));
  const treasury = {
    app: {
      crypto: { isPublicKey: (key) => [BUYER, TREASURY, APP].includes(key) },
      wallet: treasuryWallet,
      storage: treasuryDatabase.app.storage,
      network: { propagateTransaction: jest.fn(async () => {}), getPeer: async () => ({}) },
      blockchain: { getLatestBlockId: async () => 4 },
      connection: { emit: jest.fn() }
    },
    publicKey: TREASURY,
    database: treasuryDatabase,
    payout_mode: 'local',
    execution_mode: 'local',
    treasury_delegate_publickeys: [APP],
    migration: {
      allocationForDeposit(amount) {
        const value = Number(amount);
        if (!(value > 0) || value > 1000000) {
          throw new Error('Migration amount exceeds the 1000000 cap');
        }
        return value;
      }
    }
  };
  treasury.transfers = new Transfers(treasury.app, treasury);
  const application = {
    app: {
      crypto: { isPublicKey: (key) => [BUYER, TREASURY, APP].includes(key) },
      wallet: appWallet,
      storage: appDatabase.app.storage,
      network: {
        getPeer: jest.fn(async (key) => (key === TREASURY ? { publicKey: key } : null)),
        sendTransactionWithCallback: jest.fn(async (tx, callback) => {
          sent.push(tx.signature);
          const result = await receiveTreasuryPayout(treasury, tx);
          if (callback) {
            callback(result);
          }
          return result;
        })
      },
      blockchain: { getLatestBlockId: async () => 4 }
    },
    publicKey: APP,
    database: appDatabase,
    payout_mode: 'remote',
    execution_mode: 'local',
    treasury_provider_publickeys: [TREASURY],
    treasury_delegate_publickeys: []
  };
  application.transfers = new Transfers(application.app, application);
  const id = await appDatabase.insertTransfer({
    purpose: 'buysaito',
    mode: 'automatic',
    status: 'inbound_confirmed',
    requester_publickey: BUYER,
    recipient_publickey: BUYER,
    outbound_amount: '2',
    outbound_ticker: 'SAITO',
    inbound_ticker: 'ETH',
    inbound_amount: '1',
    inbound_confirmation_block_id: 0,
    created_at: 1
  });
  return { appSqlite, treasurySqlite, application, treasury, sent, id };
}

describe('remote treasury payouts', () => {
  test('provider configuration chooses remote payout without changing execution', () => {
    const mixin = new Mixin({
      options: { mixin: { treasury_provider_publickeys: [TREASURY, 'second-key'] } },
      modules: { returnModule: () => null }
    });
    expect(mixin.execution_mode).toBe('local');
    expect(mixin.payout_mode).toBe('remote');

    mixin.publicKey = TREASURY;
    mixin.app.options.mixin.treasury_provider_publickeys = [TREASURY];
    mixin.loadTreasuryConfig();
    expect(mixin.payout_mode).toBe('local');
    expect(mixin.execution_mode).toBe('local');
  });

  test('an authorized request is accepted once and the treasury queue signs the payout', async () => {
    const ctx = await pair();
    const row = (await ctx.application.database.getTransfers({ id: ctx.id }))[0];
    const submitted = await ctx.application.transfers.issueOutboundTransfer(row);

    expect(submitted.status).toBe('treasury_accepted');
    expect(submitted.outbound_tx).toBeFalsy();
    expect(submitted.outbound_tx_sig).toBe('');
    expect(ctx.application.app.wallet.createUnsignedTransactionWithDefaultFee).toHaveBeenCalledTimes(1);
    expect(ctx.sent).toEqual([
      `sig-mixin-issue-treasury-payout-${ctx.id}-2`
    ]);

    const audit = await ctx.application.database.findLocalTreasury(ctx.id);
    expect(audit.status).toBe('accepted');
    expect(audit.remote_transfer_id).toBeGreaterThan(0);
    const treasuryRows = await ctx.treasury.database.getTransfers({ purpose: 'treasury-payout' });
    expect(treasuryRows).toHaveLength(1);
    expect(treasuryRows[0].status).toBe('inbound_confirmed');
    expect(treasuryRows[0].inbound_confirmation_block_id).toBe(0);
    expect(treasuryRows[0].outbound_tx_sig).toBe('');

    await ctx.treasury.transfers.processTransferQueue();
    const paid = (await ctx.treasury.database.getTransfers({ id: treasuryRows[0].id }))[0];
    expect(paid.outbound_tx_sig).toBe(`payout-buysaito issuance-${BUYER}`);
    expect(paid.outbound_tx).toContain(String(ctx.id));
    expect(JSON.parse(paid.outbound_tx).msg.data.id).toBe(ctx.id);
    expect(ctx.treasury.app.wallet.createUnsignedTransactionWithDefaultFee).toHaveBeenCalledTimes(1);

    ctx.application.app.wallet.createUnsignedTransactionWithDefaultFee.mockClear();
    await ctx.application.transfers.processTransferQueue();
    expect(ctx.application.app.wallet.createUnsignedTransactionWithDefaultFee).not.toHaveBeenCalled();
    expect((await ctx.application.database.getTransfers({ id: ctx.id }))[0].status).toBe('treasury_accepted');
    expect(await ctx.treasury.database.getTransfers({ purpose: 'treasury-payout' })).toHaveLength(1);

    ctx.appSqlite.close();
    ctx.treasurySqlite.close();
  });

  test('rejection, a lost callback, and a retry do not create a second payout', async () => {
    const ctx = await pair();
    const invalid = await receiveTreasuryPayout(
      ctx.treasury,
      treasuryTx({
        source_transfer_id: ctx.id,
        purpose: 'buysaito',
        outbound_amount: '2',
        recipient_publickey: BUYER,
        requester_publickey: APP
      }, { valid: false })
    );
    expect(invalid.request_status).toBe('rejected');

    const unauthorized = await receiveTreasuryPayout(
      ctx.treasury,
      treasuryTx(
        {
          source_transfer_id: 8,
          purpose: 'buysaito',
          outbound_amount: '2',
          recipient_publickey: BUYER,
          requester_publickey: 'stranger'
        },
        { signer: 'stranger' }
      )
    );
    expect(unauthorized.request_status).toBe('rejected');
    expect(await ctx.treasury.database.getTransfers({ purpose: 'treasury-payout' })).toEqual([]);

    ctx.application.app.network.sendTransactionWithCallback.mockImplementation(async (tx) => {
      ctx.sent.push(tx.signature);
    });
    const row = (await ctx.application.database.getTransfers({ id: ctx.id }))[0];
    const pending = await ctx.application.transfers.issueOutboundTransfer(row);
    expect(pending.status).toBe('treasury_submitted');
    expect(pending.outbound_tx_sig).toBe('');
    expect(ctx.application.app.wallet.createUnsignedTransactionWithDefaultFee).toHaveBeenCalledTimes(1);

    ctx.application.app.wallet.createUnsignedTransactionWithDefaultFee.mockClear();
    ctx.application.app.network.sendTransactionWithCallback.mockImplementation(async (tx, callback) => {
      ctx.sent.push(tx.signature);
      callback(await receiveTreasuryPayout(ctx.treasury, tx));
    });
    await ctx.application.transfers.processTransferQueue();
    const accepted = (await ctx.application.database.getTransfers({ id: ctx.id }))[0];
    expect(accepted.status).toBe('treasury_accepted');
    expect(accepted.outbound_tx_sig).toBe('');
    expect(ctx.application.app.wallet.createUnsignedTransactionWithDefaultFee).not.toHaveBeenCalled();
    expect(ctx.sent.every((sig) => sig === ctx.sent[0])).toBe(true);
    expect(await ctx.treasury.database.getTransfers({ purpose: 'treasury-payout' })).toHaveLength(1);

    const changed = treasuryTx({
      source_transfer_id: ctx.id,
      purpose: 'buysaito',
      outbound_amount: '9',
      recipient_publickey: BUYER,
      requester_publickey: APP
    });
    changed.signature = 'sig-different';
    const conflict = await receiveTreasuryPayout(ctx.treasury, changed);
    expect(conflict.request_status).toBe('error');
    expect(await ctx.treasury.database.getTransfers({ purpose: 'treasury-payout' })).toHaveLength(1);

    ctx.appSqlite.close();
    ctx.treasurySqlite.close();
  });

  test('an explicit rejection is recorded and an unreachable provider does not sign locally', async () => {
    const ctx = await pair();
    ctx.application.app.network.sendTransactionWithCallback.mockImplementation(async (_tx, callback) => {
      callback({
        request_status: 'rejected',
        reason: 'The payout request signer is not an authorized treasury delegate.'
      });
    });
    const row = (await ctx.application.database.getTransfers({ id: ctx.id }))[0];
    const rejected = await ctx.application.transfers.issueOutboundTransfer(row);
    expect(rejected.status).toBe('treasury_rejected');
    expect(rejected.last_error).toMatch(/not an authorized treasury delegate/);
    expect(rejected.outbound_tx_sig).toBe('');

    const unreachable = await databaseFor(openMemory());
    const id = await unreachable.insertTransfer({
      purpose: 'migration',
      mode: 'manual',
      status: 'inbound_confirmed',
      recipient_publickey: BUYER,
      outbound_amount: '3',
      inbound_confirmation_block_id: 0,
      created_at: 1
    });
    const mod = {
      app: {
        crypto: { isPublicKey: () => false },
        wallet: wallet(),
        network: { getPeer: async () => null }
      },
      publicKey: APP,
      database: unreachable,
      payout_mode: 'remote',
      execution_mode: 'local',
      treasury_provider_publickeys: ['missing-key'],
      migration: { allocationForDeposit: jest.fn(() => 3) }
    };
    const transfers = new Transfers(mod.app, mod);
    const result = await transfers.issueOutboundTransfer((await unreachable.getTransfers({ id }))[0]);
    expect(result.status).toBe('inbound_confirmed');
    expect(result.last_error).toBe('treasury_provider_unreachable');
    expect(result.outbound_tx_sig).toBe('');
    expect(mod.migration.allocationForDeposit).not.toHaveBeenCalled();
    expect(mod.app.wallet.createUnsignedTransactionWithDefaultFee).not.toHaveBeenCalled();

    ctx.appSqlite.close();
    ctx.treasurySqlite.close();
  });

  test('treasury restart, insufficient funds, and reorganization keep the same payout', async () => {
    const ctx = await pair();
    const data = {
      source_transfer_id: ctx.id,
      purpose: 'buysaito',
      outbound_amount: '2',
      recipient_publickey: BUYER,
      requester_publickey: APP
    };
    const accepted = await receiveTreasuryPayout(ctx.treasury, treasuryTx(data));
    expect(accepted.request_status).toBe('accepted');
    const queued = (await ctx.treasury.database.getTransfers({ id: accepted.transfer_id }))[0];

    ctx.treasury.app.wallet.getBalance.mockResolvedValue(0n);
    const short = await ctx.treasury.transfers.issueOutboundTransfer(queued);
    expect(short.last_error).toBe('insufficient_funds');
    expect(short.outbound_tx_sig).toBe('');
    expect(short.status).toBe('inbound_confirmed');
    expect(ctx.treasury.app.wallet.createUnsignedTransactionWithDefaultFee).not.toHaveBeenCalled();

    ctx.treasury.app.wallet.getBalance.mockResolvedValue(10000000000n);
    const signed = await ctx.treasury.transfers.issueOutboundTransfer(short);
    const signature = signed.outbound_tx_sig;
    expect(signature).toBeTruthy();
    const restarted = new Transfers(ctx.treasury.app, ctx.treasury);
    ctx.treasury.app.wallet.addTransactionToPending = jest.fn(async () => {});
    await ctx.treasury.database.updateTransfer(signed.id, { status: 'outbound_awaiting' });
    await restarted.processTransferQueue();
    expect(ctx.treasury.app.wallet.createUnsignedTransactionWithDefaultFee).toHaveBeenCalledTimes(1);
    expect(ctx.treasury.app.network.propagateTransaction).toHaveBeenCalledTimes(1);
    const broadcast = (await ctx.treasury.database.getTransfers({ id: signed.id }))[0];
    expect(broadcast.outbound_tx_sig).toBe(signature);
    expect(broadcast.status).toBe('outbound_broadcast');

    await ctx.treasury.database.updateTransfer(signed.id, {
      status: 'outbound_confirmed',
      outbound_block_id: 4,
      outbound_block_hash: 'block-hash',
      outbound_confirmation_block_id: 4
    });
    await restarted.onChainReorganization(4, 'block-hash', false);
    const reorged = (await ctx.treasury.database.getTransfers({ id: signed.id }))[0];
    expect(reorged.outbound_tx_sig).toBe(signature);
    expect(reorged.outbound_tx).toBe(signed.outbound_tx);
    expect(ctx.treasury.app.wallet.createUnsignedTransactionWithDefaultFee).toHaveBeenCalledTimes(1);
    expect(await ctx.treasury.database.getTransfers({ purpose: 'treasury-payout' })).toHaveLength(1);

    ctx.appSqlite.close();
    ctx.treasurySqlite.close();
  });

  test('local payout mode still signs and a store withdrawal is not issued', async () => {
    const sqlite = openMemory();
    const database = await databaseFor(sqlite);
    const id = await database.insertTransfer({
      purpose: 'buysaito',
      status: 'inbound_confirmed',
      recipient_publickey: BUYER,
      requester_publickey: BUYER,
      outbound_amount: '2',
      inbound_ticker: 'ETH',
      inbound_amount: '1',
      inbound_confirmation_block_id: 0,
      created_at: 1
    });
    const app = { wallet: wallet(), network: { sendRequestAsTransaction: jest.fn() } };
    const mod = {
      app,
      database,
      payout_mode: 'local',
      execution_mode: 'local'
    };
    const transfers = new Transfers(app, mod);
    const issued = await transfers.issueOutboundTransfer((await database.getTransfers({ id }))[0]);
    expect(issued.status).toBe('outbound_awaiting');
    expect(issued.outbound_tx_sig).toContain('buysaito issuance');

    const withdrawal = await transfers.issueOutboundTransfer({
      purpose: 'store-withdrawal',
      outbound_tx_sig: ''
    });
    expect(withdrawal.outbound_tx_sig).toBe('');
    sqlite.close();
  });
});
