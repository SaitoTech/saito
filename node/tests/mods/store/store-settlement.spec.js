const Warehouse = require('../../../mods/store/lib/warehouse');

function createWarehouse() {
  const propagateTransaction = jest.fn(async () => undefined);
  const app = {
    network: { propagateTransaction },
    storage: {
      loadTransactions: (_query, callback) => callback([{ signature: 'listing-tx' }])
    }
  };
  const mod = {
    image_cache: { 'nft-1': 'cached' },
    createFulfillmentTransaction: jest.fn(async () => ({
      signature: 'settle-sig',
      serialize_to_web: () => '{"t":"signed"}'
    }))
  };
  const warehouse = new Warehouse(app, mod);
  warehouse.db = {
    returnOrphanedSettlingOrders: jest.fn(async () => []),
    returnListingsWithSettlementPending: jest.fn(async () => []),
    returnOrphanedFulfilledOrders: jest.fn(async () => []),
    returnPendingOrders: jest.fn(async () => []),
    returnSettlingOrders: jest.fn(async () => []),
    markListingSettlementPending: jest.fn(async () => {}),
    updateOrder: jest.fn(async () => {}),
    clearListingSettlementPending: jest.fn(async () => {})
  };
  warehouse.syncSummaryForBucket = jest.fn(async () => {});
  return { warehouse, app, mod };
}

describe('Store settlement lifecycle', () => {
  test('construction persists the signed transaction and submits it for propagation', async () => {
    const { warehouse, app } = createWarehouse();

    const built = await warehouse.fulfillOrder(
      { id: 7, order_tx_sig: 'purchase-sig', nft_id: 'nft-1', quantity: 1, price: 0 },
      [{ signature: 'listing-sig', block_hash_listed: 'block-hash' }]
    );

    expect(built).toBe(true);
    expect(warehouse.db.updateOrder).toHaveBeenCalledWith(7, {
      settlement_tx_sig: 'settle-sig',
      settlement_tx: '{"t":"signed"}',
      status: 'settling'
    });
    expect(app.network.propagateTransaction).toHaveBeenCalledTimes(1);
    expect(app.network.propagateTransaction.mock.calls[0][0].signature).toBe('settle-sig');
  });

  test('a propagation failure leaves the saved settlement in place', async () => {
    const { warehouse, app } = createWarehouse();
    app.network.propagateTransaction.mockRejectedValue(new Error('network down'));

    const built = await warehouse.fulfillOrder(
      { id: 7, order_tx_sig: 'purchase-sig', nft_id: 'nft-1', quantity: 1, price: 0 },
      [{ signature: 'listing-sig', block_hash_listed: 'block-hash' }]
    );

    expect(built).toBe(true);
    expect(warehouse.db.updateOrder).toHaveBeenCalledWith(
      7,
      expect.objectContaining({ settlement_tx_sig: 'settle-sig', status: 'settling' })
    );
  });

  test('an unconfirmed settlement is rebroadcast from the stored transaction', async () => {
    const { warehouse, app, mod } = createWarehouse();
    warehouse.restoreSettlementTransaction = () => ({ signature: 'settle-sig' });
    warehouse.db.returnPendingOrders.mockResolvedValue([
      {
        id: 1,
        status: 'settling',
        order_tx_sig: 'purchase-sig',
        settlement_tx_sig: 'settle-sig',
        settlement_tx: '{"t":"signed"}',
        block_id_fulfilled: 0,
        longest_chain_fulfilled: 0,
        longest_chain_received: 1
      }
    ]);

    await warehouse.processQueue();

    expect(mod.createFulfillmentTransaction).not.toHaveBeenCalled();
    expect(warehouse.db.updateOrder).not.toHaveBeenCalled();
    expect(app.network.propagateTransaction).toHaveBeenCalledWith({ signature: 'settle-sig' });
  });

  test('an unconfirmed settlement without stored bytes is not replaced or refunded', async () => {
    const { warehouse, app, mod } = createWarehouse();
    warehouse.db.returnPendingOrders.mockResolvedValue([
      {
        id: 1,
        status: 'settling',
        order_tx_sig: 'purchase-sig',
        settlement_tx_sig: '47dc5782',
        settlement_tx: '',
        block_id_fulfilled: 0,
        longest_chain_fulfilled: 0,
        longest_chain_received: 1
      }
    ]);

    await warehouse.processQueue();

    expect(mod.createFulfillmentTransaction).not.toHaveBeenCalled();
    expect(app.network.propagateTransaction).not.toHaveBeenCalled();
    expect(warehouse.db.updateOrder).not.toHaveBeenCalled();
  });

  test('a settlement that was confirmed and then orphaned can be built again', async () => {
    const { warehouse } = createWarehouse();
    warehouse.db.returnOrphanedSettlingOrders.mockResolvedValue([
      {
        id: 4,
        nft_id: 'nft-1',
        price: 0,
        status: 'settling',
        settlement_tx_sig: 'old-sig',
        settlement_tx: '{"t":"old"}',
        block_id_fulfilled: 12,
        longest_chain_fulfilled: 0
      }
    ]);
    warehouse.returnSettlementListingSignatures = jest.fn(async () => []);

    await warehouse.resetOrphanedSettlements();

    expect(warehouse.db.updateOrder).toHaveBeenCalledWith(4, {
      settlement_tx_sig: '',
      settlement_tx: '',
      status: 'pending',
      block_id_fulfilled: 0,
      block_hash_fulfilled: '',
      transaction_id_fulfilled: 0,
      longest_chain_fulfilled: 0
    });
  });
});
