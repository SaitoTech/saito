// @ts-nocheck

jest.mock('saito-js/lib/peer_service', () => ({
  default: class PeerService {
    constructor(data, service) {
      this.service = service;
    }
  }
}));
jest.mock('../../../lib/saito/transaction', () => ({ default: class Transaction {} }));
jest.mock('../../../lib/saito/saito', () => ({}));
jest.mock(
  '../../../lib/templates/modtemplate',
  () =>
    class ModTemplate {
      async initialize(app) {
        this.app = app;
      }
    }
);
jest.mock('../../../lib/saito/ui/saito-header/saito-header', () => class SaitoHeader {});
jest.mock('../../../mods/buysaito/index', () => jest.fn());
jest.mock('../../../mods/buysaito/lib/saito-purchase', () => class SaitoPurchaseOverlay {});

const BuySaito = require('../../../mods/buysaito/buysaito');

describe('BuySaito treasury service', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('initializes and advertises with a saved Mixin account but no local API bot', async () => {
    let initializeMixin;
    jest.spyOn(global, 'setTimeout').mockImplementation((callback) => {
      initializeMixin = callback;
      return 1;
    });

    const mixin = {
      account_created: 1,
      createAccount: jest.fn(async () => ({ existing: true }))
    };
    const mod = Object.create(BuySaito.prototype);
    mod.publicKey = 'treasury-public-key';
    mod.authorized_public_key = 'treasury-public-key';
    mod.service_ready = false;
    mod.ensurePurchasesSchema = jest.fn(async () => {});
    mod.loadAltAccounts = jest.fn(async () => {});
    mod.loadPendingPayments = jest.fn(async () => {});
    mod.checkPrices = jest.fn(async () => {});

    const app = {
      BROWSER: 0,
      options: {
        server: {
          endpoint: { host: 'prod.saito.example' },
          host: 'prod.saito.example'
        }
      },
      modules: { returnModule: jest.fn(() => mixin) }
    };

    await mod.initialize(app);
    await initializeMixin();

    expect(mixin.createAccount).toHaveBeenCalledTimes(1);
    expect(mod.loadAltAccounts).toHaveBeenCalledTimes(1);
    expect(mod.loadPendingPayments).toHaveBeenCalledTimes(1);
    expect(mod.checkPrices).toHaveBeenCalledTimes(1);
    expect(mod.service_ready).toBe(true);
    expect(mod.returnServices()).toEqual([expect.objectContaining({ service: 'buysaito' })]);
  });

  test('does not advertise wrapped SAITO as a payment currency', () => {
    const ercSaito = {
      ticker: 'ERC-SAITO',
      price_usd: 0.01,
      activate: jest.fn()
    };
    const bepSaito = {
      ticker: 'BEP-SAITO',
      price_usd: 0.01
    };
    const usdt = {
      ticker: 'USDT',
      chain_id: 'ethereum-chain',
      price_usd: 1
    };
    const mod = Object.create(BuySaito.prototype);
    mod.mixin_mod = { crypto_mods: [ercSaito, bepSaito, usdt] };
    mod.available_currencies = [];
    mod.erc_saito = null;

    mod.loadAvailableCryptos();

    expect(ercSaito.activate).toHaveBeenCalledTimes(1);
    expect(mod.erc_saito).toBe(ercSaito);
    expect(mod.available_currencies).toEqual([
      { ticker: 'USDT', chain_id: 'ethereum-chain', price_usd: 1 }
    ]);
  });
});
