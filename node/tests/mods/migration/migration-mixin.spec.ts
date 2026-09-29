// @ts-nocheck

const CryptoModule = require('../../../lib/templates/cryptomodule');
const MixinModule = require('../../../mods/mixin/lib/mixinmodule');
const Migration = require('../../../mods/migration/migration');

describe('Mixin migration payment matching', () => {
  test('keeps strict sender matching as the CryptoModule default', () => {
    const crypto = Object.create(CryptoModule.prototype);

    expect(crypto.paymentsHaveSameSender('sender', 'sender')).toBe(true);
    expect(
      crypto.paymentsHaveSameSender(
        '0xabc|79797026-5fdb-3e46-8732-019ac109f17e|mixin',
        '79797026-5fdb-3e46-8732-019ac109f17e'
      )
    ).toBe(false);
  });

  test('matches a packed Mixin address with the UUID reported by Safe snapshots', () => {
    const crypto = Object.create(MixinModule.prototype);
    const packed = '0xabc|79797026-5fdb-3e46-8732-019ac109f17e|mixin';

    expect(crypto.paymentsHaveSameSender(packed, '79797026-5fdb-3e46-8732-019ac109f17e')).toBe(
      true
    );
    expect(crypto.paymentsHaveSameSender(packed, '2a3083de-2480-3b90-a3d6-ea38a6b4a84f')).toBe(
      false
    );
  });

  test('reconciles only an inbound snapshot matching hash, amount, asset, and sender', async () => {
    const crypto = Object.create(MixinModule.prototype);
    const createdAt = 1787665543032;
    const hash = '21294832e2820aab42252f41eefe5bbff8c2b4bcdd58fd6469df103de4ce244a';
    const sender =
      '0x2B78ff377201AC617bC34821A619F67581E8926E|79797026-5fdb-3e46-8732-019ac109f17e|mixin';

    crypto.asset_id = 'erc-saito-asset';
    crypto.ticker = 'ERC-SAITO';
    crypto.publicKey = 'migration-bot';
    crypto.formatAddress = jest.fn(() => 'migration-mixin-address');
    crypto.mixin = {
      fetchSafeSnapshots: jest.fn(async () => [
        {
          asset_id: 'erc-saito-asset',
          amount: '-777',
          opponent_id: '79797026-5fdb-3e46-8732-019ac109f17e',
          transaction_hash: hash,
          created_at: '2026-08-25T13:45:45.226354Z'
        },
        {
          asset_id: 'different-asset',
          amount: '777',
          opponent_id: '79797026-5fdb-3e46-8732-019ac109f17e',
          transaction_hash: hash,
          created_at: '2026-08-25T13:45:45.226354Z'
        },
        {
          asset_id: 'erc-saito-asset',
          amount: '778',
          opponent_id: '79797026-5fdb-3e46-8732-019ac109f17e',
          transaction_hash: hash,
          created_at: '2026-08-25T13:45:45.226354Z'
        },
        {
          asset_id: 'erc-saito-asset',
          amount: '777',
          opponent_id: '2a3083de-2480-3b90-a3d6-ea38a6b4a84f',
          transaction_hash: hash,
          created_at: '2026-08-25T13:45:45.226354Z'
        },
        {
          asset_id: 'erc-saito-asset',
          amount: '777',
          opponent_id: '79797026-5fdb-3e46-8732-019ac109f17e',
          transaction_hash: hash,
          created_at: '2026-08-25T13:45:45.226354Z',
          memo: 'exact-match'
        }
      ])
    };

    const payment = await crypto.findInboundPaymentBySignature(hash, '777', sender, createdAt);

    expect(crypto.mixin.fetchSafeSnapshots).toHaveBeenCalledWith(
      'erc-saito-asset',
      createdAt - 300000
    );
    expect(payment).toEqual(
      expect.objectContaining({
        ticker: 'ERC-SAITO',
        amount: '777',
        sender_address: '79797026-5fdb-3e46-8732-019ac109f17e',
        transaction_signature: hash,
        memo: 'exact-match'
      })
    );
  });

  test('moves a ledger-verified awaiting migration to pending without polling again', async () => {
    const hash = 'verified-mixin-hash';
    const crypto = {
      findInboundPaymentBySignature: jest.fn(async () => ({
        ticker: 'ERC-SAITO',
        amount: '777',
        transaction_signature: hash
      }))
    };
    const migration = Object.create(Migration.prototype);

    migration.wrapped_saito_ticker = 'ERC-SAITO';
    migration.ercMod = null;
    migration.payment_cache = {};
    migration.pending_payments = [];
    migration.updatePayment = jest.fn(async () => {});
    migration.app = {
      wallet: {
        convertNolanToSaito: jest.fn(() => '777'),
        returnCryptoModuleByTicker: jest.fn(() => crypto),
        receivePayment: jest.fn()
      }
    };

    await migration.resumeAwaitingMixin({
      id: 21,
      status: 'awaiting_mixin',
      nolan_received: '77700000000',
      mixin:
        '0x2B78ff377201AC617bC34821A619F67581E8926E|79797026-5fdb-3e46-8732-019ac109f17e|mixin',
      announcement_hash: hash,
      created_at: 1787665543032
    });

    expect(crypto.findInboundPaymentBySignature).toHaveBeenCalledWith(
      hash,
      '777',
      expect.stringContaining('79797026-5fdb-3e46-8732-019ac109f17e'),
      1787665543032
    );
    expect(migration.updatePayment).toHaveBeenCalledWith(
      expect.objectContaining({ id: 21, status: 'pending' })
    );
    expect(migration.pending_payments).toEqual([
      expect.objectContaining({ id: 21, status: 'pending' })
    ]);
    expect(migration.app.wallet.receivePayment).not.toHaveBeenCalled();
  });

  test('retries an exact lookup when the announced snapshot is not visible yet', async () => {
    const hash = 'slightly-delayed-mixin-hash';
    let retry = null;
    const timer = { unref: jest.fn() };
    const setTimeoutSpy = jest.spyOn(global, 'setTimeout').mockImplementation((callback) => {
      retry = callback;
      return timer;
    });
    const crypto = {
      findInboundPaymentBySignature: jest
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ transaction_signature: hash })
    };
    const migration = Object.create(Migration.prototype);

    migration.wrapped_saito_ticker = 'ERC-SAITO';
    migration.ercMod = null;
    migration.payment_cache = {};
    migration.pending_payments = [];
    migration.mixin_reconciliation_timers = {};
    migration.mixin_reconciliation_attempts = {};
    migration.mixin_reconciliation_delays = [2000];
    migration.updatePayment = jest.fn(async () => {});
    migration.app = {
      wallet: {
        convertNolanToSaito: jest.fn(() => '666'),
        returnCryptoModuleByTicker: jest.fn(() => crypto),
        receivePayment: jest.fn()
      }
    };

    try {
      await migration.resumeAwaitingMixin({
        id: 22,
        status: 'awaiting_mixin',
        nolan_received: '66600000000',
        mixin: 'sender|mixin-user-id|mixin',
        announcement_hash: hash,
        created_at: 1787668078515
      });

      expect(migration.app.wallet.receivePayment).toHaveBeenCalledWith(
        'ERC-SAITO',
        'sender|mixin-user-id|mixin',
        '666',
        hash
      );
      expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 2000);

      await retry();

      expect(crypto.findInboundPaymentBySignature).toHaveBeenCalledTimes(2);
      expect(migration.updatePayment).toHaveBeenCalledWith(
        expect.objectContaining({ id: 22, status: 'pending' })
      );
      expect(migration.pending_payments).toEqual([
        expect.objectContaining({ id: 22, status: 'pending' })
      ]);
      expect(migration.payment_cache[hash]).toBeUndefined();
    } finally {
      setTimeoutSpy.mockRestore();
    }
  });

  test('retries startup reconciliation after Mixin installs ERC-SAITO', async () => {
    const hash = 'startup-mixin-hash';
    let retry = null;
    const setTimeoutSpy = jest.spyOn(global, 'setTimeout').mockImplementation((callback) => {
      retry = callback;
      return { unref: jest.fn() };
    });
    const crypto = {
      findInboundPaymentBySignature: jest.fn(async () => ({ transaction_signature: hash }))
    };
    const migration = Object.create(Migration.prototype);
    const returnCryptoModuleByTicker = jest.fn().mockReturnValueOnce(null).mockReturnValue(crypto);

    migration.wrapped_saito_ticker = 'ERC-SAITO';
    migration.ercMod = null;
    migration.payment_cache = {};
    migration.pending_payments = [];
    migration.mixin_reconciliation_timers = {};
    migration.mixin_reconciliation_attempts = {};
    migration.mixin_reconciliation_delays = [2000];
    migration.updatePayment = jest.fn(async () => {});
    migration.app = {
      wallet: {
        convertNolanToSaito: jest.fn(() => '777'),
        returnCryptoModuleByTicker,
        receivePayment: jest.fn()
      }
    };

    try {
      await migration.resumeAwaitingMixin({
        id: 21,
        status: 'awaiting_mixin',
        nolan_received: '77700000000',
        mixin: 'sender|mixin-user-id|mixin',
        announcement_hash: hash,
        created_at: 1787665543032
      });

      expect(migration.app.wallet.receivePayment).not.toHaveBeenCalled();
      expect(crypto.findInboundPaymentBySignature).not.toHaveBeenCalled();

      await retry();

      expect(returnCryptoModuleByTicker).toHaveBeenCalledTimes(2);
      expect(crypto.findInboundPaymentBySignature).toHaveBeenCalledWith(
        hash,
        '777',
        'sender|mixin-user-id|mixin',
        1787665543032
      );
      expect(migration.pending_payments).toEqual([
        expect.objectContaining({ id: 21, status: 'pending' })
      ]);
    } finally {
      setTimeoutSpy.mockRestore();
    }
  });
});
