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

const Transfers = require('../../../mods/mixin/lib/transfers');
const BuySaitoService = require('../../../mods/mixin/lib/buysaito');

function service(prices = { eth: 2, erc: 1 }) {
  const saved = [];
  const crypto = {
    ticker: 'ETH',
    asset_id: 'eth-asset',
    chain_id: 'eth-chain',
    price_usd: prices.eth,
    last_update: Date.now(),
    confirmations: 12,
    returnMixinNetworkInfo: jest.fn(async () => false)
  };
  const erc = {
    ticker: 'ERC-SAITO',
    asset_id: 'erc-asset',
    chain_id: 'erc-chain',
    price_usd: prices.erc,
    last_update: Date.now(),
    confirmations: 12,
    returnMixinNetworkInfo: jest.fn(async () => false)
  };
  const mod = {
    publicKey: 'server-key',
    crypto_mods: [crypto, erc],
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
  };
  const transfers = new Transfers(
    {
      wallet: { getPrivateKey: async () => 'private' },
      blockchain: { getLatestBlockId: async () => 8 }
    },
    mod
  );
  mod.transfers = transfers;
  const buysaito = new BuySaitoService(
    {
      wallet: { getPrivateKey: async () => 'private' },
      blockchain: { getLatestBlockId: async () => 8 }
    },
    mod
  );
  mod.buysaito = buysaito;
  return { transfers, buysaito, crypto, erc, saved, mod };
}

describe('BuySaito server quotes', () => {
  test('accepts an order inside the 1% tolerance and stores the server amounts', async () => {
    const { buysaito, transfers, saved } = service();
    expect(buysaito.quote_tolerance).toBe(0.01);

    const instructions = await buysaito.startPurchase('buyer', {
      ticker: 'ETH',
      issue_amount: 10,
      expected_deposit: 5.54
    });

    expect(instructions.issue_amount).toBe('10');
    expect(instructions.expected_deposit).toBe('5.5');
    expect(saved[0].outbound_amount).toBe('10');
    expect(saved[0].inbound_amount).toBe('5.5');
    expect(saved[0].mode).toBe('automatic');
    expect(saved[0].purpose).toBe('buysaito');
    expect(saved[0].inbound_confirmations_required).toBe(12);
    expect(saved[0].inbound_confirmation_block_id).toBe(8);
    expect(instructions.ticker).toBe('ETH');
    expect(instructions.address).toBe('0xabc');
    expect(transfers.reservation_ms).toBe(40 * 60 * 1000);
    expect(instructions.reserved_until).toBe(saved[0].created_at + transfers.reservation_ms);
  });

  test('accepts the inverse rounding of a crypto-denominated order', async () => {
    const { buysaito } = service();
    const instructions = await buysaito.startPurchase('buyer', {
      ticker: 'ETH',
      expected_deposit: 5.49,
      issue_amount: 9
    });

    expect(instructions.issue_amount).toBe('9');
    expect(instructions.expected_deposit).toBe('5.49');
  });

  test('rejects an order outside the 1% tolerance', async () => {
    const { buysaito, saved } = service();
    await expect(
      buysaito.startPurchase('buyer', {
        ticker: 'ETH',
        issue_amount: 10,
        expected_deposit: 1
      })
    ).rejects.toThrow('does not match the current exchange rate');
    expect(saved).toHaveLength(0);
  });

  test('a client-supplied price cannot change the calculation', async () => {
    const { buysaito, saved } = service();
    await expect(
      buysaito.startPurchase('buyer', {
        ticker: 'ETH',
        issue_amount: 10,
        expected_deposit: 5.5,
        price_usd: 0.0001
      })
    ).rejects.toThrow('exchange rate is set by the server');
    expect(saved).toHaveLength(0);
  });

  test('rejects an unsupported currency and an invalid amount', async () => {
    const { buysaito } = service();
    await expect(buysaito.startPurchase('buyer', { ticker: 'DOGE', issue_amount: 10 })).rejects.toThrow(
      'Unsupported payment ticker'
    );
    await expect(buysaito.startPurchase('buyer', { ticker: 'ETH', issue_amount: 0 })).rejects.toThrow(
      'invalid payment amount'
    );
    await expect(buysaito.startPurchase('buyer', { ticker: 'ETH', expected_deposit: -1 })).rejects.toThrow(
      'invalid payment amount'
    );
  });

  test('does not insert a reservation when the Saito block id is missing or invalid', async () => {
    const missing = service();
    delete missing.transfers.app.blockchain;
    await expect(
      missing.buysaito.startPurchase('buyer', { ticker: 'ETH', issue_amount: 10, expected_deposit: 5.5 })
    ).rejects.toThrow('Saito block height is unavailable');
    expect(missing.saved).toHaveLength(0);

    const invalid = service();
    invalid.transfers.app.blockchain.getLatestBlockId = async () => null;
    await expect(
      invalid.buysaito.startPurchase('buyer', { ticker: 'ETH', issue_amount: 10, expected_deposit: 5.5 })
    ).rejects.toThrow('Saito block height is unavailable');
    expect(invalid.saved).toHaveLength(0);
  });

  test('rejects a missing or stale cached price', async () => {
    const missing = service({ eth: 0, erc: 1 });
    await expect(missing.buysaito.startPurchase('buyer', { ticker: 'ETH', issue_amount: 10 })).rejects.toThrow(
      'No price is available'
    );

    const stale = service();
    stale.crypto.last_update = Date.now() - 400000;
    stale.crypto.price_usd = 2;
    stale.crypto.returnMixinNetworkInfo.mockImplementation(async () => {
      stale.crypto.price_usd = null;
    });
    await expect(stale.buysaito.startPurchase('buyer', { ticker: 'ETH', issue_amount: 10 })).rejects.toThrow(
      'No price is available'
    );
    expect(stale.crypto.returnMixinNetworkInfo).toHaveBeenCalled();
  });
});
