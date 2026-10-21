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
const Transfers = require('../../../mods/mixin/lib/transfers');
const Mixin = require('../../../mods/mixin/mixin');
const MixinModule = require('../../../mods/mixin/lib/mixinmodule');
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
    await api.fetchAsset(credentials, 'asset-id');

    const keystores = MixinApi.mock.calls.map((call) => call[0].keystore);
    expect(keystores.every((keystore) => keystore.app_id === 'user-1')).toBe(true);
    expect(keystores.every((keystore) => keystore.session_private_key === 'seed')).toBe(true);
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
    expect(second).toEqual({ ciphertext: first.ciphertext, restored: true });
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

  test('an outbound transfer is recorded as sent or failed and startup does not resend it', async () => {
    const db = await openMixinDatabase();
    const database = databaseFor(db);
    const mod = { database };
    const transfers = new Transfers({}, mod);
    const sentId = await transfers.createTransfer({
      mixinUserId: 'user-1',
      assetId: 'eth',
      destination: '0xabc|user-2|mixin',
      amount: '1.5',
      memo: 'note'
    });
    await transfers.completeTransfer(sentId, 'tx-hash');

    const failedId = await transfers.createTransfer({
      mixinUserId: 'user-1',
      assetId: 'eth',
      destination: '0xdef',
      amount: '2',
      memo: ''
    });
    await transfers.failTransfer(failedId, 'rejected');

    const openId = await transfers.createTransfer({
      mixinUserId: 'user-1',
      assetId: 'eth',
      destination: '0xopen',
      amount: '3',
      memo: ''
    });

    expect(await transfers.getTransfer(sentId)).toMatchObject({ status: 'sent', hash: 'tx-hash' });
    expect(await transfers.getTransfer(failedId)).toMatchObject({
      status: 'failed',
      error: 'rejected',
      hash: ''
    });
    expect(await transfers.findIncompleteTransfers('user-1')).toEqual([
      expect.objectContaining({ id: openId, status: 'sending' })
    ]);

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
    expect(await transfers.getTransfer(openId)).toMatchObject({ status: 'sending', hash: '' });
    sendToUser.mockRestore();
    sendToAddress.mockRestore();
  });
});

describe('Mixin ticker module', () => {
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
