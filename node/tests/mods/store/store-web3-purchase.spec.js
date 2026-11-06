const transactions = require('../../../mods/store/lib/transactions');

function purchaseContext() {
  return {
    app: {
      crypto: {
        isPublicKey: (key) => key === 'buyer-key'
      }
    }
  };
}

describe('Store web3 purchase refund recipient', () => {
  test('the order stores the refund recipient rather than the issuing key', () => {
    const order = transactions.orderFromPurchaseTx.call(
      purchaseContext(),
      {
        signature: 'purchase-sig',
        from: [{ publicKey: 'mixin-issuer' }],
        to: [{}]
      },
      {
        module: 'Store',
        request: 'purchase-asset',
        buyer: 'buyer-key',
        refund: 'buyer-key',
        web3_ticker: 'ETH',
        web3_amount: '1.25',
        access_hash: 'hash'
      },
      { payment_output_index: 0, payment_tx_sig: 'purchase-sig', payment_amount: 10 }
    );

    expect(order.buyer).toBe('buyer-key');
    expect(order.inbound_payment_uuid).toBe('');
    expect(order.transfer_uuid).toBe('');
  });

  test('the order retains the external payment hash and the transfer row id', () => {
    const order = transactions.orderFromPurchaseTx.call(
      purchaseContext(),
      {
        signature: 'purchase-sig',
        from: [{ publicKey: 'mixin-issuer' }],
        to: [{}]
      },
      {
        module: 'Store',
        request: 'purchase-asset',
        buyer: 'buyer-key',
        refund: 'buyer-key',
        web3_ticker: 'TRX',
        web3_amount: '1',
        inbound_payment_uuid: 'hash-aaa',
        transfer_uuid: '11',
        inbound_tx_id: 'snapshot-1'
      },
      { payment_output_index: 0, payment_tx_sig: 'purchase-sig', payment_amount: 10 }
    );

    expect(order.inbound_payment_uuid).toBe('hash-aaa');
    expect(order.transfer_uuid).toBe('11');
    expect(order.toInsertParams().$inbound_payment_uuid).toBe('hash-aaa');
    expect(order.toInsertParams().$transfer_uuid).toBe('11');
  });

  test('a missing or unrelated identifier is not replaced', () => {
    const order = transactions.orderFromPurchaseTx.call(
      purchaseContext(),
      {
        signature: 'purchase-sig',
        from: [{ publicKey: 'mixin-issuer' }],
        to: [{}]
      },
      {
        module: 'Store',
        request: 'purchase-asset',
        buyer: 'buyer-key',
        refund: 'buyer-key',
        web3_ticker: 'TRX',
        inbound_payment_uuid: 'hash-aaa',
        transfer_uuid: 'snapshot-1'
      },
      { payment_output_index: 0, payment_tx_sig: 'purchase-sig', payment_amount: 10 }
    );

    expect(order.inbound_payment_uuid).toBe('hash-aaa');
    expect(order.transfer_uuid).toBe('');
    expect(order.payment_tx_sig).toBe('purchase-sig');
  });

  test('a refund field is preferred when it differs from the buyer field', () => {
    const context = purchaseContext();
    context.app.crypto.isPublicKey = (key) => key === 'refund-key' || key === 'buyer-key';
    const order = transactions.orderFromPurchaseTx.call(
      context,
      { signature: 'purchase-sig', from: [{ publicKey: 'mixin-issuer' }], to: [{}] },
      {
        web3_ticker: 'ETH',
        buyer: 'buyer-key',
        refund: 'refund-key'
      },
      { payment_output_index: 0, payment_tx_sig: 'purchase-sig', payment_amount: 10 }
    );

    expect(order.buyer).toBe('refund-key');
  });

  test('a web3 purchase without a recipient is rejected before the issuing key can be refunded', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    await transactions.receivePurchaseAssetTransaction.call(
      {
        app: {
          BROWSER: 0,
          crypto: { isPublicKey: () => false },
          wallet: { convertSaitoToNolan: () => 0n }
        }
      },
      { id: 1, hash: 'block' },
      {
        signature: 'purchase-sig',
        from: [{ publicKey: 'mixin-issuer' }],
        returnMessage: () => ({
          module: 'Store',
          request: 'purchase-asset',
          web3_ticker: 'ETH',
          web3_amount: '1',
          nft_id: 'nft-1',
          buyer: 'not-a-key'
        })
      }
    );

    expect(warn).toHaveBeenCalledWith('Store: web3 purchase has no refund recipient');
    warn.mockRestore();
  });

  test('a web3 purchase is accepted from the server public key or a configured treasury', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const txmsg = {
      module: 'Store',
      request: 'purchase-asset',
      web3_ticker: 'TRX',
      web3_amount: '1',
      nft_id: 'nft-1',
      buyer: 'buyer-key',
      refund: 'buyer-key',
      price: '0',
      fee: '0'
    };
    const receive = (sender) =>
      transactions.receivePurchaseAssetTransaction.call(
        {
          app: {
            BROWSER: 0,
            crypto: { isPublicKey: (key) => key === 'buyer-key' },
            wallet: { convertSaitoToNolan: () => 0n }
          },
          publicKey: 'server-key',
          web3_payment_processor_publickey: ['treasury-key'],
          warehouse: { returnSummaryByBucket: async () => null, returnAvailableQuantity: async () => 0 }
        },
        { id: 1, hash: 'block' },
        {
          signature: 'purchase-sig',
          from: [{ publicKey: sender }],
          to: [],
          returnMessage: () => txmsg
        }
      );

    await receive('stranger');
    expect(warn).toHaveBeenCalledWith(
      'Store: web3 purchase is not from the authorized processor',
      expect.objectContaining({ sender: 'stranger', authorized: ['treasury-key', 'server-key'] })
    );

    warn.mockClear();
    await receive('server-key');
    expect(warn.mock.calls.some((call) => String(call[0]).includes('authorized processor'))).toBe(
      false
    );

    warn.mockClear();
    await receive('treasury-key');
    expect(warn.mock.calls.some((call) => String(call[0]).includes('authorized processor'))).toBe(
      false
    );
    warn.mockRestore();
  });
});
