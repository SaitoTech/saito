jest.mock('@mixin.dev/mixin-node-sdk', () => ({
  MixinApi: jest.fn()
}));

jest.mock('saito-js/lib/peer_service', () => ({
  default: class PeerService {
    constructor(data, service, name, domain) {
      this.data = data;
      this.service = service;
      this.name = name;
      this.domain = domain;
    }
  }
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
    fulfillment_mode: 'treasury',
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
    fulfillment_mode: 'local',
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
  test('legacy operation_mode values migrate into fulfillment_mode and payout_mode', () => {
    const cases = [
      { operation_mode: 'local', fulfillment_mode: 'local', payout_mode: 'local' },
      { operation_mode: 'local_remote', fulfillment_mode: 'local', payout_mode: 'remote' },
      { operation_mode: 'remote_remote', fulfillment_mode: 'remote', payout_mode: 'remote' },
      { operation_mode: 'treasury', fulfillment_mode: 'treasury', payout_mode: 'local' }
    ];
    for (const entry of cases) {
      const mixin = new Mixin({
        options: { mixin: { operation_mode: entry.operation_mode } },
        modules: { returnModule: () => null }
      });
      expect(mixin.fulfillment_mode).toBe(entry.fulfillment_mode);
      expect(mixin.payout_mode).toBe(entry.payout_mode);
      expect(mixin.operation_mode).toBeUndefined();
      expect(mixin.execution_mode).toBeUndefined();
    }
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
      fulfillment_mode: 'local',
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
      fulfillment_mode: 'local'
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

describe('mixin fulfillment_mode and payout_mode admin configuration', () => {
  function configuredMixin(options = {}) {
    const saved = { mixin: { ...(options.mixin || {}) } };
    const crypto = {
      isPublicKey(key) {
        return [APP, TREASURY, BUYER, 'delegate-one', 'delegate-two'].includes(key);
      }
    };
    const mixin = new Mixin({
      options: saved,
      modules: { returnModule: () => null },
      storage: { saveOptions() {} },
      crypto
    });
    mixin.publicKey = APP;
    mixin.app.options = saved;
    mixin.app.storage = { saveOptions() {} };
    mixin.app.crypto = crypto;
    mixin.load();
    return mixin;
  }

  async function saveConfig(mixin, data) {
    return mixin.respondTo('admin-config').updateConfig({
      action: 'save-config',
      ...data
    });
  }

  test('defaults to local fulfillment and local payouts without providers or delegates', () => {
    const mixin = configuredMixin();
    expect(mixin.fulfillment_mode).toBe('local');
    expect(mixin.payout_mode).toBe('local');
    expect(mixin.treasury_provider_publickeys).toEqual([]);
    expect(mixin.treasury_delegate_publickeys).toEqual([]);
  });

  test('all four Admin selections save and reload the exact two-variable combinations', async () => {
    const mixin = configuredMixin();
    const cases = [
      {
        fulfillment_mode: 'local',
        payout_mode: 'local',
        providers: [],
        delegates: []
      },
      {
        fulfillment_mode: 'local',
        payout_mode: 'remote',
        providers: [TREASURY],
        delegates: []
      },
      {
        fulfillment_mode: 'remote',
        payout_mode: 'remote',
        providers: [TREASURY],
        delegates: []
      },
      {
        fulfillment_mode: 'treasury',
        payout_mode: 'local',
        providers: [],
        delegates: ['delegate-one']
      }
    ];

    for (const entry of cases) {
      const saved = await saveConfig(mixin, {
        fulfillment_mode: entry.fulfillment_mode,
        payout_mode: entry.payout_mode,
        treasury_provider_publickeys: entry.providers.length ? entry.providers : [TREASURY],
        treasury_delegate_publickeys: entry.delegates.length
          ? entry.delegates
          : ['delegate-one']
      });
      expect(saved).toMatchObject({
        fulfillment_mode: entry.fulfillment_mode,
        payout_mode: entry.payout_mode,
        treasury_provider_publickeys: entry.providers,
        treasury_delegate_publickeys: entry.delegates
      });
      expect(saved.unsupported_mode_combination).toBeUndefined();
      expect(saved.admin_choice).toBeUndefined();
      expect(saved.operation_mode).toBeUndefined();
      expect(mixin.app.options.mixin).toMatchObject({
        fulfillment_mode: entry.fulfillment_mode,
        payout_mode: entry.payout_mode
      });
      expect(mixin.app.options.mixin.operation_mode).toBeUndefined();
      expect(mixin.app.options.mixin.execution_mode).toBeUndefined();
      expect(mixin.app.options.mixin.admin_choice).toBeUndefined();
      mixin.load();
      expect(mixin.fulfillment_mode).toBe(entry.fulfillment_mode);
      expect(mixin.payout_mode).toBe(entry.payout_mode);
    }
  });

  test('invalid mode combinations are rejected by the server save path', async () => {
    const mixin = configuredMixin({
      mixin: {
        fulfillment_mode: 'remote',
        payout_mode: 'local',
        treasury_provider_publickeys: [TREASURY]
      }
    });
    expect(mixin.fulfillment_mode).toBe('remote');
    expect(mixin.payout_mode).toBe('local');
    await expect(
      saveConfig(mixin, {
        fulfillment_mode: 'remote',
        payout_mode: 'local',
        treasury_provider_publickeys: [TREASURY]
      })
    ).rejects.toThrow(/Unsupported fulfillment_mode/);
    const snapshot = await mixin.respondTo('admin-config').getConfig();
    expect(snapshot).toMatchObject({
      fulfillment_mode: 'remote',
      payout_mode: 'local'
    });
    expect(snapshot.unsupported_mode_combination).toBeUndefined();
    expect(snapshot.admin_choice).toBeUndefined();
  });

  test('invalid fulfillment_mode values are preserved on load and rejected on save', async () => {
    const mixin = configuredMixin({
      mixin: {
        fulfillment_mode: 'broken',
        payout_mode: 'local'
      }
    });
    expect(mixin.fulfillment_mode).toBe('broken');
    await expect(
      saveConfig(mixin, {
        fulfillment_mode: 'broken',
        payout_mode: 'local'
      })
    ).rejects.toThrow(/Unsupported fulfillment_mode/);
  });

  test('saving local fulfillment clears provider and delegate keys', async () => {
    const mixin = configuredMixin({
      mixin: {
        fulfillment_mode: 'local',
        payout_mode: 'remote',
        treasury_provider_publickeys: [TREASURY],
        treasury_delegate_publickeys: ['delegate-one']
      }
    });
    mixin.load();
    const saved = await saveConfig(mixin, {
      fulfillment_mode: 'local',
      payout_mode: 'local',
      treasury_provider_publickeys: [TREASURY],
      treasury_delegate_publickeys: ['delegate-one']
    });
    expect(saved).toMatchObject({
      fulfillment_mode: 'local',
      payout_mode: 'local',
      treasury_provider_publickeys: [],
      treasury_delegate_publickeys: []
    });
    expect(mixin.app.options.mixin.treasury_provider_publickeys).toEqual([]);
    expect(mixin.app.options.mixin.treasury_delegate_publickeys).toEqual([]);
    expect(mixin.fulfillment_mode).toBe('local');
    expect(mixin.payout_mode).toBe('local');
  });

  test('remote payout modes require a usable treasury provider key', async () => {
    const mixin = configuredMixin();
    await expect(
      saveConfig(mixin, {
        fulfillment_mode: 'local',
        payout_mode: 'remote',
        treasury_provider_publickeys: []
      })
    ).rejects.toThrow(/Treasury provider/);
    await expect(
      saveConfig(mixin, {
        fulfillment_mode: 'remote',
        payout_mode: 'remote',
        treasury_provider_publickeys: [APP]
      })
    ).rejects.toThrow(/not this server/);
    expect(mixin.fulfillment_mode).toBe('local');
    expect(mixin.payout_mode).toBe('local');
  });

  test('valid remote payout and treasury modes persist and apply live', async () => {
    const mixin = configuredMixin();
    mixin.transfers = { processTransferQueue: jest.fn(async () => {}) };

    await expect(
      saveConfig(mixin, {
        fulfillment_mode: 'local',
        payout_mode: 'remote',
        treasury_provider_publickeys: [TREASURY, TREASURY]
      })
    ).rejects.toThrow(/duplicate/);

    const remote = await saveConfig(mixin, {
      fulfillment_mode: 'local',
      payout_mode: 'remote',
      treasury_provider_publickeys: [TREASURY],
      treasury_delegate_publickeys: ['delegate-one']
    });
    expect(remote.treasury_provider_publickeys).toEqual([TREASURY]);
    expect(remote.treasury_delegate_publickeys).toEqual([]);
    expect(mixin.fulfillment_mode).toBe('local');
    expect(mixin.payout_mode).toBe('remote');
    expect(mixin.transfer_timer).toBeTruthy();

    const fullyRemote = await saveConfig(mixin, {
      fulfillment_mode: 'remote',
      payout_mode: 'remote',
      treasury_provider_publickeys: [TREASURY]
    });
    expect(fullyRemote.fulfillment_mode).toBe('remote');
    expect(fullyRemote.payout_mode).toBe('remote');
    expect(mixin.transfer_timer).toBeNull();

    await expect(
      saveConfig(mixin, {
        fulfillment_mode: 'treasury',
        payout_mode: 'local',
        treasury_provider_publickeys: [TREASURY],
        treasury_delegate_publickeys: []
      })
    ).rejects.toThrow(/exactly one authorized delegate/);

    const treasury = await saveConfig(mixin, {
      fulfillment_mode: 'treasury',
      payout_mode: 'local',
      treasury_provider_publickeys: [TREASURY],
      treasury_delegate_publickeys: ['delegate-one']
    });
    expect(treasury).toMatchObject({
      fulfillment_mode: 'treasury',
      payout_mode: 'local',
      treasury_provider_publickeys: [],
      treasury_delegate_publickeys: ['delegate-one']
    });
    expect(mixin.transfer_timer).toBeTruthy();

    await expect(
      saveConfig(mixin, {
        fulfillment_mode: 'treasury',
        payout_mode: 'local',
        treasury_delegate_publickeys: ['delegate-one', 'delegate-two']
      })
    ).rejects.toThrow(/exactly one authorized delegate/);
    expect(mixin.treasury_delegate_publickeys).toEqual(['delegate-one']);
    expect(mixin.app.options.mixin.api_key).toBeUndefined();
  });

  test('rejects malformed and duplicate keys without changing active config', async () => {
    const mixin = configuredMixin({
      mixin: {
        fulfillment_mode: 'local',
        payout_mode: 'local'
      }
    });
    mixin.load();
    await expect(
      saveConfig(mixin, {
        fulfillment_mode: 'local',
        payout_mode: 'remote',
        treasury_provider_publickeys: ['not-a-key']
      })
    ).rejects.toThrow(/invalid Saito public key/);
    expect(mixin.fulfillment_mode).toBe('local');
    expect(mixin.app.options.mixin.fulfillment_mode).toBe('local');
    expect(mixin.app.options.mixin.treasury_provider_publickeys || []).toEqual([]);
  });

  test('startup restores the saved modes from the configuration fields', async () => {
    const mixin = configuredMixin({
      mixin: {
        fulfillment_mode: 'treasury',
        payout_mode: 'local',
        treasury_delegate_publickeys: ['delegate-one']
      }
    });
    expect(mixin.fulfillment_mode).toBe('treasury');
    expect(mixin.treasury_delegate_publickeys).toEqual(['delegate-one']);
    const snapshot = await mixin.respondTo('admin-config').getConfig();
    expect(snapshot).toMatchObject({
      fulfillment_mode: 'treasury',
      payout_mode: 'local',
      treasury_provider_publickeys: [],
      treasury_delegate_publickeys: ['delegate-one']
    });
    expect(snapshot.admin_choice).toBeUndefined();
  });

  test('legacy operation_mode configs migrate and saves drop old keys', () => {
    const mixin = configuredMixin({
      mixin: {
        operation_mode: 'remote_remote',
        execution_mode: 'remote',
        payout_mode: 'remote',
        treasury_provider_publickeys: [TREASURY]
      }
    });
    expect(mixin.fulfillment_mode).toBe('remote');
    expect(mixin.payout_mode).toBe('remote');
    mixin.save();
    expect(mixin.app.options.mixin.operation_mode).toBeUndefined();
    expect(mixin.app.options.mixin.execution_mode).toBeUndefined();
    expect(mixin.app.options.mixin.admin_choice).toBeUndefined();
    expect(mixin.app.options.mixin).toMatchObject({
      fulfillment_mode: 'remote',
      payout_mode: 'remote',
      treasury_provider_publickeys: [TREASURY]
    });
  });
});

describe('mixin load/save configuration persistence', () => {
  function persistentMixin(options = {}) {
    const saved = { mixin: { ...(options.mixin || {}) } };
    const crypto = {
      isPublicKey(key) {
        return [APP, TREASURY, BUYER, 'delegate-one', 'delegate-two'].includes(key);
      }
    };
    const mixin = new Mixin({
      options: saved,
      modules: { returnModule: () => null },
      storage: {
        saveOptions() {
          saved.mixin = { ...mixin.app.options.mixin };
        }
      },
      crypto
    });
    mixin.publicKey = APP;
    mixin.app.options = saved;
    mixin.app.crypto = crypto;
    mixin.app.storage = {
      saveOptions() {
        saved.mixin = { ...(mixin.app.options.mixin || {}) };
      }
    };
    mixin.accounts = new (require('../../../mods/mixin/lib/accounts'))(mixin.app, mixin);
    mixin.load();
    return { mixin, saved };
  }

  test('treasury settings survive credential saves, restore, backup, and reload', async () => {
    const { mixin, saved } = persistentMixin();
    await mixin.respondTo('admin-config').updateConfig({
      action: 'save-config',
      fulfillment_mode: 'remote',
      payout_mode: 'remote',
      treasury_provider_publickeys: [TREASURY]
    });
    mixin.api_key = {
      app_id: 'app-1',
      session_id: 'session-1',
      server_public_key: 'server-pub',
      session_private_key: 'app-session-key'
    };
    mixin.deposit_addresses = [{ address: '0xabc', asset_id: 'eth', balance: '1' }];
    mixin.save();

    mixin.accounts.saveCredentials({
      user_id: 'user-9',
      session_id: 'session-9',
      tip_key_base64: 'tip',
      session_seed: 'seed',
      spend_private_key: 'spend'
    });
    expect(saved.mixin).toMatchObject({
      user_id: 'user-9',
      fulfillment_mode: 'remote',
      payout_mode: 'remote',
      treasury_provider_publickeys: [TREASURY],
      treasury_delegate_publickeys: [],
      api_key: expect.objectContaining({ session_private_key: 'app-session-key' }),
      deposit_addresses: [expect.objectContaining({ address: '0xabc' })]
    });
    expect(saved.mixin.operation_mode).toBeUndefined();
    expect(saved.mixin.execution_mode).toBeUndefined();

    mixin.credentials.backed_up = true;
    mixin.accounts.saveCredentials(mixin.credentials);
    expect(saved.mixin.treasury_provider_publickeys).toEqual([TREASURY]);
    expect(saved.mixin.backed_up).toBe(true);

    const reloaded = new Mixin({
      options: { mixin: { ...saved.mixin } },
      modules: { returnModule: () => null },
      storage: { saveOptions() {} },
      crypto: mixin.app.crypto
    });
    reloaded.publicKey = APP;
    reloaded.load();
    expect(reloaded.fulfillment_mode).toBe('remote');
    expect(reloaded.payout_mode).toBe('remote');
    expect(reloaded.treasury_provider_publickeys).toEqual([TREASURY]);
    expect(reloaded.credentials.user_id).toBe('user-9');
    expect(reloaded.api_key.session_private_key).toBe('app-session-key');
    expect(reloaded.deposit_addresses[0].address).toBe('0xabc');
  });

  test('treasury mode delegate survives account restore and create-style credential replace', async () => {
    const { mixin, saved } = persistentMixin();
    await mixin.respondTo('admin-config').updateConfig({
      action: 'save-config',
      fulfillment_mode: 'treasury',
      payout_mode: 'local',
      treasury_delegate_publickeys: ['delegate-one']
    });

    mixin.credentials = {};
    mixin.account_created = 0;
    mixin.restoreAccount({
      user_id: 'user-9',
      full_name: 'Restored',
      session_id: 'session-9',
      tip_key_base64: 'tip',
      session_seed: 'seed',
      spend_private_key: 'spend',
      spend_public_key: 'spend-pub'
    });

    expect(saved.mixin).toMatchObject({
      user_id: 'user-9',
      fulfillment_mode: 'treasury',
      payout_mode: 'local',
      treasury_delegate_publickeys: ['delegate-one'],
      treasury_provider_publickeys: []
    });
    expect(saved.mixin.operation_mode).toBeUndefined();
    expect(saved.mixin.execution_mode).toBeUndefined();
  });
});

describe('treasury-backed Buy Saito service advertisement and tunneling', () => {
  const UNAVAILABLE =
    "Sorry, payment provider isn't available right now — try again later.";

  function verifiedPeer(publicKey) {
    return {
      publicKey,
      get: () => ({ is_verified: true })
    };
  }

  function unverifiedPeer(publicKey) {
    return {
      publicKey,
      get: () => ({ is_verified: false })
    };
  }

  function servicesNode() {
    const crypto = {
      isPublicKey(key) {
        return [APP, TREASURY, BUYER, 'delegate-one'].includes(key);
      }
    };
    const mixin = new Mixin({
      options: {
        mixin: {
          fulfillment_mode: 'remote',
          payout_mode: 'remote',
          treasury_provider_publickeys: [TREASURY]
        }
      },
      modules: { returnModule: () => null },
      storage: { saveOptions() {} },
      crypto,
      network: {
        getPeer: jest.fn(),
        sendTransactionWithCallback: jest.fn()
      }
    });
    mixin.publicKey = APP;
    mixin.appSession = null;
    mixin.transfers = null;
    mixin.load();
    return mixin;
  }

  function treasuryNode() {
    const crypto = {
      isPublicKey(key) {
        return [APP, TREASURY, BUYER, 'delegate-one'].includes(key);
      }
    };
    const mixin = new Mixin({
      options: {
        mixin: {
          fulfillment_mode: 'treasury',
          payout_mode: 'local',
          treasury_delegate_publickeys: [APP]
        }
      },
      modules: { returnModule: () => null },
      storage: { saveOptions() {} },
      crypto,
      network: {
        sendRequestAsTransaction: jest.fn()
      }
    });
    mixin.publicKey = TREASURY;
    mixin.appSession = { ok: true };
    mixin.transfers = {};
    mixin.crypto_mods = [
      {
        ticker: 'ETH',
        chain_id: 'eth-chain',
        price_usd: 2000,
        last_update: Date.now(),
        icon_url: '',
        returnMixinNetworkInfo: jest.fn(async () => {})
      }
    ];
    mixin.load();
    return mixin;
  }

  test('a remote services node without appSession advertises mixin and buysaito', () => {
    const mixin = servicesNode();
    const services = mixin.returnServices().map((service) => service.service);
    expect(services).toEqual(expect.arrayContaining(['mixin', 'buysaito']));
  });

  test('local mode without appSession does not advertise services', async () => {
    const mixin = servicesNode();
    await mixin.respondTo('admin-config').updateConfig({
      action: 'save-config',
      fulfillment_mode: 'local',
      payout_mode: 'local',
      treasury_provider_publickeys: [],
      treasury_delegate_publickeys: []
    });
    mixin.appSession = null;
    expect(mixin.returnServices()).toEqual([]);
  });

  test('services node tunnels buysaito available currencies and does not fall through locally', async () => {
    const mixin = servicesNode();
    const peer = verifiedPeer(TREASURY);
    mixin.app.network.getPeer.mockResolvedValue(peer);
    mixin.app.network.sendTransactionWithCallback.mockImplementation(async (tx, callback) => {
      callback({ msg: { ac: [{ ticker: 'ETH', price_usd: 2000 }], erc: 0.01 } });
    });

    const replies = [];
    const tx = {
      from: [{ publicKey: BUYER }],
      isTo: () => true,
      returnMessage: () => ({ request: 'buysaito available currencies', data: null })
    };

    const handled = await mixin.handlePeerTransaction(
      mixin.app,
      tx,
      verifiedPeer(BUYER),
      (response) => replies.push(response)
    );

    expect(handled).toBe(1);
    expect(mixin.app.network.sendTransactionWithCallback).toHaveBeenCalledWith(
      tx,
      expect.any(Function),
      TREASURY
    );
    expect(replies).toEqual([{ ac: [{ ticker: 'ETH', price_usd: 2000 }], erc: 0.01 }]);
  });

  test('unavailable treasury returns the provider-unavailable error without local execution', async () => {
    const mixin = servicesNode();
    mixin.app.network.getPeer.mockResolvedValue(null);

    const replies = [];
    const handled = await mixin.handlePeerTransaction(
      mixin.app,
      {
        from: [{ publicKey: BUYER }],
        isTo: () => true,
        returnMessage: () => ({ request: 'buysaito available currencies', data: null })
      },
      verifiedPeer(BUYER),
      (response) => replies.push(response)
    );

    expect(handled).toBe(1);
    expect(mixin.app.network.sendTransactionWithCallback).not.toHaveBeenCalled();
    expect(replies).toEqual([{ message: UNAVAILABLE, err: UNAVAILABLE }]);
  });

  test('treasury accepts a verified configured delegate and rejects an unverified claim', async () => {
    const treasury = treasuryNode();
    const replies = [];
    const tx = {
      from: [{ publicKey: BUYER }],
      isTo: () => true,
      returnMessage: () => ({ request: 'buysaito available currencies', data: null })
    };

    const accepted = await treasury.handlePeerTransaction(
      treasury.app,
      tx,
      verifiedPeer(APP),
      (response) => replies.push(response)
    );
    expect(accepted).toBe(1);
    expect(replies[0].ac).toEqual([
      expect.objectContaining({ ticker: 'ETH', price_usd: 2000 })
    ]);

    const rejected = [];
    const denied = await treasury.handlePeerTransaction(
      treasury.app,
      tx,
      unverifiedPeer(APP),
      (response) => rejected.push(response)
    );
    expect(denied).toBe(0);
    expect(rejected).toEqual([]);
  });

  test('every browser-facing Mixin request tunnels to the configured treasury', async () => {
    const mixin = servicesNode();
    const peer = verifiedPeer(TREASURY);
    mixin.app.network.getPeer.mockResolvedValue(peer);
    const forwarded = [];
    mixin.app.network.sendTransactionWithCallback.mockImplementation(async (tx, callback) => {
      forwarded.push(tx.returnMessage().request);
      callback({ msg: { ok: true, request: tx.returnMessage().request } });
    });

    const requests = [
      'buysaito available currencies',
      'buysaito reserve address',
      'buysaito release address',
      'migration request',
      'migration status',
      'migration extend',
      'mixin create account',
      'mixin save new deposit address',
      'mixin fetch user',
      'mixin account backup',
      'store-withdrawal'
    ];

    for (const request of requests) {
      const replies = [];
      const tx = {
        from: [{ publicKey: BUYER }],
        isTo: () => true,
        returnMessage: () => ({ request, data: { ticker: 'ETH', id: 1 } })
      };
      const handled = await mixin.handlePeerTransaction(
        mixin.app,
        tx,
        verifiedPeer(BUYER),
        (response) => replies.push(response)
      );
      expect(handled).toBe(1);
      expect(replies[0]).toEqual({ ok: true, request });
      expect(mixin.app.network.sendTransactionWithCallback).toHaveBeenLastCalledWith(
        tx,
        expect.any(Function),
        TREASURY
      );
    }

    expect(forwarded).toEqual(requests);
  });

  test('tunneled buysaito reserve preserves the original buyer-signed transaction', async () => {
    const mixin = servicesNode();
    mixin.app.network.getPeer.mockResolvedValue(verifiedPeer(TREASURY));
    let forwarded = null;
    mixin.app.network.sendTransactionWithCallback.mockImplementation(async (tx, callback) => {
      forwarded = tx;
      callback({ msg: { address: '0xabc' } });
    });

    const original = {
      from: [{ publicKey: BUYER }],
      signature: 'buyer-sig',
      isTo: () => true,
      returnMessage: () => ({
        request: 'buysaito reserve address',
        data: { initiator_pubkey: BUYER, ticker: 'ETH' }
      })
    };
    const replies = [];
    await mixin.handlePeerTransaction(mixin.app, original, verifiedPeer(BUYER), (response) =>
      replies.push(response)
    );

    expect(forwarded).toBe(original);
    expect(forwarded.from[0].publicKey).toBe(BUYER);
    expect(forwarded.signature).toBe('buyer-sig');
    expect(replies).toEqual([{ address: '0xabc' }]);
  });

  test('treasury accepts only the verified configured delegate for fulfillment requests', async () => {
    const treasury = treasuryNode();
    treasury.migration = {
      startMigration: jest.fn(async () => ({ address: '0xmig' }))
    };
    treasury.accounts = {
      createAccount: jest.fn(async () => ({ ciphertext: 'cipher', restored: false }))
    };
    treasury.database = {
      insertAddress: jest.fn(async () => {}),
      saveCredentials: jest.fn(async () => {}),
      findAddress: jest.fn(async () => null)
    };

    for (const request of [
      'migration request',
      'mixin create account',
      'mixin save new deposit address',
      'mixin fetch user',
      'mixin account backup'
    ]) {
      const buyerReplies = [];
      const buyerDenied = await treasury.handlePeerTransaction(
        treasury.app,
        {
          from: [{ publicKey: BUYER }],
          timestamp: Date.now(),
          isTo: () => true,
          returnMessage: () => ({
            request,
            data: { ticker: 'ETH', user_id: 'u1', publickey: BUYER, asset_id: 'a1', address: '0x1' }
          })
        },
        verifiedPeer(BUYER),
        (response) => buyerReplies.push(response)
      );
      expect(buyerDenied).toBe(0);
      expect(buyerReplies).toEqual([]);

      const strangerReplies = [];
      const stranger = await treasury.handlePeerTransaction(
        treasury.app,
        {
          from: [{ publicKey: BUYER }],
          timestamp: Date.now(),
          isTo: () => true,
          returnMessage: () => ({
            request,
            data: { ticker: 'ETH', user_id: 'u1', publickey: BUYER, asset_id: 'a1', address: '0x1' }
          })
        },
        verifiedPeer('delegate-one'),
        (response) => strangerReplies.push(response)
      );
      expect(stranger).toBe(0);
      expect(strangerReplies).toEqual([]);

      const delegateReplies = [];
      const accepted = await treasury.handlePeerTransaction(
        treasury.app,
        {
          from: [{ publicKey: BUYER }],
          timestamp: Date.now(),
          isTo: () => true,
          returnMessage: () => ({
            request,
            data: { ticker: 'ETH', user_id: 'u1', publickey: BUYER, asset_id: 'a1', address: '0x1' }
          })
        },
        verifiedPeer(APP),
        (response) => delegateReplies.push(response)
      );
      expect(accepted).toBe(1);
      expect(delegateReplies.length).toBe(1);
    }
  });

  test('services node relays treasury browser notifications to the destination', async () => {
    const mixin = servicesNode();
    mixin.app.network.sendRequestAsTransaction = jest.fn();
    const replies = [];
    const handled = await mixin.handlePeerTransaction(
      mixin.app,
      {
        from: [{ publicKey: TREASURY }],
        isTo: () => true,
        returnMessage: () => ({
          request: 'mixin treasury forwarding request',
          data: {
            destination_publickey: BUYER,
            notification_request: 'buysaito payment detected',
            notification_data: { id: 7, status: 'pending' }
          }
        })
      },
      verifiedPeer(TREASURY),
      (response) => replies.push(response)
    );

    expect(handled).toBe(1);
    expect(replies).toEqual([{ ok: true }]);
    expect(mixin.app.network.sendRequestAsTransaction).toHaveBeenCalledWith(
      'buysaito payment detected',
      { id: 7, status: 'pending' },
      null,
      BUYER
    );

    const denied = [];
    const rejected = await mixin.handlePeerTransaction(
      mixin.app,
      {
        from: [{ publicKey: TREASURY }],
        isTo: () => true,
        returnMessage: () => ({
          request: 'mixin treasury forwarding request',
          data: {
            destination_publickey: BUYER,
            notification_request: 'buysaito payment detected',
            notification_data: { id: 7 }
          }
        })
      },
      unverifiedPeer(TREASURY),
      (response) => denied.push(response)
    );
    expect(rejected).toBe(1);
    expect(denied).toEqual([{ err: 'Unauthorized treasury forwarding request.' }]);
  });

  test('treasury notifyBrowser relays through the configured delegate', () => {
    const treasury = treasuryNode();
    treasury.fulfillment_mode = 'treasury';
    treasury.treasury_delegate_publickeys = [APP];
    treasury.notifyBrowser('buysaito saito issued', { paid: 'sig-1' }, BUYER);
    expect(treasury.app.network.sendRequestAsTransaction).toHaveBeenCalledWith(
      'mixin treasury forwarding request',
      {
        destination_publickey: BUYER,
        notification_request: 'buysaito saito issued',
        notification_data: { paid: 'sig-1' }
      },
      null,
      APP
    );
  });

  test('local fulfillment with remote payouts does not tunnel buysaito requests', async () => {
    const mixin = servicesNode();
    await mixin.respondTo('admin-config').updateConfig({
      action: 'save-config',
      fulfillment_mode: 'local',
      payout_mode: 'remote',
      treasury_provider_publickeys: [TREASURY]
    });
    mixin.appSession = { ok: true };
    mixin.transfers = {};
    mixin.crypto_mods = [
      {
        ticker: 'ETH',
        chain_id: 'eth',
        price_usd: 1,
        last_update: Date.now(),
        returnMixinNetworkInfo: jest.fn(async () => {})
      }
    ];
    mixin.app.network.getPeer.mockResolvedValue(verifiedPeer(TREASURY));
    mixin.app.network.sendRequestAsTransaction = jest.fn();

    const replies = [];
    await mixin.handlePeerTransaction(
      mixin.app,
      {
        from: [{ publicKey: BUYER }],
        isTo: () => true,
        returnMessage: () => ({ request: 'buysaito available currencies', data: null })
      },
      verifiedPeer(BUYER),
      (response) => replies.push(response)
    );

    expect(mixin.app.network.sendTransactionWithCallback).not.toHaveBeenCalled();
    expect(replies[0].ac).toEqual([expect.objectContaining({ ticker: 'ETH' })]);
  });
});
