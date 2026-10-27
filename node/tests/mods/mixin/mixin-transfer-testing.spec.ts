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
    msg = null;
    deserialize_from_web(app, raw) {
      this.signature = 'payout-sig';
      try {
        const parsed = JSON.parse(raw);
        if (parsed?.module === 'Store' && parsed?.request === 'purchase-asset') {
          this.msg = parsed;
        }
      } catch (err) {
        this.msg = null;
      }
    }
    returnMessage() {
      return this.msg;
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
      return select(
        (row) => row.mode === 'automatic' && !Number(row.excluded) && row.status === 'inbound_awaiting'
      );
    },
    async getTransfersPendingInboundConfirmed() {
      return select(
        (row) =>
          row.mode === 'automatic' &&
          !Number(row.excluded) &&
          row.status === 'inbound_broadcast' &&
          row.inbound_tx_hash &&
          Number(row.inbound_confirmations) >= Number(row.inbound_confirmations_required)
      );
    },
    async getTransfersPendingOutboundAwaiting(currentBlockId) {
      return select(
        (row) =>
          row.mode === 'automatic' &&
          !Number(row.excluded) &&
          row.status === 'inbound_confirmed' &&
          !row.outbound_tx_sig &&
          row.inbound_confirmation_block_id != null &&
          Number(row.inbound_confirmation_block_id) <= Number(currentBlockId)
      );
    },
    async listAdminTransfers({ search = '', page = 1, purpose = '' } = {}) {
      const pageSize = 20;
      const term = String(search || '').trim();
      const selected = ['migration', 'buysaito'].includes(purpose) ? purpose : '';
      const open = new Set([
        'inbound_awaiting',
        'inbound_broadcast',
        'inbound_confirmed',
        'outbound_awaiting',
        'outbound_broadcast'
      ]);
      let matched = rows.filter((row) => !Number(row.excluded));
      if (selected) {
        matched = matched.filter((row) => row.purpose === selected);
      }
      if (!term) {
        matched = matched.filter((row) => open.has(row.status));
      } else {
        const address = /^0x[a-fA-F0-9]{40}$/i.test(term);
        matched = matched.filter((row) => {
          const identifiers = [
            row.requester_publickey,
            row.recipient_publickey,
            row.publickey,
            row.inbound_address,
            row.inbound_sender,
            row.outbound_address,
            row.outbound_sender
          ];
          if (identifiers.some((value) => value === term)) {
            return true;
          }
          if (!address) {
            return false;
          }
          const lower = term.toLowerCase();
          return [row.inbound_address, row.inbound_sender, row.outbound_address, row.outbound_sender].some(
            (value) => String(value || '').toLowerCase() === lower
          );
        });
      }
      matched.sort(
        (left, right) =>
          Number(right.created_at) - Number(left.created_at) || Number(right.id) - Number(left.id)
      );
      const total = matched.length;
      const pageCount = Math.max(1, Math.ceil(total / pageSize));
      const requested = Number(page);
      const current = Number.isInteger(requested) && requested > 0 ? Math.min(requested, pageCount) : 1;
      return {
        rows: matched.slice((current - 1) * pageSize, current * pageSize).map((row) => ({ ...row })),
        total,
        page: current,
        page_size: pageSize
      };
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
    mode: 'automatic',
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
    inbound_confirmation_block_id: 4,
    excluded: 0,
    last_error: '',
    created_at: Date.now(),
    ...overrides
  };
}

function harness(rows = [transfer()]) {
  const sent = [];
  const app = {
    BROWSER: 0,
    options: {
      mixin: {
        api_key: {
          app_id: 'app-1',
          session_id: 'session-1',
          server_public_key: 'server-pub',
          session_private_key: 'app-session-key'
        }
      }
    },
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
      transfer({ created_at: 10 }),
      transfer({ id: 8, status: 'failed', purpose: 'buysaito', created_at: 30 }),
      transfer({ id: 9, purpose: 'other', status: 'inbound_awaiting', created_at: 20 }),
      transfer({ id: 4, status: 'outbound_confirmed', created_at: 40 })
    ]);

    const config = mixin.respondTo('admin-config');
    expect(config.id).toBe('mixin');
    expect(config.name).toBe('Mixin');

    const listed = await config.getConfig();
    expect(listed.transfers.map((row) => row.id)).toEqual([9, 7]);
    expect(listed.total).toBe(2);
    expect(listed.page_size).toBe(20);
    expect(listed.transfers.find((row) => row.id === 7)).toEqual(
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

    const buysaito = await config.getConfig({ purpose: 'buysaito' });
    expect(buysaito.transfers.map((row) => row.id)).toEqual([7]);
    const migration = await config.getConfig({ purpose: 'migration' });
    expect(migration.transfers).toEqual([]);
    const unknown = await config.getConfig({ purpose: 'other' });
    expect(unknown.transfers.map((row) => row.id)).toEqual([9, 7]);
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
    expect(sent[2].data.paid).toBe('payout-sig');
  });

  test('a store purchase is confirmed from one admin detection and keeps the purchase message', async () => {
    const purchase = {
      module: 'Store',
      request: 'purchase-asset',
      buyer: 'buyer-key',
      refund: 'buyer-key',
      nft_id: 'nft-1',
      quantity: 1,
      price: '0',
      fee: '0',
      web3_ticker: 'ETH',
      web3_amount: '1.25'
    };
    const { app, mixin, database, sent } = harness([
      transfer({
        id: 11,
        purpose: 'store-purchase',
        inbound_amount: '1.25',
        inbound_address: '0xstore',
        inbound_mixin_user_id: 'user-1',
        requester_publickey: 'buyer-key',
        payload: JSON.stringify(purchase),
        inbound_confirmation_block_id: 99,
        created_at: Date.now()
      })
    ]);
    app.crypto = { isPublicKey: (key) => key === 'buyer-key' };
    mixin.creditDepositAddress = jest.fn();
    mixin.accounts = { getCredentials: () => ({ user_id: 'user-1' }) };
    mixin.api = {
      fetchDeposits: jest.fn(async () => [
        {
          amount: '1.25',
          transaction_hash: 'mix-hash',
          deposit_id: 'dep-1',
          sender: '0xsender',
          destination: '0xstore',
          confirmations: 0
        }
      ]),
      fetchHistory: jest.fn(async () => [])
    };
    mixin.database.getCredentials = async () => [];
    const transfers = new Transfers(app, mixin);
    mixin.transfers = transfers;

    const config = mixin.respondTo('admin-config');
    const open = await config.getConfig();
    expect(open.transfers.find((row) => row.id === 11).action).toEqual({
      action: 'detect-inbound',
      label: 'Mark inbound payment detected'
    });

    await transfers.processTransferQueue();
    expect(database.rows[0]).toEqual(
      expect.objectContaining({
        status: 'inbound_confirmed',
        inbound_tx_hash: 'mix-hash',
        inbound_tx_id: 'dep-1',
        inbound_sender: '0xsender',
        inbound_confirmations_required: 0
      })
    );
    expect(mixin.creditDepositAddress).toHaveBeenCalledTimes(1);

    database.rows[0].status = 'inbound_awaiting';
    database.rows[0].inbound_tx_hash = '';
    database.rows[0].outbound_tx_sig = '';
    mixin.creditDepositAddress.mockClear();
    const detected = await config.updateConfig({ id: 11, action: 'detect-inbound' });
    const row = detected.transfers.find((item) => item.id === 11);
    expect(row.status).toBe('inbound_confirmed');
    expect(row.inbound_tx_hash).toBe('admin-test');
    expect(row.action).toBeNull();
    await expect(config.updateConfig({ id: 11, action: 'confirm-inbound' })).rejects.toThrow(
      /Unknown payment test action/
    );
    await transfers.recordStorePurchaseInboundPayment(database.rows[0], {
      hash: 'admin-test',
      id: 'admin-test:11',
      sender: 'admin-test',
      amount: '1.25'
    });
    expect(mixin.creditDepositAddress).toHaveBeenCalledTimes(1);

    const issued = await transfers.issueOutboundTransfer(database.rows[0]);
    expect(issued.outbound_tx_sig).toBe('payout-sig');
    expect(issued.status).toBe('outbound_awaiting');
    const signed = app.wallet.createUnsignedTransactionWithDefaultFee.mock.results.at(-1).value;
    await expect(signed).resolves.toEqual(
      expect.objectContaining({
        msg: expect.objectContaining({
          module: 'Store',
          request: 'purchase-asset',
          buyer: 'buyer-key',
          refund: 'buyer-key',
          nft_id: 'nft-1',
          web3_ticker: 'ETH',
          web3_amount: '1.25'
        })
      })
    );
    expect(sent.some((message) => message.request === 'buysaito report error')).toBe(false);
  });

  test('a Store purchase payload is reserved without extra inbound confirmations', async () => {
    const saved = [];
    const transfers = new Transfers(
      {
        wallet: { getPrivateKey: async () => 'private' },
        blockchain: { getLatestBlockId: async () => 8 },
        crypto: { isPublicKey: (key) => key === 'buyer-key' }
      },
      {
        publicKey: 'server-key',
        crypto_mods: [
          {
            ticker: 'ETH',
            asset_id: 'eth-asset',
            chain_id: 'eth-chain',
            price_usd: 2,
            last_update: Date.now(),
            confirmations: 12,
            returnMixinNetworkInfo: async () => false
          },
          {
            ticker: 'ERC-SAITO',
            asset_id: 'erc-asset',
            chain_id: 'erc-chain',
            price_usd: 1,
            last_update: Date.now(),
            confirmations: 12,
            returnMixinNetworkInfo: async () => false
          }
        ],
        accounts: {
          getCredentials: () => ({ user_id: 'user-1' }),
          decryptCredentials: () => ({ user_id: 'user-1' })
        },
        database: {
          getTransfers: async () => [],
          getCredentials: async () => [],
          findAddress: async () => ({ address: '0xabc', user_id: 'user-1' }),
          insertTransfer: async (row) => {
            saved.push(row);
            return 7;
          }
        }
      }
    );

    await transfers.reserveAddress('buyer-key', {
      ticker: 'ETH',
      issue_amount: 10,
      expected_deposit: 5.54,
      tx: JSON.stringify({
        module: 'Store',
        request: 'purchase-asset',
        buyer: 'issuer-key',
        refund: 'buyer-key'
      })
    });

    expect(saved[0].purpose).toBe('store-purchase');
    expect(saved[0].inbound_confirmations_required).toBe(0);
    expect(saved[0].inbound_confirmation_block_id).toBe(8);
    await expect(
      transfers.reserveAddress('buyer-key', {
        ticker: 'ETH',
        issue_amount: 10,
        expected_deposit: 5.54,
        tx: JSON.stringify({ module: 'Store', request: 'purchase-asset' })
      })
    ).rejects.toThrow('Store purchase refund recipient is missing');
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
