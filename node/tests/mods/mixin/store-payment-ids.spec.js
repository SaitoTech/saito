jest.mock('../../../lib/saito/transaction', () => ({
  default: class Transaction {
    deserialize_from_web(_app, raw) {
      this.msg = JSON.parse(raw);
    }
    returnMessage() {
      return this.msg;
    }
  }
}));

const { createBuySaitoPayoutTransaction } = require('../../../mods/mixin/lib/transactions');
const Transfers = require('../../../mods/mixin/lib/transfers');

function purchase(extra = {}) {
  return JSON.stringify({
    module: 'Store',
    request: 'purchase-asset',
    buyer: 'buyer-key',
    refund: 'buyer-key',
    web3_ticker: 'TRX',
    web3_amount: '1',
    ...extra
  });
}

function app() {
  return {
    crypto: { isPublicKey: (key) => key === 'buyer-key' },
    wallet: {
      getBalance: async () => 10000000000n,
      convertSaitoToNolan: (amount) => BigInt(Math.floor(Number(amount))) * 100000000n,
      createUnsignedTransactionWithDefaultFee: jest.fn(async () => ({
        msg: null,
        signature: '',
        async sign() {
          this.signature = 'payout-sig';
        },
        serialize_to_web() {
          return JSON.stringify(this.msg);
        }
      }))
    }
  };
}

function row(overrides = {}) {
  return {
    id: 11,
    purpose: 'store-purchase',
    payload: purchase(),
    inbound_tx_hash: 'hash-aaa',
    inbound_tx_id: 'snapshot-1',
    outbound_amount: '1',
    outbound_tx_sig: '',
    outbound_tx: '',
    recipient_publickey: 'buyer-key',
    last_error: '',
    ...overrides
  };
}

function databaseFor(rows) {
  return {
    async getTransfers({ id }) {
      return rows.filter((item) => String(item.id) === String(id)).map((item) => ({ ...item }));
    },
    async updateTransfer(id, fields) {
      const found = rows.find((item) => String(item.id) === String(id));
      if (found) {
        Object.assign(found, fields);
      }
    }
  };
}

describe('Store payment identifiers', () => {
  test('the issued payment carries the inbound hash and the transfer row id', async () => {
    const application = app();
    const { tx } = await createBuySaitoPayoutTransaction(application, row(), 100000000n);

    expect(tx.msg.inbound_payment_uuid).toBe('hash-aaa');
    expect(tx.msg.transfer_uuid).toBe('11');
    expect(tx.msg.inbound_payment_uuid).not.toBe(tx.msg.transfer_uuid);
    expect(JSON.stringify(tx.msg)).not.toContain('snapshot-1');
  });

  test('issuing the same payment again uses the same identifiers', async () => {
    const application = app();
    const current = row();
    const first = await createBuySaitoPayoutTransaction(application, current, 100000000n);
    const second = await createBuySaitoPayoutTransaction(application, current, 100000000n);

    expect(second.tx.msg.inbound_payment_uuid).toBe(first.tx.msg.inbound_payment_uuid);
    expect(second.tx.msg.transfer_uuid).toBe(first.tx.msg.transfer_uuid);
  });

  test('two payments and two transfer rows keep distinct identifiers', async () => {
    const application = app();
    const first = await createBuySaitoPayoutTransaction(
      application,
      row({ id: 11, inbound_tx_hash: 'hash-aaa' }),
      100000000n
    );
    const second = await createBuySaitoPayoutTransaction(
      application,
      row({ id: 12, inbound_tx_hash: 'hash-bbb', payload: purchase({ web3_amount: '2' }) }),
      100000000n
    );

    expect(first.tx.msg.inbound_payment_uuid).toBe('hash-aaa');
    expect(second.tx.msg.inbound_payment_uuid).toBe('hash-bbb');
    expect(first.tx.msg.transfer_uuid).toBe('11');
    expect(second.tx.msg.transfer_uuid).toBe('12');
    expect(first.tx.msg.inbound_payment_uuid).not.toBe(second.tx.msg.inbound_payment_uuid);
    expect(first.tx.msg.transfer_uuid).not.toBe(second.tx.msg.transfer_uuid);
  });

  test('a saved issuance is not rebuilt with new identifiers', async () => {
    const application = app();
    const rows = [row()];
    const transfers = new Transfers(application, { database: databaseFor(rows) });
    const issued = await transfers.issueOutboundTransfer(rows[0]);
    const saved = JSON.parse(issued.outbound_tx);
    application.wallet.createUnsignedTransactionWithDefaultFee.mockClear();

    const retried = await transfers.issueOutboundTransfer(issued);

    expect(application.wallet.createUnsignedTransactionWithDefaultFee).not.toHaveBeenCalled();
    expect(JSON.parse(retried.outbound_tx)).toEqual(saved);
    expect(saved.inbound_payment_uuid).toBe('hash-aaa');
    expect(saved.transfer_uuid).toBe('11');
  });

  test('issuance stops when the inbound payment hash is missing', async () => {
    const application = app();
    const rows = [row({ inbound_tx_hash: '' })];
    const transfers = new Transfers(application, { database: databaseFor(rows) });
    const issued = await transfers.issueOutboundTransfer(rows[0]);

    expect(issued.outbound_tx_sig).toBe('');
    expect(issued.last_error).toBe(
      'Store purchase is missing its inbound payment id or transfer id'
    );
    expect(application.wallet.createUnsignedTransactionWithDefaultFee).not.toHaveBeenCalled();
  });
});
