// @ts-nocheck

const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');

jest.mock('@mixin.dev/mixin-node-sdk', () => {
  const MixinApi = jest.fn((config) => ({
    config,
    utxo: {
      safeAssetBalance: jest.fn(async () => '4.5')
    },
    safe: {
      fetchSafeSnapshots: jest.fn(async () => []),
      pendingDeposits: jest.fn(async () => []),
      fetchAsset: jest.fn(async () => ({
        asset_id: 'asset',
        chain_id: 'chain',
        symbol: 'ETH',
        display_symbol: 'ETH'
      })),
      fetchFee: jest.fn(async () => [{ asset_id: 'asset', amount: '0.1' }])
    },
    network: {
      fetchAsset: jest.fn(async () => ({ confirmations: 12, price_usd: '1', icon_url: 'icon' }))
    }
  }));
  return {
    MixinApi,
    getED25519KeyPair: jest.fn(),
    base64RawURLEncode: jest.fn(),
    MixinCashier: 'cashier',
    buildSafeTransactionRecipient: jest.fn(),
    getUnspentOutputsForRecipients: jest.fn(),
    buildSafeTransaction: jest.fn(),
    encodeSafeTransaction: jest.fn(),
    signSafeTransaction: jest.fn(),
    blake3Hash: jest.fn()
  };
});

const { MixinApi } = require('@mixin.dev/mixin-node-sdk');
const Api = require('../../../mods/mixin/lib/api');
const { createUserSession, getWithdrawalFeeQuote, createAppSession } = Api;
const Accounts = require('../../../mods/mixin/lib/accounts');
const Database = require('../../../mods/mixin/lib/database');
const Mixin = require('../../../mods/mixin/mixin');
const MixinModule = require('../../../mods/mixin/lib/mixinmodule');
const Transfers = require('../../../mods/mixin/lib/transfers');
const CryptoModule = require('../../../lib/templates/cryptomodule');

const credentials = {
  user_id: 'user-1',
  session_id: 'session-1',
  tip_key_base64: 'tip',
  session_seed: 'seed',
  spend_private_key: 'spend'
};

async function openMixinDatabase() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  const sqlDir = path.join(__dirname, '../../../mods/mixin/sql');
  for (const file of ['accounts.sql', 'addresses.sql', 'transfers.sql']) {
    await db.exec(fs.readFileSync(path.join(sqlDir, file), 'utf8'));
  }
  return db;
}

function databaseFor(db) {
  const mod = { slug: 'mixin' };
  const app = {
    storage: {
      queryDatabase: (sql, params) => db.all(sql, params),
      runDatabase: (sql, params) => db.run(sql, params)
    }
  };
  return new Database(app, mod);
}

describe('Mixin api helpers', () => {
  const originalMixin = process.env.MIXIN;

  afterEach(() => {
    if (originalMixin === undefined) {
      delete process.env.MIXIN;
    } else {
      process.env.MIXIN = originalMixin;
    }
    MixinApi.mockClear();
  });

  test('createAppSession returns no session for missing or unparseable configuration', () => {
    delete process.env.MIXIN;
    expect(createAppSession()).toBeNull();

    process.env.MIXIN = '{';
    expect(createAppSession()).toBeNull();
    expect(MixinApi).not.toHaveBeenCalled();
  });

  test('createAppSession prefers the environment keystore and otherwise uses a saved keystore', () => {
    delete process.env.MIXIN;
    const saved = {
      app_id: 'saved-app',
      session_id: 'saved-session',
      server_public_key: 'saved-pub',
      session_private_key: 'saved-secret'
    };

    expect(createAppSession({ app_id: 'saved-app' })).toBeNull();
    expect(createAppSession(saved).config.keystore).toEqual(saved);

    process.env.MIXIN = JSON.stringify({
      app_id: 'env-app',
      session_id: 'env-session',
      server_public_key: 'env-pub',
      session_private_key: 'env-secret'
    });
    expect(createAppSession(saved).config.keystore.app_id).toBe('env-app');
  });

  test('createUserSession translates credentials and rejects an incomplete bundle before the SDK', () => {
    const session = createUserSession(credentials);
    expect(session.config.keystore).toEqual({
      app_id: 'user-1',
      session_id: 'session-1',
      pin_token_base64: 'tip',
      session_private_key: 'seed'
    });

    MixinApi.mockClear();
    expect(() => createUserSession({ user_id: 'user-1' })).toThrow(
      /incomplete \(missing: .*spend_private_key/
    );
    expect(MixinApi).not.toHaveBeenCalled();
  });

  test('getWithdrawalFeeQuote prefers the withdrawal asset, then the chain asset, then a sole quote', () => {
    expect(
      getWithdrawalFeeQuote(
        [
          { asset_id: 'chain', amount: '2' },
          { asset_id: 'asset', amount: '1' }
        ],
        'asset',
        'chain'
      )
    ).toEqual({ asset_id: 'asset', amount: '1' });

    expect(
      getWithdrawalFeeQuote(
        [
          { asset_id: 'chain', amount: '2' },
          { asset_id: 'other', amount: '9' }
        ],
        'asset',
        'chain'
      )
    ).toEqual({ asset_id: 'chain', amount: '2' });

    expect(getWithdrawalFeeQuote({ asset_id: 'other', amount: '3' }, 'asset', 'chain')).toEqual({
      asset_id: 'other',
      amount: '3'
    });

    expect(
      getWithdrawalFeeQuote(
        [
          { asset_id: 'a', amount: '1' },
          { asset_id: 'b', amount: '2' }
        ],
        'asset',
        'chain'
      )
    ).toBeNull();
  });

  test('fetch methods pass the supplied credentials to the user session', async () => {
    const api = new Api();
    await api.fetchBalance(credentials, 'asset-id');
    await api.fetchHistory(credentials, 'asset-id', 50);
    await api.fetchDeposits(credentials, 'asset-id', '0xabc');

    const keystores = MixinApi.mock.calls.map((call) => call[0].keystore);
    expect(keystores.every((keystore) => keystore.app_id === 'user-1')).toBe(true);
    expect(keystores.every((keystore) => keystore.session_private_key === 'seed')).toBe(true);
  });

  test('fetchAsset reads the public network asset with the application session', async () => {
    process.env.MIXIN = JSON.stringify({
      app_id: 'app-1',
      session_id: '7ca007b2-e237-4bcb-89b1-8ff89fc24fc3',
      server_public_key: 'server-pub',
      session_private_key: 'app-session-key'
    });
    const api = new Api();

    await expect(api.fetchAsset('asset-id')).resolves.toEqual({
      confirmations: 12,
      price_usd: '1',
      icon_url: 'icon'
    });

    expect(MixinApi).toHaveBeenCalledWith({
      keystore: {
        app_id: 'app-1',
        session_id: '7ca007b2-e237-4bcb-89b1-8ff89fc24fc3',
        server_public_key: 'server-pub',
        session_private_key: 'app-session-key'
      }
    });
    const session = MixinApi.mock.results.at(-1).value;
    expect(session.network.fetchAsset).toHaveBeenCalledWith('asset-id');
    expect(session.safe.fetchAsset).not.toHaveBeenCalled();
  });

  test('fetchAsset does not call Mixin when the application session is missing', async () => {
    delete process.env.MIXIN;
    const api = new Api();
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});

    await expect(api.fetchAsset('asset-id')).resolves.toBe(false);

    expect(MixinApi).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining('Mixin application session is not configured')
    );
    error.mockRestore();
  });
});

describe('Mixin accounts and database', () => {
  test('createAccount is idempotent and round-trips the encrypted bundle', async () => {
    const db = await openMixinDatabase();
    const database = databaseFor(db);
    const created = [];
    const mod = {
      publicKey: 'saito-key',
      database,
      api: {
        createAccount: jest.fn(async (displayName) => {
          created.push(displayName);
          return { ...credentials, full_name: displayName };
        })
      }
    };
    const app = {
      options: {},
      storage: { saveOptions() {} },
      crypto: {
        encryptWithPublicKey(buf, publicKey) {
          return Buffer.from(`enc:${publicKey}:${buf.toString('utf8')}`);
        },
        decryptWithPrivateKey(buf) {
          const text = buf.toString('utf8');
          return Buffer.from(text.slice(text.indexOf('{')));
        }
      }
    };
    const accounts = new Accounts(app, mod);

    const first = await accounts.createAccount('saito-key');
    const second = await accounts.createAccount('saito-key');

    expect(first.restored).toBe(false);
    expect(second).toEqual({
      ciphertext: first.ciphertext,
      restored: true,
      user_id: 'user-1'
    });
    expect(mod.api.createAccount).toHaveBeenCalledTimes(1);
    expect(accounts.decryptCredentials(first.ciphertext, 'private')).toMatchObject({
      user_id: 'user-1',
      full_name: 'Saito User saito-key'
    });
  });

  test('deprecated credentials are not assigned during initialization', async () => {
    const setPreferredCrypto = jest.fn(async () => {});
    const app = {
      BROWSER: 0,
      options: {
        mixin: {
          user_id: 'old-user',
          pin_token_base64: 'legacy-pin',
          session_id: 'session',
          session_seed: 'seed'
        }
      },
      storage: {
        saveOptions() {},
        returnFileSystem: () => null,
        queryDatabase: async () => [],
        runDatabase: async () => ({})
      },
      wallet: {
        getPublicKey: async () => 'saito-key',
        setPreferredCrypto
      },
      connection: { on() {} },
      modules: { respondTo: () => [], mods: [] }
    };
    const mixin = new Mixin(app);

    await mixin.initialize(app);

    expect(mixin.credentials).toEqual({});
    expect(mixin.account_created).toBe(0);
    expect(app.options.mixin).toEqual({});
    expect(app.options.mixin_legacy.pin_token_base64).toBe('legacy-pin');
    expect(setPreferredCrypto).toHaveBeenCalledWith('SAITO', 1);
  });

  test('findAddress returns the newest row for a user, public key, or chain address', async () => {
    const db = await openMixinDatabase();
    const database = databaseFor(db);
    await database.insertAddress({
      mixinUserId: 'user-1',
      publicKey: 'saito-key',
      assetId: 'eth',
      address: '0xold',
      createdAt: 10
    });
    await database.insertAddress({
      mixinUserId: 'user-1',
      publicKey: 'saito-key',
      assetId: 'eth',
      address: '0xnew',
      createdAt: 20
    });
    await database.insertAddress({
      mixinUserId: 'user-2',
      publicKey: 'other-key',
      assetId: 'eth',
      address: '0xother',
      createdAt: 30
    });

    await expect(
      database.findAddress({ assetId: 'eth', mixinUserId: 'user-1' })
    ).resolves.toMatchObject({
      address: '0xnew'
    });
    await expect(
      database.findAddress({ assetId: 'eth', publicKey: 'saito-key' })
    ).resolves.toMatchObject({
      address: '0xnew'
    });
    await expect(
      database.findAddress({ assetId: 'eth', address: '0xother' })
    ).resolves.toMatchObject({
      user_id: 'user-2'
    });
  });

  test('startup does not send a transfer', async () => {
    const db = await openMixinDatabase();
    const sendToUser = jest.spyOn(Api.prototype, 'sendToUser');
    const sendToAddress = jest.spyOn(Api.prototype, 'sendToAddress');
    const app = {
      BROWSER: 0,
      options: { mixin: credentials },
      storage: {
        saveOptions() {},
        returnFileSystem: () => null,
        queryDatabase: async (sql, params) => {
          try {
            return await db.all(sql, params);
          } catch (err) {
            return [];
          }
        },
        runDatabase: (sql, params) => db.run(sql, params)
      },
      wallet: { getPublicKey: async () => 'saito-key', setPreferredCrypto: async () => {} },
      connection: { on() {} },
      modules: { respondTo: () => [], mods: [] }
    };

    delete process.env.MIXIN;
    const mixin = new Mixin(app);
    await mixin.initialize(app);

    expect(sendToUser).not.toHaveBeenCalled();
    expect(sendToAddress).not.toHaveBeenCalled();
    sendToUser.mockRestore();
    sendToAddress.mockRestore();
  });
});

describe('Mixin transfer queue', () => {
  function credentialApp() {
    return {
      options: {},
      storage: { saveOptions() {} },
      wallet: { getPrivateKey: async () => 'private' },
      crypto: {
        encryptWithPublicKey(buf, publicKey) {
          return Buffer.from(`enc:${publicKey}:${buf.toString('utf8')}`);
        },
        decryptWithPrivateKey(buf) {
          const text = buf.toString('utf8');
          return Buffer.from(text.slice(text.indexOf('{')));
        }
      }
    };
  }

  test('an additional Mixin account can be stored for the same Saito key', async () => {
    const db = await openMixinDatabase();
    const database = databaseFor(db);
    let count = 0;
    const mod = {
      publicKey: 'saito-key',
      database,
      api: {
        createAccount: jest.fn(async () => {
          count += 1;
          return { ...credentials, user_id: `user-${count}` };
        })
      }
    };
    const accounts = new Accounts(credentialApp(), mod);

    await accounts.createAccount('saito-key');
    const extra = await accounts.createAccount('saito-key', { additional: true });
    const ordinary = await accounts.createAccount('saito-key');

    expect(extra).toMatchObject({ restored: false, user_id: 'user-2' });
    expect(ordinary).toMatchObject({ restored: true, user_id: 'user-1' });
    expect(mod.api.createAccount).toHaveBeenCalledTimes(2);
    await expect(database.getCredentials('saito-key', 'user-2')).resolves.toBe(extra.ciphertext);
    await expect(database.getCredentials('saito-key')).resolves.toHaveLength(2);
  });

  test('an existing one-key accounts table is migrated before a second Mixin user is saved', async () => {
    const db = await open({ filename: ':memory:', driver: sqlite3.Database });
    await db.exec(`CREATE TABLE accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      publickey TEXT NOT NULL UNIQUE,
      ciphertext TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT 0
    )`);
    await db.run(
      `INSERT INTO accounts (publickey, ciphertext, created_at) VALUES ('saito-key', 'old', 1)`
    );
    const database = databaseFor(db);

    await database.ensureAccountsSchema();
    await database.saveCredentials('saito-key', 'second', 'user-2');

    const rows = await database.getCredentials('saito-key');
    expect(rows.map((row) => row.user_id)).toEqual(['', 'user-2']);
    expect(rows[0].ciphertext).toBe('old');
  });

  test('old transfer statuses are rewritten and a deposit observation advances the row', async () => {
    const db = await open({ filename: ':memory:', driver: sqlite3.Database });
    await db.exec(
      fs.readFileSync(path.join(__dirname, '../../../mods/mixin/sql/accounts.sql'), 'utf8')
    );
    await db.exec(`CREATE TABLE transfers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      status TEXT NOT NULL DEFAULT 'awaiting_inbound',
      created_at INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL DEFAULT 0
    )`);
    await db.run(
      `INSERT INTO transfers (status, created_at, updated_at) VALUES ('inbound_pending', 5, 5)`
    );
    const database = databaseFor(db);
    database.app.storage.executeDatabase = (sql) => db.exec(sql);

    await database.ensureTransfersSchema();

    const migrated = await database.getTransfers({ status: 'inbound_broadcast' });
    expect(migrated).toHaveLength(1);
    expect(migrated[0].mode).toBe('automatic');

    const id = await database.insertTransfer({
      purpose: 'buysaito',
      status: 'inbound_awaiting',
      requester_publickey: 'payer',
      inbound_ticker: 'ETH',
      inbound_asset_id: 'asset',
      inbound_amount: '1',
      inbound_address: '0xabc',
      inbound_mixin_user_id: 'user-1',
      inbound_confirmations_required: 12,
      created_at: Date.now()
    });
    const sent = jest.fn();
    const transfers = new Transfers(
      {
        wallet: { getPrivateKey: async () => 'private' },
        network: { sendRequestAsTransaction: sent },
        connection: { emit: jest.fn() },
        blockchain: { getLatestBlockId: async () => 3 }
      },
      {
        publicKey: 'saito-key',
        database,
        accounts: {
          getCredentials: () => credentials,
          decryptCredentials: () => credentials
        },
        api: {
          fetchDeposits: jest.fn(async () => [
            { amount: '1', confirmations: 1, transaction_hash: 'hash-1', status: 'pending' }
          ]),
          fetchHistory: jest.fn(async () => [])
        }
      }
    );

    let release;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    const original = database.getTransfers.bind(database);
    let calls = 0;
    database.getTransfers = async (...args) => {
      calls += 1;
      if (calls === 1) {
        await gate;
      }
      return original(...args);
    };

    const first = transfers.processTransferQueue();
    await Promise.resolve();
    const second = transfers.processTransferQueue();
    await second;
    expect(transfers.running).toBe(true);
    release();
    await first;

    expect(transfers.running).toBe(false);
    const row = (await original({ id }))[0];
    expect(row.status).toBe('inbound_broadcast');
    expect(row.inbound_tx_hash).toBe('hash-1');
    expect(row.inbound_confirmations).toBe(1);
    expect(sent).toHaveBeenCalledWith(
      'buysaito payment detected',
      expect.objectContaining({ id, status: 'pending', address: '0xabc' }),
      null,
      'payer'
    );
  });

  test('a reorg returns the saved outbound transaction to outbound_awaiting', async () => {
    const db = await openMixinDatabase();
    const database = databaseFor(db);
    await database.insertTransfer({
      purpose: 'buysaito',
      status: 'outbound_broadcast',
      requester_publickey: 'payer',
      outbound_tx: 'saved-tx',
      outbound_tx_sig: 'saved-sig',
      outbound_block_id: 4,
      outbound_block_hash: 'block-hash',
      outbound_confirmation_block_id: 4,
      created_at: Date.now()
    });
    const transfers = new Transfers(
      {
        wallet: { getPrivateKey: async () => 'private', addTransactionToPending: jest.fn() },
        network: { sendRequestAsTransaction: jest.fn(), propagateTransaction: jest.fn() },
        connection: { emit: jest.fn() },
        blockchain: {
          getLatestBlockId: async () => 4,
          getLongestChainHashAtId: async () => 'block-hash'
        }
      },
      {
        publicKey: 'saito-key',
        database,
        accounts: { getCredentials: () => ({}), decryptCredentials: () => ({}) },
        api: { fetchDeposits: jest.fn(async () => []), fetchHistory: jest.fn(async () => []) }
      }
    );

    await transfers.onChainReorganization(4, 'block-hash', false);

    const row = (await database.getTransfers({ status: 'outbound_awaiting' }))[0];
    expect(row.outbound_tx_sig).toBe('saved-sig');
    expect(row.outbound_tx).toBe('saved-tx');
    expect(row.outbound_block_hash).toBe('');
    expect(transfers.app.network.propagateTransaction).not.toHaveBeenCalled();
  });

  test('a new transfer defaults to automatic and an existing row receives that default', async () => {
    const fresh = await openMixinDatabase();
    const freshDatabase = databaseFor(fresh);
    const freshId = await freshDatabase.insertTransfer({
      purpose: 'buysaito',
      status: 'inbound_awaiting',
      created_at: 1
    });

    expect((await freshDatabase.getTransfers({ id: freshId }))[0].mode).toBe('automatic');

    const db = await open({ filename: ':memory:', driver: sqlite3.Database });
    await db.exec(`CREATE TABLE transfers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      purpose TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'inbound_awaiting'
        CHECK (status IN (
          'inbound_awaiting',
          'inbound_broadcast',
          'inbound_confirmed',
          'outbound_awaiting',
          'outbound_broadcast',
          'outbound_confirmed',
          'succeeded',
          'failed',
          'cancelled',
          'other'
        )),
      created_at INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL DEFAULT 0
    )`);
    await db.run(
      `INSERT INTO transfers (purpose, status, created_at, updated_at)
       VALUES ('buysaito', 'inbound_confirmed', 1, 1)`
    );
    const database = databaseFor(db);

    await database.ensureTransfersSchema();

    expect(await db.get(`SELECT mode, purpose, status FROM transfers WHERE id = 1`)).toEqual({
      mode: 'automatic',
      purpose: 'buysaito',
      status: 'inbound_confirmed'
    });
  });

  test('the automatic queue leaves manual transfers untouched', async () => {
    const db = await openMixinDatabase();
    const database = databaseFor(db);
    const now = Date.now();
    const insert = (row) => database.insertTransfer({ purpose: 'buysaito', created_at: now, ...row });
    await insert({ mode: 'automatic', status: 'inbound_awaiting', created_at: 1 });
    await insert({
      mode: 'manual',
      status: 'inbound_awaiting',
      created_at: 1,
      inbound_address: '0xmanual',
      inbound_amount: '1',
      inbound_asset_id: 'asset',
      inbound_mixin_user_id: 'user-1'
    });
    await insert({
      mode: 'manual',
      status: 'inbound_broadcast',
      inbound_address: '0xmanual-broadcast',
      inbound_amount: '1',
      inbound_asset_id: 'asset',
      inbound_mixin_user_id: 'user-1',
      inbound_tx_hash: 'manual-hash',
      inbound_confirmations: 12,
      inbound_confirmations_required: 1
    });
    await insert({
      mode: 'manual',
      status: 'inbound_confirmed',
      requester_publickey: 'manual-user',
      recipient_publickey: 'manual-user',
      outbound_amount: '10'
    });
    await insert({
      mode: 'automatic',
      status: 'inbound_confirmed',
      requester_publickey: 'auto-user',
      recipient_publickey: 'auto-user',
      outbound_amount: '10',
      inbound_confirmation_block_id: 4
    });
    await insert({
      mode: 'manual',
      status: 'outbound_awaiting',
      outbound_tx: 'manual-tx',
      outbound_tx_sig: 'manual-sig'
    });
    await insert({
      mode: 'automatic',
      status: 'outbound_awaiting',
      outbound_tx: 'auto-tx',
      outbound_tx_sig: 'auto-sig'
    });
    await insert({
      mode: 'manual',
      status: 'outbound_broadcast',
      outbound_tx_sig: 'manual-confirmed-sig',
      outbound_block_id: 1,
      outbound_block_hash: 'old-block',
      outbound_confirmation_block_id: 1
    });

    const propagate = jest.fn(async () => {});
    const createUnsigned = jest.fn(async () => ({
      async sign() {
        this.signature = 'issued-sig';
      },
      serialize_to_web() {
        return 'issued-tx';
      }
    }));
    const transfers = new Transfers(
      {
        wallet: {
          getPrivateKey: async () => 'private',
          getBalance: async () => 10000000000n,
          convertSaitoToNolan: () => 1000000000n,
          createUnsignedTransactionWithDefaultFee: createUnsigned,
          addTransactionToPending: jest.fn(async () => {})
        },
        network: { sendRequestAsTransaction: jest.fn(), propagateTransaction: propagate },
        connection: { emit: jest.fn() },
        blockchain: {
          getLatestBlockId: async () => 4,
          getLongestChainHashAtId: async () => 'block-hash',
          loadBlockAsync: async () => ({
            id: 4,
            hash: 'block-hash',
            transactions: [{ signature: 'auto-sig' }, { signature: 'manual-sig' }]
          })
        }
      },
      {
        publicKey: 'saito-key',
        database,
        accounts: { getCredentials: () => credentials, decryptCredentials: () => credentials },
        api: {
          fetchDeposits: jest.fn(async () => [
            {
              amount: '100',
              confirmations: 100,
              transaction_hash: 'should-not-apply',
              status: 'confirmed',
              sender: 'stranger'
            }
          ]),
          fetchHistory: jest.fn(async () => [
            {
              amount: '100',
              confirmations: 100,
              transaction_hash: 'should-not-apply',
              snapshot_id: 'snap',
              deposit: { destination: '0xmanual-broadcast', sender: 'stranger' }
            }
          ])
        }
      }
    );

    await transfers.processTransferQueue();

    const manual = async (status) =>
      (await database.getTransfers({ status, mode: 'manual' })).map((row) => ({
        status: row.status,
        inbound_tx_hash: row.inbound_tx_hash,
        inbound_confirmations: row.inbound_confirmations,
        outbound_tx: row.outbound_tx,
        outbound_tx_sig: row.outbound_tx_sig,
        outbound_block_hash: row.outbound_block_hash,
        last_error: row.last_error
      }));

    expect(await manual('inbound_awaiting')).toEqual([
      expect.objectContaining({ status: 'inbound_awaiting', last_error: '' })
    ]);
    expect(await manual('inbound_broadcast')).toEqual([
      expect.objectContaining({
        status: 'inbound_broadcast',
        inbound_tx_hash: 'manual-hash',
        inbound_confirmations: 12
      })
    ]);
    expect(await manual('inbound_confirmed')).toEqual([
      expect.objectContaining({ status: 'inbound_confirmed', outbound_tx_sig: '', outbound_tx: '' })
    ]);
    expect(await manual('outbound_confirmed')).toEqual([
      expect.objectContaining({
        outbound_tx: 'manual-tx',
        outbound_tx_sig: 'manual-sig',
        outbound_block_hash: 'block-hash'
      })
    ]);
    expect(await manual('outbound_awaiting')).toEqual([
      expect.objectContaining({
        status: 'outbound_awaiting',
        outbound_tx_sig: 'manual-confirmed-sig',
        outbound_block_hash: '',
        last_error: 'Transaction.Type is not a constructor'
      })
    ]);
    expect(await manual('outbound_broadcast')).toEqual([]);
    expect(await database.getTransfers({ status: 'failed', mode: 'manual' })).toEqual([]);

    const expired = await database.getTransfers({ status: 'failed', mode: 'automatic' });
    expect(expired).toHaveLength(1);
    const issued = await database.getTransfers({ requester_publickey: 'auto-user' });
    expect(issued[0]).toEqual(
      expect.objectContaining({
        mode: 'automatic',
        status: 'outbound_awaiting',
        outbound_tx_sig: 'issued-sig',
        outbound_tx: 'issued-tx'
      })
    );
    const recovered = await db.get(
      `SELECT status, outbound_block_hash, mode FROM transfers WHERE outbound_tx_sig = 'auto-sig'`
    );
    expect(recovered).toEqual({
      status: 'outbound_confirmed',
      outbound_block_hash: 'block-hash',
      mode: 'automatic'
    });
    expect(createUnsigned).toHaveBeenCalledTimes(1);
    expect(createUnsigned).toHaveBeenCalledWith('auto-user', 1000000000n);
    expect(propagate).not.toHaveBeenCalled();
  });

  test('issuance waits for a real block id and does not select manual or early rows', async () => {
    const db = await openMixinDatabase();
    const database = databaseFor(db);
    const now = Date.now();
    await database.insertTransfer({
      purpose: 'buysaito',
      mode: 'automatic',
      status: 'inbound_confirmed',
      requester_publickey: 'ready',
      recipient_publickey: 'ready',
      outbound_amount: '10',
      inbound_confirmation_block_id: 4,
      created_at: now
    });
    await database.insertTransfer({
      purpose: 'buysaito',
      mode: 'automatic',
      status: 'inbound_confirmed',
      requester_publickey: 'early',
      recipient_publickey: 'early',
      outbound_amount: '10',
      inbound_confirmation_block_id: 5,
      created_at: now
    });
    await database.insertTransfer({
      purpose: 'migration',
      mode: 'manual',
      status: 'inbound_confirmed',
      requester_publickey: 'manual-user',
      recipient_publickey: 'manual-user',
      outbound_amount: '4',
      inbound_confirmation_block_id: 4,
      created_at: now
    });
    const createUnsigned = jest.fn(async () => ({
      async sign() {
        this.signature = 'issued-sig';
      },
      serialize_to_web() {
        return 'issued-tx';
      }
    }));
    const appFor = (getLatestBlockId) => ({
      wallet: {
        getPrivateKey: async () => 'private',
        getBalance: async () => 10000000000n,
        convertSaitoToNolan: () => 1000000000n,
        createUnsignedTransactionWithDefaultFee: createUnsigned,
        addTransactionToPending: jest.fn(async () => {})
      },
      network: { sendRequestAsTransaction: jest.fn(), propagateTransaction: jest.fn() },
      connection: { emit: jest.fn() },
      blockchain: getLatestBlockId ? { getLatestBlockId, getLongestChainHashAtId: async () => '' } : {}
    });
    const mod = {
      publicKey: 'saito-key',
      database,
      accounts: { getCredentials: () => credentials, decryptCredentials: () => credentials },
      api: { fetchDeposits: jest.fn(async () => []), fetchHistory: jest.fn(async () => []) }
    };

    await new Transfers(appFor(async () => 4), mod).processTransferQueue();

    expect((await database.getTransfers({ requester_publickey: 'ready' }))[0].outbound_tx_sig).toBe(
      'issued-sig'
    );
    expect((await database.getTransfers({ requester_publickey: 'early' }))[0]).toEqual(
      expect.objectContaining({ status: 'inbound_confirmed', outbound_tx_sig: '' })
    );
    expect((await database.getTransfers({ requester_publickey: 'manual-user' }))[0].outbound_tx_sig).toBe(
      ''
    );
    expect(createUnsigned).toHaveBeenCalledTimes(1);

    await database.insertTransfer({
      purpose: 'buysaito',
      mode: 'automatic',
      status: 'inbound_confirmed',
      requester_publickey: 'blocked',
      recipient_publickey: 'blocked',
      outbound_amount: '10',
      inbound_confirmation_block_id: 4,
      created_at: now
    });
    await new Transfers(appFor(null), mod).processTransferQueue();
    await new Transfers(appFor(async () => null), mod).processTransferQueue();
    expect((await database.getTransfers({ requester_publickey: 'blocked' }))[0]).toEqual(
      expect.objectContaining({ status: 'inbound_confirmed', outbound_tx_sig: '' })
    );
    expect(createUnsigned).toHaveBeenCalledTimes(1);
  });

  test('admin transfer search is paged in the database and exclusion leaves signed rows reconcilable', async () => {
    const db = await openMixinDatabase();
    const database = databaseFor(db);
    const chain = '0x' + 'ab'.repeat(20);
    for (let index = 1; index <= 21; index += 1) {
      await database.insertTransfer({
        purpose: index % 2 === 0 ? 'migration' : 'buysaito',
        mode: 'automatic',
        status: 'inbound_awaiting',
        requester_publickey: `owner-${index}`,
        created_at: index
      });
    }
    await database.insertTransfer({
      purpose: 'migration',
      mode: 'automatic',
      status: 'failed',
      requester_publickey: 'lookup-owner',
      inbound_sender: chain.toUpperCase(),
      outbound_address: chain.toLowerCase(),
      created_at: 100
    });
    await database.insertTransfer({
      purpose: 'buysaito',
      mode: 'automatic',
      status: 'outbound_confirmed',
      recipient_publickey: 'lookup-owner',
      outbound_sender: chain,
      created_at: 101
    });
    const hiddenId = await database.insertTransfer({
      purpose: 'buysaito',
      mode: 'automatic',
      status: 'inbound_confirmed',
      requester_publickey: 'hidden-owner',
      recipient_publickey: 'hidden-owner',
      outbound_amount: '10',
      inbound_tx_hash: 'hidden-hash',
      outbound_tx_sig: '',
      inbound_confirmation_block_id: 4,
      created_at: 200
    });
    await database.updateTransfer(hiddenId, { excluded: 1 });
    const signedId = await database.insertTransfer({
      purpose: 'migration',
      mode: 'automatic',
      status: 'outbound_awaiting',
      requester_publickey: 'signed-owner',
      outbound_tx: 'saved-tx',
      outbound_tx_sig: 'saved-sig',
      inbound_tx_hash: 'kept-hash',
      outbound_amount: '3',
      created_at: 201
    });
    await database.updateTransfer(signedId, { excluded: 1 });

    const first = await database.listAdminTransfers({ page: 1 });
    const second = await database.listAdminTransfers({ page: 2 });
    expect(first.page_size).toBe(20);
    expect(first.total).toBe(21);
    expect(first.rows).toHaveLength(20);
    expect(first.rows.map((row) => row.created_at)).toEqual(
      Array.from({ length: 20 }, (_value, index) => 21 - index)
    );
    expect(second.rows.map((row) => row.id)).toEqual([1]);
    expect(first.rows.some((row) => row.requester_publickey === 'hidden-owner')).toBe(false);

    const byKey = await database.listAdminTransfers({ search: 'lookup-owner' });
    expect(byKey.total).toBe(2);
    expect(new Set(byKey.rows.map((row) => row.id)).size).toBe(byKey.rows.length);
    expect(byKey.rows.map((row) => row.purpose).sort()).toEqual(['buysaito', 'migration']);

    const byAddress = await database.listAdminTransfers({ search: chain.toUpperCase() });
    expect(byAddress.total).toBe(2);
    expect(byAddress.rows.map((row) => row.id).sort()).toEqual(
      byKey.rows.map((row) => row.id).sort()
    );

    const transfers = new Transfers(
      {
        wallet: {
          getPrivateKey: async () => 'private',
          getBalance: async () => 10000000000n,
          convertSaitoToNolan: () => 1000000000n,
          createUnsignedTransactionWithDefaultFee: jest.fn(async () => ({
            async sign() {
              this.signature = 'new-sig';
            },
            serialize_to_web() {
              return 'new-tx';
            }
          })),
          addTransactionToPending: jest.fn(async () => {})
        },
        network: { sendRequestAsTransaction: jest.fn(), propagateTransaction: jest.fn() },
        connection: { emit: jest.fn() },
        blockchain: { getLatestBlockId: async () => 4, getLongestChainHashAtId: async () => '' }
      },
      {
        publicKey: 'saito-key',
        database,
        accounts: { getCredentials: () => ({}), decryptCredentials: () => ({}) },
        api: { fetchDeposits: jest.fn(async () => []), fetchHistory: jest.fn(async () => []) }
      }
    );
    await transfers.processTransferQueue();

    const hidden = (await database.getTransfers({ id: hiddenId }))[0];
    expect(hidden).toEqual(
      expect.objectContaining({
        excluded: 1,
        status: 'inbound_confirmed',
        outbound_tx_sig: '',
        inbound_tx_hash: 'hidden-hash'
      })
    );
    const signed = (await database.getTransfers({ id: signedId }))[0];
    expect(signed.outbound_tx_sig).toBe('saved-sig');
    expect(signed.inbound_tx_hash).toBe('kept-hash');
    const reconcilable = await database.getTransfersPendingOutboundBroadcast();
    expect(reconcilable.map((row) => row.id)).toContain(signedId);
    expect(transfers.app.wallet.createUnsignedTransactionWithDefaultFee).not.toHaveBeenCalled();
  });

  test('saved payouts are recovered and reorged for both transfer modes', async () => {
    const db = await openMixinDatabase();
    const database = databaseFor(db);
    const now = Date.now();
    await database.insertTransfer({
      purpose: 'buysaito',
      mode: 'automatic',
      status: 'outbound_awaiting',
      outbound_tx_sig: 'shared-sig',
      outbound_tx: 'auto-tx',
      created_at: now
    });
    await database.insertTransfer({
      purpose: 'buysaito',
      mode: 'manual',
      status: 'outbound_awaiting',
      outbound_tx_sig: 'shared-sig',
      outbound_tx: 'manual-tx',
      created_at: now
    });
    await database.insertTransfer({
      purpose: 'buysaito',
      mode: 'manual',
      status: 'outbound_broadcast',
      outbound_tx_sig: 'manual-reorg-sig',
      outbound_tx: 'manual-reorg-tx',
      outbound_block_id: 4,
      outbound_block_hash: 'block-hash',
      outbound_confirmation_block_id: 4,
      created_at: now
    });
    const transfers = new Transfers(
      {
        wallet: { getPrivateKey: async () => 'private', addTransactionToPending: jest.fn() },
        network: { sendRequestAsTransaction: jest.fn(), propagateTransaction: jest.fn() },
        connection: { emit: jest.fn() },
        blockchain: {
          getLatestBlockId: async () => 4,
          getLongestChainHashAtId: async () => '',
          loadBlockAsync: async () => null
        }
      },
      {
        publicKey: 'saito-key',
        database,
        accounts: { getCredentials: () => ({}), decryptCredentials: () => ({}) },
        api: { fetchDeposits: jest.fn(async () => []), fetchHistory: jest.fn(async () => []) }
      }
    );

    await transfers.onNewBlock(
      { id: 8, hash: 'live-block', transactions: [{ signature: 'shared-sig' }] },
      true
    );

    const awaiting = await database.getTransfers({ status: 'outbound_awaiting' });
    expect(awaiting.map((row) => row.outbound_tx_sig)).toEqual(['manual-reorg-sig']);
    const included = await database.getTransfers({ status: 'outbound_broadcast' });
    expect(included).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          mode: 'automatic',
          outbound_tx_sig: 'shared-sig',
          outbound_block_hash: 'live-block'
        }),
        expect.objectContaining({
          mode: 'manual',
          outbound_tx_sig: 'shared-sig',
          outbound_block_hash: 'live-block'
        })
      ])
    );

    await transfers.onChainReorganization(4, 'block-hash', false);

    const manualReorg = (
      await db.all(`SELECT * FROM transfers WHERE outbound_tx_sig = 'manual-reorg-sig'`)
    )[0];
    expect(manualReorg).toEqual(
      expect.objectContaining({
        mode: 'manual',
        status: 'outbound_awaiting',
        outbound_block_hash: '',
        outbound_block_id: null
      })
    );
    expect(String(manualReorg.last_error)).toContain('Transaction.Type is not a constructor');
  });
});

describe('Mixin ticker module', () => {
  test('returnMixinNetworkInfo loads the public asset price without user credentials', async () => {
    const crypto = Object.create(MixinModule.prototype);
    crypto.asset_id = 'asset-id';
    crypto.mixin = {
      accounts: { getCredentials: jest.fn(() => ({ user_id: 'should-not-be-used' })) },
      api: {
        fetchAsset: jest.fn(async () => ({
          confirmations: 3,
          price_usd: '2.5',
          icon_url: 'icon'
        }))
      }
    };

    const info = await crypto.returnMixinNetworkInfo();

    expect(crypto.mixin.api.fetchAsset).toHaveBeenCalledWith('asset-id');
    expect(crypto.mixin.accounts.getCredentials).not.toHaveBeenCalled();
    expect(info.price_usd).toBe('2.5');
    expect(crypto.price_usd).toBe(2.5);
    expect(crypto.confirmations).toBe(3);
    expect(crypto.icon_url).toBe('icon');
    expect(crypto.last_update).toEqual(expect.any(Number));
  });

  test('fetchHistory appends a ledger event and emits the payment', async () => {
    const crypto = Object.create(MixinModule.prototype);
    crypto.ticker = 'ETH';
    crypto.asset_id = 'asset-id';
    crypto.publicKey = 'saito-key';
    crypto.address = '0xme';
    crypto.history = [];
    crypto.history_update_ts = 0;
    crypto.isActivated = () => true;
    crypto.getSaitoPublicKey = () => false;
    crypto.lookupPublicKey = async () => '';
    crypto.processAddress = async (address) => address;
    crypto.formatAddress = () => '0xme|user-1|mixin';
    crypto.save = jest.fn();
    crypto.app = { connection: { emit: jest.fn() } };
    crypto.mixin = {
      accounts: { getCredentials: () => credentials },
      api: {
        fetchHistory: jest.fn(async () => [
          {
            snapshot_id: 'snap',
            amount: '1.25',
            created_at: '2026-01-02T00:00:00.000Z',
            transaction_hash: 'hash-1',
            opponent_id: 'user-2'
          }
        ])
      }
    };

    const fetched = await crypto.fetchHistory();

    expect(fetched).toHaveLength(1);
    expect(crypto.app.connection.emit).toHaveBeenCalledWith(
      'on-payment-received',
      expect.objectContaining({ amount: '1.25', transaction_signature: 'hash-1' })
    );
  });

  test('matches a packed Mixin sender with the snapshot user id', () => {
    const crypto = Object.create(MixinModule.prototype);
    const packed = '0xabc|79797026-5fdb-3e46-8732-019ac109f17e|mixin';

    expect(crypto.paymentsHaveSameSender(packed, '79797026-5fdb-3e46-8732-019ac109f17e')).toBe(
      true
    );
    expect(crypto.paymentsHaveSameSender(packed, '2a3083de-2480-3b90-a3d6-ea38a6b4a84f')).toBe(
      false
    );
  });

  test('a crypto payment announcement starts polling through the inherited handler', async () => {
    const crypto = Object.create(MixinModule.prototype);
    crypto.publicKey = 'saito-key';
    crypto.name = 'ETH';
    crypto.app = { BROWSER: 0 };
    crypto.hasSeenTransaction = () => false;
    crypto.startPolling = jest.fn();
    const tx = {
      isTo: () => true,
      isFrom: () => false,
      decryptMessage: async () => {},
      returnMessage: () => ({ module: 'ETH', request: 'crypto payment', amount: '1' }),
      from: [{ publicKey: 'payer' }]
    };

    await crypto.onConfirmation({}, tx, 0);

    expect(crypto.onConfirmation).toBe(CryptoModule.prototype.onConfirmation);
    expect(crypto.startPolling).toHaveBeenCalledTimes(1);
  });
});

describe('Mixin admin payments account', () => {
  test('create-account saves the server user and returns one backup object', async () => {
    const app = {
      options: {},
      storage: { saveOptions: jest.fn() },
      wallet: { getPrivateKey: async () => 'priv' }
    };
    const mixin = new Mixin(app);
    mixin.app = app;
    mixin.publicKey = 'server-key';
    mixin.database = {
      getTransfers: async () => [],
      listAdminTransfers: async () => ({ rows: [], total: 0, page: 1, page_size: 20 })
    };
    mixin.accounts = new Accounts(app, mixin);
    mixin.createAccount = async () => {
      const keys = {
        user_id: 'user-9',
        full_name: 'Saito User server-key',
        session_id: 'session-9',
        tip_key_base64: 'tip-9',
        session_seed: 'secret-seed',
        spend_private_key: 'secret-spend',
        spend_public_key: 'spend-pub'
      };
      mixin.credentials = keys;
      mixin.account_created = 1;
      mixin.accounts.saveCredentials(keys);
      return { keys };
    };

    const config = mixin.respondTo('admin-config');
    await expect(config.getConfig()).resolves.toEqual({
      transfers: [],
      total: 0,
      page: 1,
      page_size: 20,
      account: null,
      api_key_configured: false
    });

    const updated = await config.updateConfig({ action: 'create-account' });
    expect(updated.account.user_id).toBe('user-9');
    expect(updated.account.full_name).toBe('Saito User server-key');
    expect(JSON.parse(updated.account.backup)).toEqual({
      user_id: 'user-9',
      full_name: 'Saito User server-key',
      session_id: 'session-9',
      tip_key_base64: 'tip-9',
      session_seed: 'secret-seed',
      spend_private_key: 'secret-spend',
      spend_public_key: 'spend-pub'
    });
    expect(app.options.mixin.user_id).toBe('user-9');
    expect(app.storage.saveOptions).toHaveBeenCalled();
  });

  test('restore-account saves a pasted backup and rejects an incomplete one', async () => {
    const app = {
      options: {},
      storage: { saveOptions: jest.fn() }
    };
    const mixin = new Mixin(app);
    mixin.app = app;
    mixin.database = {
      getTransfers: async () => [],
      listAdminTransfers: async () => ({ rows: [], total: 0, page: 1, page_size: 20 })
    };
    mixin.accounts = new Accounts(app, mixin);
    const config = mixin.respondTo('admin-config');
    const backup = {
      user_id: 'user-9',
      full_name: 'Restored',
      session_id: 'session-9',
      tip_key_base64: 'tip-9',
      session_seed: 'secret-seed',
      spend_private_key: 'secret-spend',
      spend_public_key: 'spend-pub',
      price_usd: 1
    };

    await expect(config.updateConfig({ action: 'restore-account', account: '{' })).rejects.toThrow(
      'Mixin account backup is not valid JSON'
    );
    await expect(
      config.updateConfig({ action: 'restore-account', account: JSON.stringify({ user_id: 'user-9' }) })
    ).rejects.toThrow(/incomplete/);
    expect(app.options.mixin).toBeUndefined();

    const restored = await config.updateConfig({
      action: 'restore-account',
      account: JSON.stringify(backup)
    });
    expect(JSON.parse(restored.account.backup)).toEqual({
      user_id: 'user-9',
      full_name: 'Restored',
      session_id: 'session-9',
      tip_key_base64: 'tip-9',
      session_seed: 'secret-seed',
      spend_private_key: 'secret-spend',
      spend_public_key: 'spend-pub'
    });
    expect(app.options.mixin).not.toHaveProperty('price_usd');
    expect(app.storage.saveOptions).toHaveBeenCalled();

    await expect(
      config.updateConfig({ action: 'restore-account', account: JSON.stringify(backup) })
    ).rejects.toThrow('A Mixin account is already configured on this server');
  });

  test('save-api-key stores a valid keystore and leaves an environment key untouched', async () => {
    const originalMixin = process.env.MIXIN;
    const app = {
      options: { mixin: { user_id: 'user-9' } },
      storage: { saveOptions: jest.fn() }
    };
    const mixin = new Mixin(app);
    mixin.app = app;
    mixin.api = { appKeystore: null, createAppSession: jest.fn(() => ({ session: true })) };
    mixin.database = {
      listAdminTransfers: async () => ({ rows: [], total: 0, page: 1, page_size: 20 })
    };
    mixin.accounts = new Accounts(app, mixin);
    const config = mixin.respondTo('admin-config');
    const keystore = {
      app_id: ' app-1 ',
      session_id: 'session-1',
      server_public_key: 'server-pub',
      session_private_key: 'app-session-key',
      extra: 'drop-me'
    };

    delete process.env.MIXIN;
    await expect(config.updateConfig({ action: 'save-api-key', api_key: '{' })).rejects.toThrow(
      'Mixin API key is not valid JSON'
    );
    await expect(
      config.updateConfig({ action: 'save-api-key', api_key: JSON.stringify({ app_id: 'app-1' }) })
    ).rejects.toThrow(/incomplete \(missing: .*session_private_key/);
    expect(app.options.mixin).toEqual({ user_id: 'user-9' });
    expect(app.storage.saveOptions).not.toHaveBeenCalled();

    const saved = await config.updateConfig({
      action: 'save-api-key',
      api_key: JSON.stringify(keystore)
    });
    expect(app.options.mixin.api_key).toEqual({
      app_id: 'app-1',
      session_id: 'session-1',
      server_public_key: 'server-pub',
      session_private_key: 'app-session-key'
    });
    expect(app.options.mixin.user_id).toBe('user-9');
    expect(app.storage.saveOptions).toHaveBeenCalled();
    expect(mixin.api.appKeystore.session_private_key).toBe('app-session-key');
    expect(saved.api_key_configured).toBe(true);
    expect(JSON.stringify(saved)).not.toContain('app-session-key');
    mixin.accounts.saveCredentials({ user_id: 'user-9', session_id: 'session-9' });
    expect(app.options.mixin.user_id).toBe('user-9');
    expect(app.options.mixin.api_key.session_private_key).toBe('app-session-key');

    process.env.MIXIN = JSON.stringify({
      app_id: 'env-app',
      session_id: 'env-session',
      server_public_key: 'env-pub',
      session_private_key: 'env-secret'
    });
    const before = app.options.mixin.api_key;
    await expect(
      config.updateConfig({ action: 'save-api-key', api_key: JSON.stringify(keystore) })
    ).rejects.toThrow('already supplied by the server environment');
    expect(app.options.mixin.api_key).toBe(before);
    await expect(config.getConfig()).resolves.toMatchObject({ api_key_configured: true });

    if (originalMixin === undefined) {
      delete process.env.MIXIN;
    } else {
      process.env.MIXIN = originalMixin;
    }
  });

  test('deposit address balances stay in the wallet and a repeated deposit is counted once', async () => {
    const app = {
      options: { mixin: {} },
      storage: { saveOptions: jest.fn() }
    };
    const mixin = new Mixin(app);
    mixin.app = app;
    mixin.publicKey = 'server-key';
    mixin.crypto_mods = [{ ticker: 'ETH', asset_id: 'eth-asset' }];
    mixin.database = {
      listAddresses: async () => [
        {
          address: '0xabc',
          asset_id: 'eth-asset',
          mixin_user_id: 'user-1',
          publickey: 'server-key'
        }
      ],
      listReservedInboundAddresses: async () => ['0xabc']
    };
    mixin.accounts = new Accounts(app, mixin);

    mixin.rememberDepositAddress({
      address: '0xdef',
      assetId: 'eth-asset',
      ticker: 'ETH',
      mixinUserId: 'user-2'
    });
    mixin.creditDepositAddress('0xdef', '1.5', 'hash-1');
    mixin.creditDepositAddress('0xdef', '9', 'hash-1');
    mixin.creditDepositAddress('0xdef', '0.25', 'hash-2');

    const cached = app.options.mixin.deposit_addresses.find((item) => item.address === '0xdef');
    expect(cached.balance).toBe('1.75');
    expect(cached.credited).toEqual(['hash-1', 'hash-2']);

    const report = await mixin.depositAddressReport();
    expect(report).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          address: '0xabc',
          ticker: 'ETH',
          balance: '0',
          reservable: false
        }),
        expect.objectContaining({
          address: '0xdef',
          ticker: 'ETH',
          balance: '1.75',
          reservable: true
        })
      ])
    );
    expect(JSON.stringify(report)).not.toContain('hash-1');

    mixin.accounts.saveCredentials({ user_id: 'user-9', session_id: 'session-9' });
    expect(app.options.mixin.user_id).toBe('user-9');
    expect(app.options.mixin.deposit_addresses.find((item) => item.address === '0xdef').balance).toBe(
      '1.75'
    );
  });
});
