const {
  requestStoreWeb3Tickers,
  returnStoreWeb3Tickers
} = require('../../../mods/store/lib/ui/overlays/listing-field-edit');

function makeApp(currencies = []) {
  const sent = [];
  const listeners = [];
  const mixin = {
    buysaito_peer: { publicKey: 'buysaito-key' },
    available_currencies: currencies
  };
  const app = {
    modules: {
      returnModule: () => mixin
    },
    network: {
      sendRequestAsTransaction(request, data, callback, publicKey) {
        sent.push({ request, data, publicKey });
      }
    },
    connection: {
      on(event, handler) {
        if (event === 'saito-purchase-cryptos') {
          listeners.push(handler);
        }
      },
      emit(event) {
        if (event === 'saito-purchase-cryptos') {
          listeners.forEach((handler) => handler());
        }
      }
    }
  };
  return { app, mixin, sent };
}

describe('store web3 ticker requests', () => {
  beforeEach(() => {
    requestStoreWeb3Tickers.reset();
  });

  test('asks once and does not ask again after an empty reply', () => {
    const { app, mixin, sent } = makeApp([]);

    requestStoreWeb3Tickers(app);
    requestStoreWeb3Tickers(app);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toEqual({
      request: 'buysaito available currencies',
      data: null,
      publicKey: 'buysaito-key'
    });

    mixin.available_currencies = [];
    app.connection.emit('saito-purchase-cryptos');
    requestStoreWeb3Tickers(app);
    requestStoreWeb3Tickers(app);

    expect(sent).toHaveLength(1);
  });

  test('does not ask when a reply already reported no currencies', () => {
    const { app, sent } = makeApp(null);

    requestStoreWeb3Tickers(app);

    expect(sent).toHaveLength(0);
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
    const { app, sent } = makeApp([{ ticker: 'ETH' }]);

    requestStoreWeb3Tickers(app);

    expect(sent).toHaveLength(0);
  });
});
