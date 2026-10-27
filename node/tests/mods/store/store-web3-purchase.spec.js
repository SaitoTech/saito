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
});
