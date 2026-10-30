// @ts-nocheck

const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');

jest.mock('@mixin.dev/mixin-node-sdk', () => ({
  MixinApi: jest.fn(),
  getED25519KeyPair: jest.fn(),
  base64RawURLEncode: jest.fn(),
  MixinCashier: 'cashier'
}));

jest.mock('../../../lib/saito/transaction', () => ({
  default: class Transaction {
    signature = '';
    deserialize_from_web(_app, serialized) {
      const parsed = JSON.parse(serialized);
      this.signature = parsed.signature;
    }
  }
}));

const Database = require('../../../mods/mixin/lib/database');
const Accounts = require('../../../mods/mixin/lib/accounts');
const Transfers = require('../../../mods/mixin/lib/transfers');
const MigrationService = require('../../../mods/mixin/lib/migration');

const credentials = {
  user_id: 'server-user',
  session_id: 'session',
  tip_key_base64: 'tip',
  session_seed: 'seed',
  spend_private_key: 'spend'
};

async function openDatabase() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  const sqlDir = path.join(__dirname, '../../../mods/mixin/sql');
  for (const file of ['accounts.sql', 'addresses.sql', 'transfers.sql']) {
    await db.exec(fs.readFileSync(path.join(sqlDir, file), 'utf8'));
  }
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

function wallet() {
  const createUnsigned = jest.fn(async () => ({
    msg: null,
    async sign() {
      this.signature = 'issued-sig';
    },
    serialize_to_web() {
      return JSON.stringify({ signature: this.signature, msg: this.msg });
    }
  }));
  return {
    createUnsigned,
    getBalance: async () => 500000000000n,
    getPrivateKey: async () => 'private',
    convertNolanToSaito: (value) => Number(value) / 100000000,
    convertSaitoToNolan: (value) => BigInt(Math.round(Number(value) * 100000000)),
    addTransactionToPending: jest.fn(async () => {}),
    createUnsignedTransactionWithDefaultFee: createUnsigned
  };
}

function cryptoHelpers() {
  return {
    encryptWithPublicKey(buf) {
      return Buffer.from(`enc:${buf.toString('utf8')}`);
    },
    decryptWithPrivateKey(buf) {
      return Buffer.from(buf.toString('utf8').replace(/^enc:/, ''));
    }
  };
}

async function service() {
  const db = await openDatabase();
  const database = databaseFor(db);
  let addressCount = 0;
  let accountCount = 0;
  const app = {
    options: { mixin: credentials },
    wallet: wallet(),
    crypto: cryptoHelpers(),
    connection: { emit: jest.fn() },
    network: {
      propagateTransaction: jest.fn(async () => {}),
      sendRequestAsTransaction: jest.fn()
    },
    blockchain: { getLatestBlockId: async () => 10 },
    BROWSER: 0
  };
  const mod = {
    app,
    publicKey: 'server-key',
    crypto_mods: [
      { ticker: 'ERC-SAITO', asset_id: 'erc-asset', chain_id: 'erc-chain' },
      { ticker: 'BEP-SAITO', asset_id: 'bep-asset', chain_id: 'bep-chain' }
    ],
    database,
    accounts: null,
    api: {
      createAccount: jest.fn(async () => {
        accountCount += 1;
        return {
          user_id: `extra-user-${accountCount}`,
          session_id: 'session',
          tip_key_base64: 'tip',
          session_seed: 'seed',
          spend_private_key: 'spend'
        };
      }),
      createAddress: jest.fn(async (_credentials, chain) => {
        addressCount += 1;
        if (chain === 'bep-chain') {
          return `bep-dest-${addressCount}`;
        }
        return addressCount === 1 ? 'erc-dest' : `erc-dest-${addressCount}`;
      }),
      fetchDeposits: jest.fn(async () => []),
      fetchHistory: jest.fn(async () => [])
    }
  };
  mod.accounts = new Accounts(app, mod);
  mod.migration = new MigrationService(app, mod);
  const transfers = new Transfers(app, mod);
  mod.transfers = transfers;
  return { app, mod, transfers, database };
}

function deposit(hash, amount, destination = 'erc-dest', sender = '') {
  return {
    amount: String(amount),
    transaction_hash: hash,
    snapshot_id: `snap-${hash}`,
    deposit: { destination, sender }
  };
}

describe('Mixin migration reserved-address transfers', () => {
  test('shared reservation period follows Mixin.ADDRESS_RESERVATION_PERIOD_IN_MINUTES', () => {
    const transfers = new Transfers({}, { ADDRESS_RESERVATION_PERIOD_IN_MINUTES: 40 });
    expect(transfers.reservation_ms).toBe(40 * 60 * 1000);
  });

  test('a request reserves an exclusive deposit address without sender or email', async () => {
    const { app, mod, transfers } = await service();

    const opened = await mod.migration.startMigration('saito-user', 'ERC-SAITO');
    const again = await mod.migration.startMigration('saito-user', 'ERC-SAITO');
    const bep = await mod.migration.startMigration('saito-user', 'BEP-SAITO');

    expect(opened).toEqual(
      expect.objectContaining({
        address: 'erc-dest',
        ticker: 'ERC-SAITO',
        error: null,
        reserved_until: expect.any(Number)
      })
    );
    expect(opened.reserved_until - Date.now()).toBeGreaterThan(39 * 60 * 1000);
    expect(opened.reserved_until - Date.now()).toBeLessThanOrEqual(40 * 60 * 1000);
    expect(again.id).toBe(opened.id);
    expect(again.address).toBe(opened.address);
    expect(bep.address).toMatch(/^bep-dest/);
    expect(bep.address).not.toBe(opened.address);

    const row = (await mod.database.getTransfers({ id: opened.id }))[0];
    expect(row).toEqual(
      expect.objectContaining({
        purpose: 'migration',
        mode: 'automatic',
        status: 'inbound_awaiting',
        inbound_amount: '',
        outbound_amount: '',
        inbound_address: 'erc-dest',
        inbound_sender: '',
        email: '',
        recipient_publickey: 'saito-user',
        inbound_confirmation_block_id: 10
      })
    );
    expect(app.connection.emit.mock.calls.some((call) => call[0] === 'relay-transaction')).toBe(false);
    expect(transfers.reservation_ms).toBe(40 * 60 * 1000);
  });

  test('a second Saito key receives a different reserved address', async () => {
    const { mod } = await service();
    const first = await mod.migration.startMigration('saito-user', 'ERC-SAITO');
    const second = await mod.migration.startMigration('other-user', 'ERC-SAITO');

    expect(first.error).toBeNull();
    expect(second.error).toBeNull();
    expect(second.address).toBeTruthy();
    expect(second.address).not.toBe(first.address);

    const rows = await mod.database.getTransfers({ purpose: 'migration', mode: 'automatic' });
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((row) => row.inbound_address)).size).toBe(2);
  });

  test('selectAvailableDepositAddress skips busy addresses and preserves primary-first order', async () => {
    const { mod, transfers, database } = await service();
    await database.insertTransfer({
      purpose: 'buysaito',
      mode: 'automatic',
      status: 'inbound_awaiting',
      inbound_address: 'erc-dest',
      inbound_ticker: 'ERC-SAITO',
      created_at: Date.now()
    });

    const selected = await transfers.selectAvailableDepositAddress(mod.crypto_mods[0]);
    expect(selected.address).not.toBe('erc-dest');
    expect(selected.credentials.user_id).toMatch(/^extra-user-/);
    expect(mod.api.createAccount).toHaveBeenCalled();
  });

  test('an external deposit issues the received amount 1:1 without requiring a sender', async () => {
    const { app, mod, transfers } = await service();
    await mod.migration.startMigration('saito-user', 'ERC-SAITO');
    mod.api.fetchHistory.mockResolvedValue([deposit('mix-hash', '12.5', 'erc-dest', '0xsomeoneelse')]);

    await transfers.processTransferQueue();
    await transfers.processTransferQueue();

    const row = (await mod.database.getTransfers({ purpose: 'migration' }))[0];
    expect(row).toEqual(
      expect.objectContaining({
        inbound_amount: '12.5',
        outbound_amount: '12.5',
        inbound_tx_hash: 'mix-hash',
        outbound_tx_sig: 'issued-sig',
        status: 'outbound_broadcast'
      })
    );
    expect(app.wallet.createUnsignedTransactionWithDefaultFee).toHaveBeenCalledTimes(1);
    const signed = JSON.parse(row.outbound_tx);
    expect(signed.msg.amount).toBe(12.5);
    expect(signed.msg.module).toBe('Mixin');
  });

  test('an internal Mixin transfer without a destination does not match', async () => {
    const { mod, transfers } = await service();
    await mod.migration.startMigration('saito-user', 'ERC-SAITO');
    mod.api.fetchHistory.mockResolvedValue([
      { opponent_id: 'user-mixin', amount: '4', transaction_hash: 'internal', snapshot_id: 'snap-internal' }
    ]);

    await transfers.processTransferQueue();

    const row = (await mod.database.getTransfers({ purpose: 'migration' }))[0];
    expect(row.status).toBe('inbound_awaiting');
    expect(row.inbound_amount).toBe('');
    expect(row.outbound_tx_sig).toBe('');
  });

  test('a deposit to a different reserved address does not match', async () => {
    const { mod, transfers } = await service();
    await mod.migration.startMigration('saito-user', 'ERC-SAITO');
    mod.api.fetchHistory.mockResolvedValue([deposit('other-hash', '4', 'someone-elses-address')]);

    await transfers.processTransferQueue();

    const row = (await mod.database.getTransfers({ purpose: 'migration' }))[0];
    expect(row.status).toBe('inbound_awaiting');
    expect(row.inbound_tx_hash).toBe('');
  });

  test('the same deposit hash cannot fill a second request', async () => {
    const { mod, transfers } = await service();
    const first = await mod.migration.startMigration('saito-user', 'ERC-SAITO');
    const second = await mod.migration.startMigration('other-user', 'ERC-SAITO');
    mod.api.fetchHistory.mockResolvedValue([
      deposit('same-hash', '3', first.address),
      deposit('same-hash', '3', second.address)
    ]);

    await transfers.processTransferQueue();

    const rows = await mod.database.getTransfers({ purpose: 'migration' });
    const issued = rows.filter((row) => row.outbound_tx_sig === 'issued-sig');
    expect(issued).toHaveLength(1);
    expect(rows.some((row) => String(row.last_error || '').includes('already recorded'))).toBe(true);
  });

  test('a deposit above the cap is refused and the user is notified without Relay', async () => {
    const { app, mod, transfers } = await service();
    await mod.migration.startMigration('saito-user', 'ERC-SAITO');
    mod.api.fetchHistory.mockResolvedValue([deposit('too-large', '1000001')]);

    await transfers.processTransferQueue();

    const row = (await mod.database.getTransfers({ purpose: 'migration' }))[0];
    expect(row.status).toBe('failed');
    expect(row.outbound_tx_sig).toBe('');
    expect(app.wallet.createUnsignedTransactionWithDefaultFee).not.toHaveBeenCalled();
    expect(app.network.sendRequestAsTransaction).toHaveBeenCalledWith(
      'migration failure',
      { data: null },
      null,
      'saito-user'
    );
    expect(app.connection.emit.mock.calls.some((call) => call[0] === 'relay-transaction')).toBe(false);
  });

  test('a private migration request from another peer is ignored and no longer requires chain address or email', async () => {
    const { app, mod } = await service();
    const Mixin = require('../../../mods/mixin/mixin');
    const mixin = { app, migration: mod.migration };
    const tx = {
      from: [{ publicKey: 'saito-user' }],
      returnMessage: () => ({
        request: 'migration request',
        data: {
          publickey: 'saito-user',
          ticker: 'ERC-SAITO'
        }
      })
    };
    const callback = jest.fn();

    const accepted = await Mixin.prototype.handlePeerTransaction.call(
      mixin,
      app,
      tx,
      { publicKey: 'saito-user' },
      callback
    );
    const rejected = await Mixin.prototype.handlePeerTransaction.call(
      mixin,
      app,
      tx,
      { publicKey: 'someone-else' },
      jest.fn()
    );

    expect(accepted).toBe(1);
    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({ address: 'erc-dest', error: null, reserved_until: expect.any(Number) })
    );
    expect(app.network.sendRequestAsTransaction).toHaveBeenCalledWith(
      'migration request',
      expect.objectContaining({ address: 'erc-dest' }),
      null,
      'saito-user'
    );
    expect(rejected).toBe(0);
    const rows = await mod.database.getTransfers({ purpose: 'migration' });
    expect(rows).toHaveLength(1);
    expect(rows[0].inbound_sender).toBe('');
    expect(rows[0].email).toBe('');
  });

  test('a migration request is not stored when the Saito block id is unavailable', async () => {
    const { app, mod } = await service();
    app.blockchain.getLatestBlockId = async () => null;
    const opened = await mod.migration.startMigration('saito-user', 'ERC-SAITO');
    expect(opened.error).toMatch(/Saito block height is unavailable/);
    expect(await mod.database.getTransfers({ purpose: 'migration' })).toHaveLength(0);
  });

  test('the treasury minimum rejects a request before a row is created', async () => {
    const { app, mod } = await service();
    app.wallet.getBalance = async () => 100n;
    const opened = await mod.migration.startMigration('saito-user', 'ERC-SAITO');
    expect(opened.error).toMatch(/Insufficient balance/);
    expect(await mod.database.getTransfers({ purpose: 'migration' })).toHaveLength(0);
  });

  test('unpaid BuySaito, Store, and Migration reservations expire after 40 minutes', async () => {
    const { transfers, database } = await service();
    const stale = Date.now() - transfers.reservation_ms - 1000;
    await database.insertTransfer({
      purpose: 'buysaito',
      mode: 'automatic',
      status: 'inbound_awaiting',
      created_at: stale
    });
    await database.insertTransfer({
      purpose: 'store-purchase',
      mode: 'automatic',
      status: 'inbound_awaiting',
      created_at: stale
    });
    await database.insertTransfer({
      purpose: 'migration',
      mode: 'automatic',
      status: 'inbound_awaiting',
      requester_publickey: 'saito-user',
      inbound_ticker: 'ERC-SAITO',
      inbound_address: 'erc-dest',
      created_at: stale
    });

    await transfers.processTransferQueue();

    expect(await database.getTransfers({ purpose: 'buysaito', status: 'failed' })).toHaveLength(1);
    expect(await database.getTransfers({ purpose: 'store-purchase', status: 'failed' })).toHaveLength(1);
    expect(await database.getTransfers({ purpose: 'migration', status: 'failed' })).toHaveLength(1);
  });

  test('expiry does not affect already-claimed migration deposits', async () => {
    const { transfers, database } = await service();
    await database.insertTransfer({
      purpose: 'migration',
      mode: 'automatic',
      status: 'inbound_confirmed',
      requester_publickey: 'saito-user',
      recipient_publickey: 'saito-user',
      inbound_amount: '4',
      outbound_amount: '4',
      inbound_tx_hash: 'stored-hash',
      inbound_confirmation_block_id: 10,
      created_at: 1
    });

    await transfers.processTransferQueue();

    const migration = await database.getTransfers({ purpose: 'migration' });
    expect(migration[0]).toEqual(
      expect.objectContaining({
        status: 'outbound_broadcast',
        outbound_amount: '4',
        outbound_tx_sig: 'issued-sig'
      })
    );
  });

  test('an expired address becomes available for a later reservation', async () => {
    const { mod, transfers, database } = await service();
    const first = await mod.migration.startMigration('saito-user', 'ERC-SAITO');
    await database.updateTransfer(first.id, {
      created_at: Date.now() - transfers.reservation_ms - 1000
    });
    await transfers.processTransferQueue();

    const reused = await mod.migration.startMigration('other-user', 'ERC-SAITO');
    expect(reused.address).toBe(first.address);
    expect(reused.id).not.toBe(first.id);
  });

  test('a migration payout proceeds while BuySaito expiry and a higher threshold do not', async () => {
    const { transfers, database } = await service();
    await database.insertTransfer({
      purpose: 'buysaito',
      mode: 'automatic',
      status: 'inbound_awaiting',
      requester_publickey: 'buyer',
      recipient_publickey: 'buyer',
      outbound_amount: '10',
      inbound_confirmation_block_id: 10,
      created_at: 1
    });
    await database.insertTransfer({
      purpose: 'buysaito',
      mode: 'automatic',
      status: 'inbound_confirmed',
      requester_publickey: 'later-buyer',
      recipient_publickey: 'later-buyer',
      outbound_amount: '10',
      inbound_confirmation_block_id: 11,
      created_at: Date.now()
    });
    await database.insertTransfer({
      purpose: 'migration',
      mode: 'automatic',
      status: 'inbound_confirmed',
      requester_publickey: 'saito-user',
      recipient_publickey: 'saito-user',
      inbound_amount: '4',
      outbound_amount: '4',
      inbound_tx_hash: 'stored-hash',
      inbound_confirmation_block_id: 10,
      created_at: 1
    });

    await transfers.processTransferQueue();

    const expired = await database.getTransfers({ purpose: 'buysaito', status: 'failed' });
    const waiting = await database.getTransfers({ requester_publickey: 'later-buyer' });
    const migration = await database.getTransfers({ purpose: 'migration' });
    expect(expired).toHaveLength(1);
    expect(waiting[0]).toEqual(
      expect.objectContaining({ status: 'inbound_confirmed', outbound_tx_sig: '' })
    );
    expect(migration[0]).toEqual(
      expect.objectContaining({
        status: 'outbound_broadcast',
        outbound_amount: '4',
        outbound_tx_sig: 'issued-sig'
      })
    );
  });

  test('manual migration is not issued until an administrator approves it once', async () => {
    const { app, mod, transfers } = await service();
    await mod.migration.recordManualMigration({
      timestamp: Date.now(),
      from: [{ publicKey: 'saito-user' }],
      returnMessage: () => ({
        request: 'save migration data',
        data: { pk: 'saito-user', erc20: '0xabc', email: 'person@example.com' }
      })
    });

    await transfers.processTransferQueue();
    let row = (await mod.database.getTransfers({ mode: 'manual' }))[0];
    expect(row.status).toBe('inbound_awaiting');
    expect(row.outbound_tx_sig).toBe('');

    await mod.migration.confirmManualMigrationDeposit(row.id, '4', 'erc-hash');
    const mixin = {
      database: mod.database,
      migration: mod.migration,
      transfers,
      publicKey: 'admin-key',
      approveManualMigration: async (id) => {
        const Mixin = require('../../../mods/mixin/mixin');
        return Mixin.prototype.approveManualMigration.call(mixin, id);
      }
    };
    await mixin.approveManualMigration(row.id);
    await mixin.approveManualMigration(row.id);

    row = (await mod.database.getTransfers({ mode: 'manual' }))[0];
    expect(row).toEqual(
      expect.objectContaining({
        status: 'outbound_broadcast',
        inbound_amount: '4',
        outbound_amount: '4',
        inbound_tx_hash: 'erc-hash',
        outbound_tx_sig: 'issued-sig'
      })
    );
    expect(JSON.parse(row.payload).approved_by).toBe('admin-key');
    expect(app.wallet.createUnsignedTransactionWithDefaultFee).toHaveBeenCalledTimes(1);
  });

  test('the migration page is served without external address or email fields', () => {
    const Mixin = require('../../../mods/mixin/mixin');
    const mod = Object.create(Mixin.prototype);
    mod.slug = 'mixin';
    expect(mod.isSlug('migration')).toBe(true);
    expect(mod.shouldAffixCallbackToModule('ERC-SAITO')).toBe(1);
    expect(mod.shouldAffixCallbackToModule('BEP-SAITO')).toBe(1);

    const source = fs.readFileSync(
      require.resolve('../../../mods/mixin/lib/ui/migration/main.js'),
      'utf8'
    );
    const client = fs.readFileSync(
      require.resolve('../../../mods/mixin/lib/ui/migration/client.js'),
      'utf8'
    );
    const page = require('../../../mods/mixin/lib/ui/migration/main.template')({
      publicKey: 'user-key',
      wrapped_saito_ticker: 'ERC-SAITO'
    });
    expect(page).toContain('id="migrate"');
    expect(page).not.toContain('id="email"');
    expect(page).not.toContain('id="erc20"');
    expect(page).toContain('id="publickey"');
    expect(page).toContain('id="wrapped-saito-ticker"');
    expect(source).not.toContain('0x24F10EA2827717770270e3cc97F015Ba58fcB9b6');
    expect(source).not.toContain('chain_address');
    expect(source).not.toContain('email');
    expect(client).not.toContain('chain_address');
    expect(client).not.toContain('relay-transaction');
    expect(fs.existsSync(path.join(__dirname, '../../../mods/migration/migration.js'))).toBe(false);

    const reserved = require('../../../mods/mixin/lib/ui/migration/main.template')({
      publicKey: 'user-key',
      wrapped_saito_ticker: 'ERC-SAITO',
      migration_instructions: {
        address: '0xreserved',
        ticker: 'ERC-SAITO',
        id: 9,
        reserved_until: Date.now() + 40 * 60 * 1000,
        ui_status: 'Waiting for your deposit...'
      }
    });
    expect(reserved).toContain('0xreserved');
    expect(reserved).toContain('migration-reservation-expiry');
    expect(reserved).toContain('Waiting for your deposit...');
  });
});
