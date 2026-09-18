// @ts-nocheck
jest.mock('../../../lib/saito/transaction', () => ({ default: class Transaction {} }));
jest.mock('../../../lib/saito/saito', () => ({}));
jest.mock('../../../lib/templates/modtemplate', () => class ModTemplate {});
jest.mock('../../../lib/saito/ui/saito-header/saito-header', () => class SaitoHeader {});
jest.mock(
  '../../../lib/saito/ui/saito-overlay/saito-overlay',
  () =>
    class SaitoOverlay {
      visible = false;
      show = jest.fn((_html, callback = null) => {
        this.visible = true;
        this.callback_on_close = callback;
      });
      close = jest.fn(() => {
        this.visible = false;
        this.callback_on_close?.();
      });
      blockClose = jest.fn();
    }
);
jest.mock('../../../mods/buysaito/index', () => jest.fn());

const { EventEmitter } = require('events');
const BuySaito = require('../../../mods/buysaito/buysaito');
const PurchaseOverlay = require('../../../mods/buysaito/lib/saito-purchase');
const MixinModule = require('../../../mods/mixin/lib/mixinmodule');

function setup() {
  const app = {
    BROWSER: 1,
    connection: new EventEmitter(),
    modules: { getRespondTos: () => [] },
    browser: {
      formatDecimals: (v) => v,
      escapeHTML: (v) => String(v).replace(/</g, '&lt;'),
      generateQRCode: jest.fn()
    }
  };
  const mod = Object.assign(Object.create(BuySaito.prototype), {
    app,
    publicKey: 'buyer',
    authorized_public_key: 'treasury',
    pending_payments: [],
    available_currencies: [{ ticker: 'USDT' }]
  });
  const overlay = new PurchaseOverlay(app, mod);
  overlay.active = true;
  overlay.crypto_selected = mod.available_currencies[0];
  const reservation = {
    id: 42,
    destination: 'deposit-address',
    ticker: 'USDT',
    mixin_id: 'mixin-user',
    issue_amount: 100,
    expected_deposit: 1,
    reserved_until: Date.now() + 10000,
    status: 'new'
  };
  const receive = async (request, data, sender = 'treasury') => {
    await mod.handlePeerTransaction(app, {
      returnMessage: () => ({ request, data }),
      isTo: (key) => key === 'buyer',
      isFrom: (key) => key === sender
    });
  };
  return { app, mod, overlay, reservation, receive };
}

describe('BuySaito automatic payment progress', () => {
  const originalDocument = global.document;
  const originalAlert = global.salert;
  const originalConfirm = global.sconfirm;
  beforeEach(() => {
    jest.useFakeTimers();
    global.document = {
      querySelectorAll: () => [],
      querySelector: () => null,
      getElementById: () => null
    };
    global.salert = jest.fn();
    global.sconfirm = jest.fn();
  });
  afterEach(() => {
    jest.useRealTimers();
    global.document = originalDocument;
    global.salert = originalAlert;
    global.sconfirm = originalConfirm;
    jest.restoreAllMocks();
  });

  test('advances the same overlay on authenticated detection and cancels expiry', async () => {
    const { overlay, reservation, receive } = setup();
    const layer = overlay.overlay;
    await receive('buysaito reserve address', reservation);
    const instructions = layer.show.mock.calls.at(-1)[0];
    expect(instructions).toContain('deposit-address');
    expect(instructions).not.toMatch(/cancel-purchase-btn|confirm-purchase-btn|class="timer/);
    await receive('buysaito payment detected', { ...reservation, status: 'pending' });
    expect(overlay.overlay).toBe(layer);
    expect(layer.show.mock.calls.at(-1)[0]).toContain('Payment detected');
    jest.advanceTimersByTime(20000);
    expect(layer.close).not.toHaveBeenCalled();
    expect(global.salert).not.toHaveBeenCalled();
  });

  test.each([
    ['untrusted sender', {}, 'stranger'],
    ['other reservation at the same address', { id: 41 }, 'treasury'],
    ['other address', { destination: 'other-address' }, 'treasury'],
    ['other asset', { ticker: 'BTC' }, 'treasury'],
    ['unpaid status', { status: 'new' }, 'treasury']
  ])('ignores %s and expires the unpaid overlay', async (_, changes, sender) => {
    const { overlay, reservation, receive } = setup();
    await receive('buysaito reserve address', reservation);
    await receive(
      'buysaito payment detected',
      { ...reservation, status: 'pending', ...changes },
      sender
    );
    expect(overlay.payment_detected).toBe(false);
    jest.advanceTimersByTime(10000);
    expect(overlay.overlay.close).toHaveBeenCalledTimes(1);
    expect(overlay.active).toBe(false);
    expect(global.salert).toHaveBeenCalledWith('The payment time has timed out. Please try again.');
    await receive('buysaito reserve address', reservation);
    expect(overlay.overlay.show).toHaveBeenCalledTimes(1);
  });

  test('replaces the same overlay on completion without a success alert', async () => {
    const { overlay, reservation, receive } = setup();
    const layer = overlay.overlay;
    await receive('buysaito reserve address', reservation);
    await receive('buysaito payment detected', { ...reservation, status: 'pending' });
    await receive('buysaito saito issued', { ...reservation, paid: 'signed-payout' });
    expect(overlay.overlay).toBe(layer);
    expect(layer.show.mock.calls.at(-1)[0]).toContain('SAITO sent');
    expect(layer.show.mock.calls.at(-1)[0]).toContain('signed-payout');
    expect(layer.show.mock.calls.at(-1)[0]).not.toContain('saito-spinner');
    expect(layer.closebox).toBe(true);
    expect(layer.close).not.toHaveBeenCalled();
    jest.advanceTimersByTime(20000);
    expect(global.salert).not.toHaveBeenCalled();
  });

  test.each([
    ['wallet receipt first', true],
    ['treasury notice first', false]
  ])('shows the received amount with %s', async (_, receiptFirst) => {
    const { app, overlay, reservation, receive } = setup();
    await receive('buysaito reserve address', reservation);
    const receipt = {
      ticker: 'SAITO',
      sender: 'treasury',
      receiver: 'buyer',
      signature: 'signed-payout',
      amount: '100.125'
    };
    if (receiptFirst) app.connection.emit('on-payment-received', receipt);
    await receive('buysaito saito issued', { ...reservation, paid: 'signed-payout' });
    if (!receiptFirst) app.connection.emit('on-payment-received', receipt);
    const html = overlay.overlay.show.mock.calls.at(-1)[0];
    expect(html).toContain('100.125 SAITO Received');
    expect(html).not.toContain('The payment has arrived in your wallet.');
    expect(html).not.toContain('SAITO sent');
    const calls = overlay.overlay.show.mock.calls.length;
    app.connection.emit('on-payment-received', receipt);
    expect(overlay.overlay.show).toHaveBeenCalledTimes(calls);
    expect(global.salert).not.toHaveBeenCalled();
  });

  test.each([
    { signature: 'unrelated-payout' },
    { sender: 'someone-else' },
    { receiver: 'another-recipient' },
    { ticker: 'ERC-SAITO' },
    { amount: '0' },
    { amount: 'invalid' }
  ])('ignores unrelated or invalid receipts: %j', async (changes) => {
    const { app, overlay, reservation, receive } = setup();
    await receive('buysaito reserve address', reservation);
    await receive('buysaito saito issued', { ...reservation, paid: 'signed-payout' });
    app.connection.emit('on-payment-received', {
      ticker: 'SAITO',
      sender: 'treasury',
      receiver: 'buyer',
      signature: 'signed-payout',
      amount: '100',
      ...changes
    });
    expect(overlay.overlay.show.mock.calls.at(-1)[0]).toContain('SAITO sent');
  });

  test.each([true, false])(
    'never reopens a closed overlay (issuance already known: %s)',
    async (issued) => {
      const { app, overlay, reservation, receive } = setup();
      await receive('buysaito reserve address', reservation);
      if (issued) await receive('buysaito saito issued', { ...reservation, paid: 'signed-payout' });
      overlay.overlay.close();
      const calls = overlay.overlay.show.mock.calls.length;
      app.connection.emit('on-payment-received', {
        ticker: 'SAITO',
        sender: 'treasury',
        receiver: 'buyer',
        signature: 'signed-payout',
        amount: '100'
      });
      await receive('buysaito saito issued', { ...reservation, paid: 'signed-payout' });
      expect(overlay.overlay.show).toHaveBeenCalledTimes(calls);
      expect(overlay.overlay.visible).toBe(false);
    }
  );

  test('does not apply the previous purchase receipt to a new purchase', async () => {
    const { app, mod, overlay, reservation, receive } = setup();
    await receive('buysaito reserve address', reservation);
    app.connection.emit('on-payment-received', {
      ticker: 'SAITO',
      sender: 'treasury',
      receiver: 'buyer',
      signature: 'signed-payout',
      amount: '100'
    });
    overlay.reset();
    const next = { ...reservation, id: 43 };
    overlay.crypto_selected = mod.available_currencies[0];
    await receive('buysaito reserve address', next);
    overlay.updateSaitoIssued({ ...reservation, paid: 'signed-payout' });
    expect(overlay.overlay.show.mock.calls.at(-1)[0]).toContain('Awaiting Payment');
    await receive('buysaito saito issued', { ...next, paid: 'new-payout' });
    expect(overlay.overlay.show.mock.calls.at(-1)[0]).toContain('SAITO sent');
    expect(overlay.saito_receipts.size).toBe(0);
  });

  test.each([
    ['43d61dcd-e413-450d-80b8-101d5e903357', 'https://etherscan.io/address/'],
    ['1949e683-6a08-49e2-b087-d6b72398588f', 'https://bscscan.com/address/']
  ])(
    'uses the advertised chain %s for the address link, regardless of token ticker',
    (chain_id, base) => {
      const { mod, overlay, app } = setup();
      const template = require('../../../mods/buysaito/lib/saito-purchase.template');
      const destination = '0x1234567890123456789012345678901234567890';
      overlay.crypto_selected = { ticker: 'USDC', chain_id };
      overlay.destination = destination;
      const html = template(app, mod, overlay);
      expect(html).toContain(`id="profile-public-key">${destination}</div>`);
      expect(html).toContain(`href="${base}${destination}"`);
      expect(html).toContain('<details class="help">');
      expect(html).toContain('<summary>Help</summary>');
      expect(html).toContain('href="mailto:support@saito.io"');
      expect(html).toContain('check transactions to payment address');
    }
  );

  test('uses local chain metadata only when the advertised currency lacks it', () => {
    const { mod, app } = setup();
    app.wallet = {
      returnCryptoModuleByTicker: () => ({ chain_id: '43d61dcd-e413-450d-80b8-101d5e903357' })
    };
    expect(mod.returnPaymentAddressExplorer({ ticker: 'USDC' }, 'address')).toBe(
      'https://etherscan.io/address/address'
    );
    expect(
      mod.returnPaymentAddressExplorer(
        { ticker: 'USDC', chain_id: '1949e683-6a08-49e2-b087-d6b72398588f' },
        'address'
      )
    ).toBe('https://bscscan.com/address/address');
    expect(
      mod.returnPaymentAddressExplorer({ ticker: 'USDC', chain_id: 'unknown' }, 'address')
    ).toBe('');
  });

  test('handles EGLD separately and respects its configured explorer network', () => {
    const { mod, app } = setup();
    expect(mod.returnPaymentAddressExplorer({ ticker: 'EGLD' }, 'erd1address')).toBe(
      'https://explorer.multiversx.com/accounts/erd1address'
    );
    app.wallet = {
      returnCryptoModuleByTicker: () => ({
        options: { explorer_url: 'https://testnet-explorer.multiversx.com/' }
      })
    };
    expect(mod.returnPaymentAddressExplorer({ ticker: 'EGLD' }, 'erd1address')).toBe(
      'https://testnet-explorer.multiversx.com/accounts/erd1address'
    );
    expect(
      mod.returnPaymentAddressExplorer(
        { ticker: 'EGLD', explorer_url: 'javascript:alert(1)' },
        'erd1address'
      )
    ).toBe('');
  });

  test.each(['pending', 'confirmed', 'issuing'])(
    'resumes %s without expiring or asking for another payment',
    async (status) => {
      const { overlay, reservation, receive } = setup();
      await receive('buysaito reserve address', {
        ...reservation,
        status,
        reserved_until: Date.now() - 1000
      });
      expect(overlay.payment_detected).toBe(true);
      expect(overlay.overlay.show.mock.calls.at(-1)[0]).toContain('Waiting for SAITO issuance');
      jest.advanceTimersByTime(20000);
      expect(global.salert).not.toHaveBeenCalled();
    }
  );

  test('unclassified issuance errors preserve payment progress', async () => {
    const { overlay, reservation, receive } = setup();
    await receive('buysaito reserve address', reservation);
    await receive('buysaito payment detected', { ...reservation, status: 'confirmed' });
    const progress = overlay.overlay.show.mock.calls.at(-1)[0];
    await receive('buysaito report error', null);
    expect(overlay.overlay.show.mock.calls.at(-1)[0]).toBe(progress);
    expect(overlay.reservation.id).toBe(reservation.id);
    await receive('buysaito saito issued', { ...reservation, paid: 'payout' });
    expect(overlay.overlay.show.mock.calls.at(-1)[0]).toContain('SAITO sent');
  });

  test('only shows a funding notice for this purchase and can still complete afterward', async () => {
    const { overlay, reservation, receive } = setup();
    await receive('buysaito reserve address', reservation);
    await receive('buysaito payment detected', { ...reservation, status: 'confirmed' });
    const notice = { ...reservation, code: 'insufficient_funds' };
    await receive('buysaito report error', { ...notice, id: 999 });
    expect(overlay.overlay.show.mock.calls.at(-1)[0]).not.toContain('refilled');
    await receive('buysaito report error', notice, 'stranger');
    expect(overlay.overlay.show.mock.calls.at(-1)[0]).not.toContain('refilled');
    await receive('buysaito report error', notice);
    expect(overlay.overlay.show.mock.calls.at(-1)[0]).toContain('refilled');
    expect(overlay.active).toBe(true);
    jest.advanceTimersByTime(20000);
    expect(global.salert).not.toHaveBeenCalled();
    await receive('buysaito saito issued', { ...reservation, paid: 'payout' });
    expect(overlay.overlay.show.mock.calls.at(-1)[0]).toContain('SAITO sent');
  });

  test('reset and error dismissals clear the hidden expiry', async () => {
    const { app, mod, overlay, reservation, receive } = setup();
    await receive('buysaito reserve address', reservation);
    overlay.reset();
    jest.advanceTimersByTime(10000);
    expect(global.salert).not.toHaveBeenCalled();
    overlay.crypto_selected = mod.available_currencies[0];
    await receive('buysaito reserve address', {
      ...reservation,
      reserved_until: Date.now() + 10000
    });
    app.connection.emit('saito-purchase-error-notification', { message: 'Service error' });
    jest.advanceTimersByTime(10000);
    expect(global.salert).not.toHaveBeenCalled();
  });

  test('late internal transfer completion cannot overwrite detected payment progress', async () => {
    const { mod, overlay, reservation, receive } = setup();
    mod.available_currencies[0].available_balance = 2;
    let completeTransfer;
    overlay.handleInternalTransfer = jest.fn(
      () =>
        new Promise((resolve) => {
          completeTransfer = resolve;
        })
    );
    await receive('buysaito reserve address', reservation);
    const transfer = overlay.payFromWallet(overlay.reservation);
    expect(overlay.handleInternalTransfer).toHaveBeenCalledTimes(1);
    await receive('buysaito payment detected', { ...reservation, status: 'confirmed' });
    completeTransfer(true);
    await transfer;
    expect(overlay.overlay.show.mock.calls.at(-1)[0]).toContain('Payment received');
    jest.advanceTimersByTime(20000);
    expect(global.salert).not.toHaveBeenCalled();
  });

  test.each([undefined, 0, 0.5, 1, 2])(
    'offers wallet payment only with sufficient balance (%s)',
    async (balance) => {
      const { mod, overlay, reservation, receive } = setup();
      mod.available_currencies[0].available_balance = balance;
      overlay.handleInternalTransfer = jest.fn();
      await receive('buysaito reserve address', reservation);
      const html = overlay.overlay.show.mock.calls.at(-1)[0];
      if (balance >= reservation.expected_deposit) {
        expect(html).toContain(`Pay from Wallet Balance (${balance} USDT)`);
      } else {
        expect(html).not.toContain('pay-from-wallet-btn');
      }
      expect(overlay.handleInternalTransfer).not.toHaveBeenCalled();
      expect(global.sconfirm).not.toHaveBeenCalled();
    }
  );

  test('the wallet button sends the quoted amount once and waits for detection', async () => {
    const { app, mod, overlay, reservation, receive } = setup();
    mod.available_currencies[0].available_balance = 2;
    const button = {};
    jest
      .spyOn(document, 'getElementById')
      .mockImplementation((id) => (id === 'pay-from-wallet-btn' ? button : null));
    let completeTransfer;
    const sendPayment = jest.fn(
      () =>
        new Promise((resolve) => {
          completeTransfer = resolve;
        })
    );
    app.wallet = { returnCryptoModuleByTicker: () => ({ sendPayment }) };
    await receive('buysaito reserve address', reservation);
    const click = button.onclick;
    const transfer = click();
    await click();
    expect(overlay.overlay.show.mock.calls.at(-1)[0]).toContain('Sending Payment');
    completeTransfer('success');
    await transfer;
    expect(sendPayment).toHaveBeenCalledTimes(1);
    expect(sendPayment).toHaveBeenCalledWith(1, 'deposit-address|mixin-user|mixin', 'success');
    const html = overlay.overlay.show.mock.calls.at(-1)[0];
    expect(html).toContain('Awaiting Payment');
    expect(html).toContain('buysaito-payment-processing');
    expect(html).toContain('Payment processing...');
    expect(html).toMatch(/id="pay-from-wallet-btn"[^>]*disabled/);
    expect(overlay.overlay.closebox).toBe(true);
    await click();
    expect(sendPayment).toHaveBeenCalledTimes(1);
    await receive('buysaito payment detected', { ...reservation, status: 'confirmed' });
    expect(overlay.overlay.show.mock.calls.at(-1)[0]).toContain('Payment received');
    expect(overlay.overlay.show.mock.calls.at(-1)[0]).not.toContain('buysaito-payment-processing');
    expect(global.sconfirm).not.toHaveBeenCalled();
  });

  test.each([
    ['transaction hash', { status: 200, message: [{ transaction_hash: 'a'.repeat(64) }] }, true],
    ['fallback identifier', { status: 200, message: [] }, true],
    ['rejected transfer', { status: 400, message: 'Payment rejected' }, false]
  ])('handles the actual Mixin sendPayment result: %s', async (_, response, processing) => {
    const { app, mod, overlay, reservation, receive } = setup();
    mod.available_currencies[0].available_balance = 2;
    const crypto = Object.assign(Object.create(MixinModule.prototype), {
      asset_id: 'usdt-asset',
      processAddress: async (address) => address,
      mixin: { sendInNetworkTransferRequest: jest.fn(async () => response) }
    });
    app.wallet = { returnCryptoModuleByTicker: () => crypto };
    await receive('buysaito reserve address', reservation);
    await overlay.payFromWallet(overlay.reservation);
    expect(overlay.internal_payment_pending).toBe(processing);
    const html = overlay.overlay.show.mock.calls.at(-1)[0];
    expect(html).toContain('Awaiting Payment');
    expect(html.includes('buysaito-payment-processing')).toBe(processing);
    expect(/id="pay-from-wallet-btn"[^>]*disabled/.test(html)).toBe(processing);
    if (processing) {
      await overlay.payFromWallet(overlay.reservation);
      expect(crypto.mixin.sendInNetworkTransferRequest).toHaveBeenCalledTimes(1);
    }
  });

  test('restores the wallet button when the transfer fails', async () => {
    const { mod, overlay, reservation, receive } = setup();
    mod.available_currencies[0].available_balance = 2;
    overlay.handleInternalTransfer = jest.fn(async () => false);
    await receive('buysaito reserve address', reservation);
    await overlay.payFromWallet(overlay.reservation);
    expect(overlay.internal_payment_pending).toBe(false);
    expect(overlay.overlay.show.mock.calls.at(-1)[0]).toContain('pay-from-wallet-btn');
    expect(overlay.overlay.show.mock.calls.at(-1)[0]).not.toContain('buysaito-payment-processing');
    expect(overlay.overlay.show.mock.calls.at(-1)[0]).not.toMatch(
      /id="pay-from-wallet-btn"[^>]*disabled/
    );
  });

  test.each(['expired', 'detected', 'closed', 'replaced'])(
    'ignores a stale wallet button after the purchase is %s',
    async (state) => {
      const { mod, overlay, reservation, receive } = setup();
      mod.available_currencies[0].available_balance = 2;
      overlay.handleInternalTransfer = jest.fn();
      await receive('buysaito reserve address', reservation);
      const current = overlay.reservation;
      if (state === 'expired') jest.advanceTimersByTime(10000);
      if (state === 'detected')
        await receive('buysaito payment detected', { ...reservation, status: 'confirmed' });
      if (state === 'closed') overlay.close();
      if (state === 'replaced') overlay.reservation = { ...reservation, id: 43 };
      await overlay.payFromWallet(current);
      expect(overlay.handleInternalTransfer).not.toHaveBeenCalled();
    }
  );

  test.each(['pending', 'confirmed'])(
    'treasury persists %s before notifying without exposing credentials',
    async (status) => {
      const { mod, app, reservation } = setup();
      const order = [];
      app.storage = { runDatabase: jest.fn(async () => order.push('persist')) };
      app.connection.on('relay-send-message', (msg) => order.push(msg));
      const payment = {
        ...reservation,
        initiator_pubkey: 'buyer',
        mixin: { session_seed: 'secret', spend_private_key: 'secret' }
      };
      await (status === 'pending'
        ? mod.authorizePaymentIssuance(payment)
        : mod.confirmPaymentReceipt(payment));
      expect(order).toEqual([
        'persist',
        {
          recipient: 'buyer',
          request: 'buysaito payment detected',
          data: { id: 42, ticker: 'USDT', destination: 'deposit-address', status }
        }
      ]);
    }
  );

  test.each([
    ['pending deposit', [{ amount: '1', state: 'pending' }], [], 'pending'],
    ['safe receipt', [], [{ amount: '1', deposit: { sender: 'payer' } }], 'confirmed'],
    ['underpayment', [{ amount: '0.5', state: 'pending' }], [], 'new']
  ])(
    'polling a %s only advances when the expected amount is present',
    async (_, deposits, snapshots, status) => {
      const { app, mod, reservation } = setup();
      const payment = {
        ...reservation,
        ts: Date.now(),
        initiator_pubkey: 'buyer',
        mixin: { user_id: 'account' }
      };
      mod.pending_payments = [payment];
      mod.time_limit = 10000;
      mod.mixin_mod = {
        mixin: { user_id: 'account' },
        consolidatedLookUp: jest.fn(async () => ({ deposits, snapshots, utxo: 0 }))
      };
      app.storage = { runDatabase: jest.fn(async () => ({})) };
      app.wallet = {
        getBalance: jest.fn(async () => 1000n * 100000000n),
        convertSaitoToNolan: jest.fn((v) => BigInt(v) * 100000000n),
        convertNolanToSaito: (v) => Number(v) / 100000000,
        addTransactionToPending: jest.fn(async () => {})
      };
      app.network = { propagateTransaction: jest.fn(async () => {}) };
      mod.createSaitoIssuanceTransaction = jest.fn(async () => ({ signature: 'payout' }));
      mod.recordPaymentIssuance = jest.fn(async (pendingPayment, tx) => {
        pendingPayment.paid = tx.signature;
      });
      mod.rebroadcastPaymentIssuance = jest.fn(async () => {});
      const errors = jest.spyOn(console, 'error');
      const emit = jest.spyOn(app.connection, 'emit');
      await mod.processPendingPayments();
      expect(payment.status).toBe(status);
      if (status === 'new') {
        expect(emit).not.toHaveBeenCalled();
        expect(mod.createSaitoIssuanceTransaction).not.toHaveBeenCalled();
      } else {
        expect(mod.createSaitoIssuanceTransaction).toHaveBeenCalledTimes(1);
        expect(mod.recordPaymentIssuance).toHaveBeenCalledWith(payment, { signature: 'payout' });
        expect(app.wallet.addTransactionToPending).toHaveBeenCalledWith({ signature: 'payout' });
        expect(app.network.propagateTransaction).toHaveBeenCalledWith({ signature: 'payout' });
        expect(payment.paid).toBe('payout');
        expect(emit).toHaveBeenCalledWith(
          'relay-send-message',
          expect.objectContaining({
            request: 'buysaito payment detected',
            data: expect.objectContaining({ status })
          })
        );
        // Repeat polling republishes progress even when the payment state is unchanged.
        emit.mockClear();
        await mod.processPendingPayments();
        expect(mod.createSaitoIssuanceTransaction).toHaveBeenCalledTimes(1);
        expect(mod.rebroadcastPaymentIssuance).toHaveBeenCalledWith(payment);
        expect(emit).toHaveBeenCalledWith(
          'relay-send-message',
          expect.objectContaining({
            request: 'buysaito payment detected',
            data: expect.objectContaining({ status })
          })
        );
      }
      expect(errors).not.toHaveBeenCalled();
    }
  );

  test.each(['new', 'pending', 'confirmed'])('treasury resumes actual %s status', (status) => {
    const { mod, app, reservation } = setup();
    mod.clearInactivePayments = jest.fn();
    mod.pending_payments = [
      {
        ...reservation,
        status,
        ts: Date.now(),
        initiator_pubkey: 'buyer',
        mixin: { user_id: 'mixin-user' }
      }
    ];
    const emit = jest.spyOn(app.connection, 'emit');
    mod.hasPendingPayment('buyer');
    expect(emit).toHaveBeenCalledWith(
      'relay-send-message',
      expect.objectContaining({ data: expect.objectContaining({ id: 42, status }) })
    );
  });

  test.each(['new', 'pending', 'confirmed'])(
    'the close control dismisses %s progress and clears timers',
    async (status) => {
      const { app, overlay, reservation, receive } = setup();
      await receive('buysaito reserve address', { ...reservation, status });
      expect(overlay.overlay.closebox).toBe(true);
      overlay.overlay.close();
      expect(overlay.active).toBe(false);
      expect(overlay.reservation).toBeNull();
      expect(overlay.crypto_selected).toBe(false);
      const calls = overlay.overlay.show.mock.calls.length;
      await receive('buysaito reserve address', reservation);
      await receive('buysaito payment detected', { ...reservation, status: 'confirmed' });
      app.connection.emit('saito-purchase-error-notification', { message: 'Late error' });
      jest.advanceTimersByTime(40000);
      expect(overlay.overlay.show).toHaveBeenCalledTimes(calls);
      expect(global.salert).not.toHaveBeenCalled();
    }
  );

  test('Get SAITO always starts at crypto selection and ignores old deposit instructions', async () => {
    const { app, mod, overlay, reservation, receive } = setup();
    await receive('buysaito reserve address', reservation);
    overlay.overlay.close();
    const button = {};
    const amountInput = { value: '100', addEventListener: jest.fn() };
    jest
      .spyOn(document, 'getElementById')
      .mockImplementation(
        (id) => ({ 'buysaito-button': button, 'purchase-saito-amount': amountInput })[id] || null
      );
    mod.pending_payments = [reservation];
    mod.attachEvents();
    button.onclick();
    jest.advanceTimersByTime(1000);
    expect(overlay.overlay.closebox).toBe(true);
    expect(overlay.overlay.show.mock.calls.at(-1)[0]).toContain('CHOOSE PAYMENT METHOD');
    await receive('buysaito reserve address', reservation);
    expect(overlay.crypto_selected).toBe(false);
    expect(overlay.overlay.show.mock.calls.at(-1)[0]).toContain('CHOOSE PAYMENT METHOD');
  });

  test('closing during a wallet balance lookup prevents a late payment request', async () => {
    const { app, mod, overlay } = setup();
    const currencyButton = {};
    jest
      .spyOn(document, 'querySelectorAll')
      .mockImplementation((selector) =>
        selector === '.purchase-crypto-item' ? [currencyButton] : []
      );
    let completeLookup;
    overlay.checkForLocalCrypto = jest.fn(
      () =>
        new Promise((resolve) => {
          completeLookup = resolve;
        })
    );
    const emit = jest.spyOn(app.connection, 'emit');
    app.connection.emit('saito-purchase-launch', 100);
    jest.advanceTimersByTime(1000);
    const selecting = currencyButton.onclick({ currentTarget: { id: 'USDT' } });
    overlay.overlay.close();
    completeLookup();
    await selecting;
    expect(emit).not.toHaveBeenCalledWith(
      'relay-send-message',
      expect.objectContaining({ request: 'buysaito reserve address' })
    );
    expect(overlay.overlay.visible).toBe(false);
  });

  test('a wallet balance lookup cannot overwrite the next purchase currency balance', async () => {
    const { app, overlay } = setup();
    let completeLookup;
    app.wallet = {};
    app.wallet.returnCryptoModuleByTicker = () => ({
      options: { isActivated: true },
      activate: async () => {},
      getAvailableBalance: () =>
        new Promise((resolve) => {
          completeLookup = resolve;
        })
    });
    const lookup = overlay.checkForLocalCrypto();
    await Promise.resolve();
    overlay.close();
    overlay.active = true;
    overlay.crypto_selected = { ticker: 'BTC', available_balance: 0.01 };
    completeLookup(100);
    await lookup;
    expect(overlay.crypto_selected.available_balance).toBe(0.01);
  });

  test('treasury resumes only the chosen currency while preserving other pending deposits', async () => {
    const { app, mod, reservation } = setup();
    app.BROWSER = 0;
    mod.publicKey = 'treasury';
    mod.service_ready = true;
    mod.clearInactivePayments = jest.fn();
    const existing = {
      ...reservation,
      initiator_pubkey: 'buyer',
      mixin: { user_id: 'mixin-user' }
    };
    mod.pending_payments = [existing];
    mod.checkPrices = jest.fn(async () => {});
    mod.findAvailableAddress = jest.fn(async () => {});
    const requested = { initiator_pubkey: 'buyer', ticker: 'BTC', issue_amount: 100 };
    const tx = {
      from: [{ publicKey: 'buyer' }],
      isTo: () => true,
      isFrom: (key) => key === 'buyer',
      returnMessage: () => ({ request: 'buysaito reserve address', data: requested })
    };
    await mod.handlePeerTransaction(app, tx);
    expect(mod.findAvailableAddress).toHaveBeenCalledWith(requested);
    expect(mod.pending_payments).toEqual([existing]);
    mod.findAvailableAddress.mockClear();
    requested.ticker = 'USDT';
    const emit = jest.spyOn(app.connection, 'emit');
    await mod.handlePeerTransaction(app, tx);
    expect(mod.findAvailableAddress).not.toHaveBeenCalled();
    expect(emit).toHaveBeenCalledWith(
      'relay-send-message',
      expect.objectContaining({ data: expect.objectContaining({ id: 42, ticker: 'USDT' }) })
    );
  });
});
