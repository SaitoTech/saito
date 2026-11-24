jest.mock('@mixin.dev/mixin-node-sdk', () => ({
  MixinApi: jest.fn(),
  getED25519KeyPair: jest.fn(),
  base64RawURLEncode: jest.fn()
}));

const Mixin = require('../../../mods/mixin/mixin');
const {
  requestStoreWeb3Tickers,
  returnStoreWeb3Tickers
} = require('../../../mods/store/lib/ui/overlays/listing-field-edit');

function makeApp(currencies = []) {
  const sent = [];
  const mixin = Object.create(Mixin.prototype);
  const app = {
    modules: {
      returnModule: () => mixin
    },
    network: {
      sendRequestAsTransaction(request, data, callback, publicKey) {
        sent.push({ request, data, callback, publicKey });
      }
    },
    connection: {
      emit() {}
    }
  };
  Object.assign(mixin, {
    app,
    buysaito_peer: { publicKey: 'buysaito-key' },
    available_currencies: currencies,
    available_currencies_at: 0,
    available_currencies_failed_at: 0,
    currency_catalogue_peer: '',
    currency_failure_peer: '',
    currency_request: null,
    currency_request_peer: '',
    currency_request_generation: 0,
    currency_request_started_at: 0,
    erc_saito: null,
    browser_active: false
  });
  return { app, mixin, sent };
}

describe('store web3 ticker requests', () => {
  beforeEach(() => {
    requestStoreWeb3Tickers.reset();
  });

  test('asks once and does not ask again after an empty reply', () => {
    const { app, sent } = makeApp([]);

    requestStoreWeb3Tickers(app);
    requestStoreWeb3Tickers(app);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      request: 'buysaito available currencies',
      data: null,
      publicKey: 'buysaito-key'
    });

    sent[0].callback({ err: 'empty reply' });
    requestStoreWeb3Tickers(app);
    requestStoreWeb3Tickers(app);

    expect(sent).toHaveLength(1);
  });

  test('does not ask during the cooldown after a reply reported no currencies', () => {
    const { app, mixin, sent } = makeApp(null);
    mixin.available_currencies_failed_at = Date.now();
    mixin.currency_failure_peer = 'buysaito-key';

    requestStoreWeb3Tickers(app);

    expect(sent).toHaveLength(0);
  });

  test('buy and store read the same Mixin currency catalogue', () => {
    const { app, mixin } = makeApp([]);
    mixin.receiveAvailableCurrencies(
      {
        ac: [
          { ticker: 'ETH', price_usd: 2 },
          { ticker: 'BEP-SAITO', price_usd: 1 }
        ],
        erc: 0.02
      },
      { provider: 'buysaito-key' }
    );

    expect(returnStoreWeb3Tickers(app)).toEqual(['SAITO', 'ETH']);
    expect(mixin.available_currencies).toEqual([{ ticker: 'ETH', price_usd: 2 }]);
    expect(mixin.erc_saito).toEqual({ price_usd: 0.02 });
  });

  test('lists installed payment cryptos when the priced reply is empty', () => {
    const app = {
      modules: {
        returnModule: () => ({
          available_currencies: [],
          crypto_mods: [
            { ticker: 'ETH' },
            { ticker: 'ERC-SAITO' },
            { ticker: 'USDT' },
            { ticker: 'ETH' }
          ]
        })
      }
    };

    expect(returnStoreWeb3Tickers(app, 'SOL')).toEqual(['SAITO', 'ETH', 'USDT', 'SOL']);
  });

  test('does not ask when currencies are already available', () => {
    const { app, mixin, sent } = makeApp([{ ticker: 'ETH', price_usd: 2 }]);
    mixin.available_currencies_at = Date.now();
    mixin.currency_catalogue_peer = 'buysaito-key';

    requestStoreWeb3Tickers(app);

    expect(sent).toHaveLength(0);
  });
});
