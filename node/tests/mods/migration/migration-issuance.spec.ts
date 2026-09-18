// @ts-nocheck

jest.mock('../../../lib/saito/transaction', () => ({
  default: class Transaction {
    deserialize_from_web(_app, serialized) {
      Object.assign(this, JSON.parse(serialized));
    }

    returnMessage() {
      return this.msg;
    }

    isFrom(publicKey) {
      return this.from?.some((slip) => slip.publicKey === publicKey);
    }

    isTo(publicKey) {
      return this.to?.some((slip) => slip.publicKey === publicKey);
    }
  }
}));
jest.mock('../../../lib/templates/modtemplate', () => class ModTemplate {});
jest.mock('../../../mods/migration/lib/main', () => class MigrationMain {});
jest.mock('../../../mods/migration/lib/apebond/main', () => class ApeBondMain {});
jest.mock('../../../lib/saito/ui/saito-header/saito-header', () => class SaitoHeader {});
jest.mock('saito-js/lib/peer_service', () => ({ default: class PeerService {} }));

const sqlite = require('sqlite');
const sqlite3 = require('sqlite3');
const Migration = require('../../../mods/migration/migration');

function makeModule() {
  const mod = Object.create(Migration.prototype);
  mod.publicKey = 'migration-bot';
  mod.pending_payments = [];
  mod.processing_payments = false;
  return mod;
}

function storageForDatabase(db) {
  return {
    returnDatabaseByName: jest.fn(async () => db),
    queryDatabase: jest.fn(async (sql, params) => db.all(sql, params)),
    runDatabase: jest.fn(async (sql, params) => {
      try {
        return await db.run(sql, params);
      } catch (err) {
        // StorageCore currently converts SQLite write errors to undefined.
        return undefined;
      }
    })
  };
}

describe('Migration issuance lifecycle', () => {
  test('upgrades the legacy table before saving an awaiting Mixin payment', async () => {
    const db = await sqlite.open({ filename: ':memory:', driver: sqlite3.Database });
    const mod = makeModule();
    mod.app = { storage: storageForDatabase(db) };

    try {
      await db.exec(`CREATE TABLE auto_migration (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        public_key TEXT DEFAULT '',
        ticker TEXT DEFAULT '',
        mixin TEXT DEFAULT '',
        nolan_received INTEGER DEFAULT 0,
        created_at INTEGER DEFAULT 0,
        status TEXT DEFAULT 'pending'
          CHECK (status IN ('pending','issuing','succeeded','failed')),
        tx_sig TEXT DEFAULT '',
        blk_id INTEGER DEFAULT 0,
        issued_at INTEGER DEFAULT 0
      )`);
      await db.run(
        `INSERT INTO auto_migration
          (public_key, ticker, mixin, nolan_received, created_at, status)
         VALUES ('existing-user', 'ERC-SAITO', 'existing-mixin', 100, 1, 'pending')`
      );

      await mod.ensureAutoMigrationSchema();
      await mod.ensureAutoMigrationSchema();

      const definition = await db.get(
        `SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'auto_migration'`
      );
      const columns = await db.all('PRAGMA table_info(auto_migration)');
      expect(definition.sql).toContain('awaiting_mixin');
      expect(columns.map((column) => column.name)).toEqual(
        expect.arrayContaining([
          'announcement_hash',
          'migration_type',
          'email',
          'issuance_tx',
          'issuance_at'
        ])
      );
      expect(await db.get('SELECT * FROM auto_migration WHERE id = 1')).toEqual(
        expect.objectContaining({ public_key: 'existing-user', status: 'pending' })
      );

      const payment = {
        public_key: 'new-user',
        ticker: 'ERC-SAITO',
        mixin: 'erc-sender|mixin-user|mixin',
        nolan_received: 200,
        created_at: 2,
        status: 'awaiting_mixin',
        announcement_hash: 'incoming-deposit'
      };
      await mod.savePendingPayment(payment, false);

      expect(payment.id).toBe(2);
      expect(await db.get('SELECT status FROM auto_migration WHERE id = 2')).toEqual({
        status: 'awaiting_mixin'
      });
    } finally {
      await db.close();
    }
  });

  test('surfaces the SQLite error when a migration payment cannot be saved', async () => {
    const db = await sqlite.open({ filename: ':memory:', driver: sqlite3.Database });
    const mod = makeModule();
    mod.app = { storage: storageForDatabase(db) };

    try {
      await mod.ensureAutoMigrationSchema();

      await expect(
        mod.savePendingPayment(
          {
            public_key: 'new-user',
            ticker: 'ERC-SAITO',
            mixin: 'erc-sender|mixin-user|mixin',
            nolan_received: 200,
            created_at: 2,
            status: 'invalid-status',
            announcement_hash: 'invalid-deposit'
          },
          true
        )
      ).rejects.toThrow(/failed to save payment invalid-deposit.*CHECK constraint failed/i);
      expect(mod.pending_payments).toEqual([]);
    } finally {
      await db.close();
    }
  });

  test('records the exact signed transaction and signature while moving to issuing', async () => {
    const payment = { id: 24, status: 'pending' };
    const tx = {
      signature: '337-payout-signature',
      serialize_to_web: jest.fn(() => 'serialized-337-payout')
    };
    const mod = makeModule();
    mod.app = {
      storage: { runDatabase: jest.fn(async () => ({ changes: 1 })) }
    };

    await mod.recordMigrationIssuance(payment, tx);

    expect(mod.app.storage.runDatabase).toHaveBeenCalledWith(
      expect.stringContaining("WHERE id = $id AND status = 'pending'"),
      expect.objectContaining({
        $id: 24,
        $tx_sig: '337-payout-signature',
        $issuance_tx: 'serialized-337-payout'
      }),
      'migration'
    );
    expect(payment).toEqual(
      expect.objectContaining({
        status: 'issuing',
        tx_sig: '337-payout-signature',
        issuance_tx: 'serialized-337-payout'
      })
    );
  });

  test('persists a payout before adding it to pending and propagating it', async () => {
    const order = [];
    const payment = {
      id: 25,
      status: 'pending',
      public_key: 'recipient',
      nolan_received: 33700000000n,
      announcement_hash: 'deposit-hash',
      ticker: 'ERC-SAITO',
      mixin: 'erc-sender|mixin-user|mixin'
    };
    const tx = { signature: 'payout-signature' };
    const mod = makeModule();
    mod.pending_payments = [payment];
    mod.confirmMigrationIssuancesInBlock = jest.fn();
    mod.sendMigrationIssuanceTransaction = jest.fn(async () => tx);
    mod.recordMigrationIssuance = jest.fn(async (pendingPayment) => {
      order.push('persist');
      pendingPayment.status = 'issuing';
    });
    mod.notifyTeam = jest.fn();
    mod.app = {
      BROWSER: false,
      wallet: {
        convertNolanToSaito: jest.fn(() => 337),
        returnCryptoModuleByTicker: jest.fn(() => ({ getPendingBalance: async () => 1000 })),
        addTransactionToPending: jest.fn(async () => order.push('pending'))
      },
      network: {
        propagateTransaction: jest.fn(async () => order.push('propagate'))
      }
    };

    await mod.onNewBlock({ id: 12632, transactions: [] }, true);

    expect(order).toEqual(['persist', 'pending', 'propagate']);
    expect(payment.status).toBe('issuing');
    expect(mod.notifyTeam).toHaveBeenCalledWith(expect.anything(), 'recipient', 1, null, payment);
  });

  test('rebroadcasts only the saved signature and validates its recipient and amount', async () => {
    const payment = {
      id: 25,
      status: 'issuing',
      public_key: 'recipient',
      nolan_received: 33700000000n,
      announcement_hash: 'deposit-hash',
      tx_sig: 'payout-signature',
      issuance_tx: JSON.stringify({
        signature: 'payout-signature',
        from: [{ publicKey: 'migration-bot' }],
        to: [{ publicKey: 'recipient', amount: '33700000000' }],
        msg: {
          module: 'Migration',
          request: 'migration issuance',
          hash: 'deposit-hash'
        }
      })
    };
    const mod = makeModule();
    mod.app = {
      wallet: { addTransactionToPending: jest.fn(async () => {}) },
      network: { propagateTransaction: jest.fn(async () => {}) }
    };

    expect(await mod.rebroadcastMigrationIssuance(payment)).toBe(true);

    const restoredTx = mod.app.wallet.addTransactionToPending.mock.calls[0][0];
    expect(restoredTx.signature).toBe('payout-signature');
    expect(mod.app.wallet.addTransactionToPending).toHaveBeenCalledWith(restoredTx, false);
    expect(mod.app.network.propagateTransaction).toHaveBeenCalledWith(restoredTx);
  });

  test('holds a legacy issuing row without creating a replacement payout', async () => {
    const payment = {
      id: 24,
      status: 'issuing',
      public_key: 'recipient',
      nolan_received: 33700000000n,
      tx_sig: '',
      issuance_tx: ''
    };
    const mod = makeModule();
    mod.pending_payments = [payment];
    mod.confirmMigrationIssuancesInBlock = jest.fn();
    mod.sendMigrationIssuanceTransaction = jest.fn();
    mod.app = {
      BROWSER: false,
      wallet: {
        addTransactionToPending: jest.fn()
      },
      network: { propagateTransaction: jest.fn() }
    };
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    try {
      await mod.onNewBlock({ id: 12632, transactions: [] }, true);
    } finally {
      consoleSpy.mockRestore();
    }

    expect(mod.sendMigrationIssuanceTransaction).not.toHaveBeenCalled();
    expect(mod.app.wallet.addTransactionToPending).not.toHaveBeenCalled();
    expect(mod.app.network.propagateTransaction).not.toHaveBeenCalled();
    expect(payment.status).toBe('issuing');
    expect(payment.missing_issuance_notified).toBe(true);
  });

  test('only accepts payout confirmation from a longest-chain block', async () => {
    const payment = { status: 'issuing', tx_sig: 'payout-signature' };
    const tx = { signature: 'payout-signature', returnMessage: () => ({}) };
    const block = { id: 12633, transactions: [tx] };
    const mod = makeModule();
    mod.pending_payments = [payment];
    mod.receiveMigrationIssuanceTransaction = jest.fn();

    await mod.confirmMigrationIssuancesInBlock(block, false);
    expect(mod.receiveMigrationIssuanceTransaction).not.toHaveBeenCalled();

    await mod.confirmMigrationIssuancesInBlock(block, true);
    expect(mod.receiveMigrationIssuanceTransaction).toHaveBeenCalledWith(tx, block);
  });
});
