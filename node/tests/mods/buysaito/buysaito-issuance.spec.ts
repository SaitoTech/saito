// @ts-nocheck

jest.mock('../../../lib/saito/transaction', () => ({ default: class Transaction {} }));
jest.mock('../../../lib/saito/saito', () => ({}));
jest.mock('../../../lib/templates/modtemplate', () => class ModTemplate {});
jest.mock('../../../lib/saito/ui/saito-header/saito-header', () => class SaitoHeader {});
jest.mock('../../../mods/buysaito/index', () => jest.fn());
jest.mock('../../../mods/buysaito/lib/saito-purchase', () => class SaitoPurchaseOverlay {});

const BuySaito = require('../../../mods/buysaito/buysaito');

function makeModule() {
  return Object.create(BuySaito.prototype);
}

describe('BuySaito issuance lifecycle', () => {
  test('upgrades an existing purchases table with durable issuance fields', async () => {
    const mod = makeModule();
    mod.app = {
      storage: {
        queryDatabase: jest.fn(async () => [{ name: 'id' }, { name: 'paid' }]),
        runDatabase: jest.fn(async () => ({}))
      }
    };

    await mod.ensurePurchasesSchema();

    const statements = mod.app.storage.runDatabase.mock.calls.map(([sql]) => sql);
    expect(statements).toHaveLength(4);
    expect(statements).toEqual(
      expect.arrayContaining([
        expect.stringContaining('ADD COLUMN issuance_tx'),
        expect.stringContaining('ADD COLUMN issuance_at'),
        expect.stringContaining('ADD COLUMN issuance_block_id'),
        expect.stringContaining('ADD COLUMN issuance_block_hash')
      ])
    );
  });

  test('persists a signed payout before adding it to pending and propagating it', async () => {
    const order = [];
    const payment = {
      id: 22,
      active: 1,
      status: 'confirmed',
      paid: '',
      issue_amount: 100
    };
    const tx = { signature: 'payout-signature' };
    const mod = makeModule();

    mod.pending_payments = [payment];
    mod.clearInactivePayments = jest.fn();
    mod.createSaitoIssuanceTransaction = jest.fn(async () => tx);
    mod.recordPaymentIssuance = jest.fn(async (pendingPayment, signedTx) => {
      order.push('persist');
      pendingPayment.paid = signedTx.signature;
    });
    mod.app = {
      wallet: {
        getBalance: jest.fn(async () => 1000n),
        convertSaitoToNolan: jest.fn((amount) => BigInt(amount)),
        convertNolanToSaito: jest.fn((balance) => balance.toString()),
        addTransactionToPending: jest.fn(async () => order.push('pending'))
      },
      network: {
        propagateTransaction: jest.fn(async () => order.push('propagate'))
      },
      connection: { emit: jest.fn() }
    };

    await mod._processPendingPayments();

    expect(order).toEqual(['persist', 'pending', 'propagate']);
    expect(payment.active).toBe(1);
  });

  test.each([
    ['sufficient balance with string amount', 1000n, '900', 1000n, true, false],
    ['exact balance', 100n, '100', 100n, true, false],
    ['pending change covers payout', 0n, '100', 100n, false, false],
    ['confirmed shortage', 99n, '100', 99n, false, true],
    ['unavailable pending balance', 0n, '100', undefined, false, false],
    ['null pending balance', 0n, '100', null, false, false],
    ['null available balance', null, '100', 0n, false, false],
    ['unavailable available balance', undefined, '100', 0n, false, false]
  ])('classifies funding: %s', async (_, balance, amount, pending, issues, warns) => {
    const payment = {
      id: 22,
      active: 1,
      status: 'confirmed',
      paid: '',
      issue_amount: amount,
      initiator_pubkey: 'buyer',
      ticker: 'USDT',
      destination: 'deposit-address'
    };
    const mod = makeModule();
    mod.pending_payments = [payment];
    mod.clearInactivePayments = jest.fn();
    mod.createSaitoIssuanceTransaction = jest.fn(async () => ({ signature: 'payout' }));
    mod.recordPaymentIssuance = jest.fn(async (p, tx) => {
      p.paid = tx.signature;
    });
    mod.rebroadcastPaymentIssuance = jest.fn();
    mod.app = {
      wallet: {
        getBalance: jest.fn(async () => balance),
        convertSaitoToNolan: (value) => BigInt(value),
        convertNolanToSaito: (value) => value.toString(),
        addTransactionToPending: jest.fn()
      },
      core: { wallet: { getPendingBalance: jest.fn(async () => pending) } },
      network: { propagateTransaction: jest.fn() },
      connection: { emit: jest.fn() }
    };

    await mod._processPendingPayments();
    await mod._processPendingPayments();

    expect(mod.createSaitoIssuanceTransaction).toHaveBeenCalledTimes(issues ? 1 : 0);
    const notices = mod.app.connection.emit.mock.calls.filter(
      ([event, data]) => event === 'relay-send-message' && data.request === 'buysaito report error'
    );
    expect(notices).toHaveLength(warns ? 1 : 0);
    if (warns) {
      expect(notices[0][1].data).toEqual({
        code: 'insufficient_funds',
        id: 22,
        ticker: 'USDT',
        destination: 'deposit-address'
      });
    }
  });

  test.each(['create', 'persist', 'pending', 'propagate'])(
    'keeps %s failures queued without a funding warning',
    async (stage) => {
      const payment = { id: 22, active: 1, status: 'confirmed', paid: '', issue_amount: 100 };
      const tx = { signature: 'payout' };
      const mod = makeModule();
      const fail = (step) => {
        if (step === stage) throw new Error('Temporary issuance failure');
      };
      mod.pending_payments = [payment];
      mod.clearInactivePayments = jest.fn();
      mod.createSaitoIssuanceTransaction = jest.fn(async () => {
        fail('create');
        return tx;
      });
      mod.recordPaymentIssuance = jest.fn(async (p, signedTx) => {
        fail('persist');
        p.paid = signedTx.signature;
      });
      mod.rebroadcastPaymentIssuance = jest.fn();
      mod.app = {
        wallet: {
          getBalance: jest.fn(async () => 1000n),
          convertSaitoToNolan: (value) => BigInt(value),
          addTransactionToPending: jest.fn(async () => fail('pending'))
        },
        network: { propagateTransaction: jest.fn(async () => fail('propagate')) },
        connection: { emit: jest.fn() }
      };

      await mod._processPendingPayments();
      expect(mod.app.connection.emit).not.toHaveBeenCalledWith(
        'relay-send-message',
        expect.objectContaining({ request: 'buysaito report error' })
      );
      expect(payment.active).toBe(1);
      expect(mod.app.connection.emit).toHaveBeenCalledWith(
        'mailrelay-send-email',
        expect.objectContaining({ text: 'Error: Temporary issuance failure' })
      );

      stage = '';
      await mod._processPendingPayments();
      if (payment.paid && mod.createSaitoIssuanceTransaction.mock.calls.length === 1) {
        expect(mod.rebroadcastPaymentIssuance).toHaveBeenCalledWith(payment);
      } else {
        expect(mod.app.network.propagateTransaction).toHaveBeenCalledWith(tx);
      }
      expect(payment.paid).toBe('payout');
    }
  );

  test('keeps the signed payout message stable while recording issuance metadata', async () => {
    const payment = {
      id: 22,
      active: 1,
      status: 'confirmed',
      paid: '',
      issuance_tx: '',
      issuance_at: 0,
      recipient_pubkey: 'recipient',
      initiator_pubkey: 'buyer',
      issue_amount: 100,
      expected_deposit: 1,
      ticker: 'USDT',
      mixin: { spend_private_key: 'must-not-be-published' }
    };
    let signedMessage = '';
    const tx = {
      signature: 'payout-signature',
      msg: null,
      sign: jest.fn(async function () {
        signedMessage = JSON.stringify(this.msg);
      }),
      serialize_to_web: jest.fn(() => 'serialized-payout')
    };
    const mod = makeModule();
    mod.app = {
      wallet: {
        convertSaitoToNolan: jest.fn(() => 100000),
        createUnsignedTransactionWithDefaultFee: jest.fn(async () => tx)
      },
      storage: {
        runDatabase: jest.fn(async () => ({ changes: 1 }))
      }
    };

    const signedTx = await mod.createSaitoIssuanceTransaction(payment);

    expect(signedTx.msg.data).not.toBe(payment);
    expect(signedTx.msg.data.mixin).toBeUndefined();
    await mod.recordPaymentIssuance(payment, signedTx);

    expect(payment.paid).toBe('payout-signature');
    expect(payment.issuance_tx).toBe('serialized-payout');
    expect(JSON.stringify(signedTx.msg)).toBe(signedMessage);
    expect(signedTx.msg.data.paid).toBe('');
    expect(signedTx.msg.data.issuance_tx).toBe('');
  });

  test('does not mark a payout complete until its signature is on the longest chain', async () => {
    const payment = {
      id: 22,
      active: 1,
      paid: 'payout-signature',
      initiator_pubkey: 'recipient'
    };
    const mod = makeModule();
    mod.pending_payments = [payment];
    mod.app = {
      storage: { runDatabase: jest.fn(async () => ({ changes: 1 })) },
      connection: { emit: jest.fn() }
    };
    const block = {
      id: 123,
      hash: 'block-hash',
      transactions: [{ signature: 'payout-signature' }]
    };

    await mod.confirmIssuedPaymentsInBlock(block, false);

    expect(mod.app.storage.runDatabase).not.toHaveBeenCalled();
    expect(payment.active).toBe(1);

    await mod.confirmIssuedPaymentsInBlock(block, true);

    expect(mod.app.storage.runDatabase).toHaveBeenCalledTimes(1);
    expect(payment.active).toBe(0);
    expect(payment.issuance_block_id).toBe(123);
    expect(payment.issuance_block_hash).toBe('block-hash');
    expect(mod.app.connection.emit).toHaveBeenCalledWith(
      'relay-send-message',
      expect.objectContaining({ request: 'buysaito saito issued' })
    );
  });

  test('rebroadcasts the saved payout after restart instead of creating a replacement', async () => {
    const payment = {
      id: 22,
      active: 1,
      status: 'confirmed',
      paid: 'payout-signature',
      issue_amount: 100
    };
    const mod = makeModule();
    mod.pending_payments = [payment];
    mod.clearInactivePayments = jest.fn();
    mod.rebroadcastPaymentIssuance = jest.fn(async () => {});
    mod.createSaitoIssuanceTransaction = jest.fn();
    mod.app = {
      connection: { emit: jest.fn() },
      wallet: {
        getBalance: jest.fn(async () => 1000n),
        convertSaitoToNolan: jest.fn((amount) => BigInt(amount)),
        convertNolanToSaito: jest.fn((balance) => balance.toString())
      }
    };

    await mod._processPendingPayments();

    expect(mod.rebroadcastPaymentIssuance).toHaveBeenCalledWith(payment);
    expect(mod.createSaitoIssuanceTransaction).not.toHaveBeenCalled();
  });
});
