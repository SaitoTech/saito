// @ts-nocheck

jest.mock('@mixin.dev/mixin-node-sdk', () => ({
  MixinApi: jest.fn(),
  getED25519KeyPair: jest.fn(),
  base64RawURLEncode: jest.fn(),
  MixinCashier: 'cashier',
  buildSafeTransactionRecipient: jest.fn(),
  getUnspentOutputsForRecipients: jest.fn(),
  buildSafeTransaction: jest.fn(),
  encodeSafeTransaction: jest.fn(),
  signSafeTransaction: jest.fn(),
  blake3Hash: jest.fn()
}));

jest.mock('../../../lib/saito/transaction', () => ({
  default: class Transaction {
    signature = '';
    deserialize_from_web() {
      this.signature = 'payout-sig';
    }
  }
}));

jest.mock(
  '../../../lib/saito/ui/saito-overlay/saito-overlay',
  () =>
    class SaitoOverlay {
      visible = false;
      html = '';
      show(html) {
        this.visible = true;
        this.html = html;
      }
      close() {
        this.visible = false;
      }
      blockClose() {}
      remove() {}
    }
);

const { EventEmitter } = require('events');
const Mixin = require('../../../mods/mixin/mixin');
const Transfers = require('../../../mods/mixin/lib/transfers');
const SaitoPurchaseOverlay = require('../../../mods/mixin/lib/ui/overlays/buysaito-purchase');

function memoryDatabase(initial = []) {
  const rows = initial.map((row) => ({ ...row }));
  const select = (predicate) => rows.filter(predicate).map((row) => ({ ...row }));
  return {
    rows,
    async getTransfers(criteria = {}) {
      const keys = Object.keys(criteria).filter(
        (key) => criteria[key] !== undefined && criteria[key] !== null
      );
      if (!keys.length) {
        return [];
      }
      return select((row) => keys.every((key) => String(row[key]) === String(criteria[key])));
    },
    async updateTransfer(id, fields) {
      const row = rows.find((item) => String(item.id) === String(id));
      if (row) {
        Object.assign(row, fields);
      }
    },
    async getTransfersPendingInboundBroadcast() {
      return select((row) => row.status === 'inbound_awaiting');
    },
    async getTransfersPendingInboundConfirmed() {
      return select(
        (row) =>
          row.status === 'inbound_broadcast' &&
          row.inbound_tx_hash &&
          Number(row.inbound_confirmations) >= Number(row.inbound_confirmations_required)
      );
    },
    async getTransfersPendingOutboundBroadcast() {
      return select((row) => row.status === 'outbound_awaiting' && row.outbound_tx_sig);
    },
    async getTransfersPendingOutboundConfirmed(currentBlockId) {
      return select(
        (row) =>
          row.status === 'outbound_broadcast' &&
          row.outbound_block_hash &&
          row.outbound_confirmation_block_id != null &&
          Number(row.outbound_confirmation_block_id) <= Number(currentBlockId)
      );
    }
  };
}

function transfer(overrides = {}) {
  return {
    id: 7,
    purpose: 'buysaito',
    payload: '',
    requester_publickey: 'buyer',
    recipient_publickey: 'recipient',
    status: 'inbound_awaiting',
    inbound_ticker: 'ETH',
    inbound_amount: '0.5',
    inbound_address: '0xabc',
    inbound_sender: '',
    inbound_confirmations: 0,
    inbound_confirmations_required: 0,
    inbound_tx_hash: '',
    inbound_tx_id: '',
    outbound_ticker: 'SAITO',
    outbound_amount: '10',
    outbound_tx: '',
    outbound_tx_sig: '',
    outbound_block_hash: '',
    outbound_block_id: null,
    outbound_confirmation_block_id: null,
    last_error: '',
    created_at: Date.now(),
    ...overrides
  };
}

function harness(rows = [transfer()]) {
  const sent = [];
  const app = {
    BROWSER: 0,
    options: {},
    connection: new EventEmitter(),
    network: {
      sendRequestAsTransaction(request, data, callback, publicKey) {
        sent.push({ request, data, publicKey });
      },
      propagateTransaction: jest.fn(async () => {})
    },
    wallet: {
      getBalance: async () => 10000000000n,
      convertSaitoToNolan: (amount) => BigInt(Math.floor(Number(amount))) * 100000000n,
      createUnsignedTransactionWithDefaultFee: jest.fn(async (recipient, amount) => ({
        recipient,
        amount,
        signature: '',
        async sign() {
          this.signature = 'payout-sig';
        },
        serialize_to_web() {
          return 'serialized-payout';
        }
      })),
      addTransactionToPending: jest.fn(async () => {})
    },
    blockchain: {
      getLatestBlockId: async () => 4,
      getLongestChainHashAtId: async (id) => (Number(id) === 4 ? 'block-hash' : '')
    },
    modules: {
      returnModule() {
        return null;
      },
      respondTo() {
        return [];
      },
      getRespondTos() {
        return [];
      }
    },
    browser: { formatDecimals: (value) => value, escapeHTML: (value) => value, generateQRCode() {} },
    storage: { saveOptions() {} }
  };
  const database = memoryDatabase(rows);
  const mixin = new Mixin(app);
  mixin.database = database;
  mixin.app = app;
  mixin.transfers = { processTransferQueue: jest.fn() };
  return { app, sent, database, mixin };
}

describe('Mixin admin payment testing', () => {
  test('admin-config lists outstanding buysaito transfers and their legal action', async () => {
    const { mixin } = harness([
      transfer(),
      transfer({ id: 8, status: 'failed', purpose: 'buysaito' }),
      transfer({ id: 9, purpose: 'other', status: 'inbound_awaiting' }),
      transfer({ id: 4, status: 'outbound_confirmed' })
    ]);

    const config = mixin.respondTo('admin-config');
    expect(config.id).toBe('mixin');
    expect(config.name).toBe('Mixin');

    const listed = await config.getConfig();
    expect(listed.transfers.map((row) => row.id)).toEqual([7]);
    expect(listed.transfers[0]).toEqual(
      expect.objectContaining({
        requester_publickey: 'buyer',
        recipient_publickey: 'recipient',
        inbound_ticker: 'ETH',
        inbound_amount: '0.5',
        outbound_ticker: 'SAITO',
        outbound_amount: '10',
        status: 'inbound_awaiting',
        action: { action: 'detect-inbound', label: 'Mark inbound payment detected' }
      })
    );
    expect(listed.transfers[0].payload).toBeUndefined();
  });

  test('detect then confirm writes distinguishable evidence and buyer notices', async () => {
    const { mixin, sent, database } = harness([
      transfer({ inbound_confirmations_required: 0 })
    ]);
    const config = mixin.respondTo('admin-config');

    const detected = await config.updateConfig({ id: '7', action: 'detect-inbound' });
    expect(database.rows[0]).toEqual(
      expect.objectContaining({
        status: 'inbound_broadcast',
        inbound_tx_hash: 'admin-test',
        inbound_tx_id: 'admin-test:7',
        inbound_sender: 'admin-test',
        inbound_confirmations: 0,
        inbound_confirmations_required: 1,
        outbound_tx_sig: ''
      })
    );
    expect(detected.transfers[0].action).toEqual({
      action: 'confirm-inbound',
      label: 'Mark inbound payment confirmed'
    });
    expect(sent).toEqual([
      {
        request: 'buysaito payment detected',
        data: {
          id: 7,
          address: '0xabc',
          ticker: 'ETH',
          status: 'pending',
          initiator_pubkey: 'buyer'
        },
        publicKey: 'buyer'
      }
    ]);

    const confirmed = await config.updateConfig({ id: 7, action: 'confirm-inbound' });
    expect(database.rows[0]).toEqual(
      expect.objectContaining({
        status: 'inbound_confirmed',
        inbound_confirmations: 1,
        inbound_tx_id: 'admin-test:7',
        outbound_tx: '',
        outbound_tx_sig: ''
      })
    );
    expect(confirmed.transfers[0].action).toBeNull();
    expect(confirmed.transfers[0].status).toBe('inbound_confirmed');
    expect(sent[1].data.status).toBe('confirmed');
    expect(mixin.transfers.processTransferQueue).not.toHaveBeenCalled();
  });

  test('rejects invalid transitions and real provider evidence', async () => {
    const { mixin } = harness([
      transfer({ id: 1, status: 'inbound_confirmed' }),
      transfer({
        id: 2,
        status: 'inbound_broadcast',
        inbound_tx_id: 'real-snapshot',
        inbound_tx_hash: 'real-hash',
        inbound_confirmations: 0,
        inbound_confirmations_required: 2
      }),
      transfer({ id: 3, purpose: 'other' })
    ]);
    const config = mixin.respondTo('admin-config');

    await expect(config.updateConfig({ id: 1, action: 'detect-inbound' })).rejects.toThrow(
      /cannot be marked detected/
    );
    await expect(config.updateConfig({ id: 2, action: 'confirm-inbound' })).rejects.toThrow(
      /cannot be marked confirmed/
    );
    await expect(config.updateConfig({ id: 3, action: 'detect-inbound' })).rejects.toThrow(
      /No outstanding BuySaito transfer/
    );
    await expect(config.updateConfig({ id: 1, action: 'complete' })).rejects.toThrow(
      /Unknown payment test action/
    );
    await expect(config.updateConfig({ id: 99, action: 'detect-inbound' })).rejects.toThrow(
      /No outstanding BuySaito transfer/
    );
  });

  test('confirmed simulated payment is issued by the production queue when funded', async () => {
    const { app, sent, database, mixin } = harness();
    const config = mixin.respondTo('admin-config');
    await config.updateConfig({ id: 7, action: 'detect-inbound' });
    await config.updateConfig({ id: 7, action: 'confirm-inbound' });
    expect(database.rows[0].outbound_tx_sig).toBe('');

    const queue = new Transfers(app, { app, database, api: {}, accounts: {} });
    await queue.processTransferQueue();

    expect(app.wallet.createUnsignedTransactionWithDefaultFee).toHaveBeenCalledWith(
      'recipient',
      1000000000n
    );
    expect(app.wallet.addTransactionToPending).toHaveBeenCalled();
    expect(app.network.propagateTransaction).toHaveBeenCalled();
    expect(database.rows[0]).toEqual(
      expect.objectContaining({
        status: 'outbound_broadcast',
        outbound_tx_sig: 'payout-sig',
        outbound_address: 'recipient'
      })
    );

    await queue.onNewBlock(
      { id: 4, hash: 'block-hash', transactions: [{ signature: 'payout-sig' }] },
      true
    );

    expect(database.rows[0].status).toBe('outbound_confirmed');
    expect(sent.map((message) => message.request)).toEqual([
      'buysaito payment detected',
      'buysaito payment detected',
      'buysaito saito issued'
    ]);
    expect(sent[2].data.paid).toBeUndefined();
  });
});

describe('BuySaito overlay payment notices', () => {
  beforeEach(() => {
    global.document = {
      getElementById() {
        return null;
      },
      querySelector() {
        return null;
      },
      querySelectorAll() {
        return [];
      }
    };
  });

  afterEach(() => {
    delete global.document;
  });

  function overlay() {
    const app = {
      connection: new EventEmitter(),
      modules: { getRespondTos: () => [] },
      browser: {
        formatDecimals: (value) => value,
        escapeHTML: (value) => value,
        generateQRCode() {}
      }
    };
    const mod = { available_currencies: [{ ticker: 'ETH' }], app };
    const purchase = new SaitoPurchaseOverlay(app, mod);
    purchase.active = true;
    purchase.address = '0xabc';
    purchase.crypto_selected = { ticker: 'ETH' };
    purchase.reservation = { id: 7, address: '0xabc', ticker: 'ETH' };
    return purchase;
  }

  test('pending and confirmed notices advance the purchase message', () => {
    const purchase = overlay();

    purchase.app.connection.emit('saito-purchase-payment-detected', {
      id: 7,
      address: '0xabc',
      ticker: 'ETH',
      status: 'pending',
      initiator_pubkey: 'buyer'
    });
    expect(purchase.ui_msg).toBe('Payment detected. Waiting for SAITO issuance...');
    expect(purchase.overlay.html).toContain('Payment detected. Waiting for SAITO issuance...');

    purchase.app.connection.emit('saito-purchase-payment-detected', {
      id: 7,
      address: '0xabc',
      ticker: 'ETH',
      status: 'confirmed',
      initiator_pubkey: 'buyer'
    });
    expect(purchase.ui_msg).toBe('Payment received. Waiting for SAITO issuance...');
    expect(purchase.overlay.html).toContain('Payment received. Waiting for SAITO issuance...');
  });

  test('an issuance notice without paid does not open the completion screen', () => {
    const purchase = overlay();
    purchase.overlay.visible = true;
    const renderCompletion = jest.spyOn(purchase, 'renderSaitoCompletion');

    purchase.app.connection.emit('saito-purchase-saito-issued', {
      id: 7,
      address: '0xabc',
      ticker: 'ETH',
      issue_amount: '10',
      status: 'confirmed'
    });

    expect(purchase.saito_issuance).toBeNull();
    expect(renderCompletion).not.toHaveBeenCalled();
  });
});
