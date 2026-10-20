const { requestStoreWeb3Tickers } = require('../../../mods/store/lib/ui/overlays/listing-field-edit');

function makeApp(currencies = []) {
  const sent = [];
  const listeners = [];
  const buysaito = {
    authorized_public_key: 'buysaito-key',
    available_currencies: currencies
  };
  const app = {
    modules: {
      returnModule: () => buysaito
    },
    connection: {
      on(event, handler) {
        if (event === 'saito-purchase-cryptos') {
          listeners.push(handler);
        }
      },
      emit(event, payload) {
        if (event === 'relay-send-message') {
          sent.push(payload);
        }
        if (event === 'saito-purchase-cryptos') {
          listeners.forEach((handler) => handler());
        }
      }
    }
  };
  return { app, buysaito, sent };
}

describe('store web3 ticker requests', () => {
  beforeEach(() => {
    requestStoreWeb3Tickers.reset();
  });

  test('asks once and does not ask again after an empty reply', () => {
    const { app, buysaito, sent } = makeApp([]);

    requestStoreWeb3Tickers(app);
    requestStoreWeb3Tickers(app);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toEqual({
      recipient: 'buysaito-key',
      request: 'buysaito available currencies',
      data: null
    });

    buysaito.available_currencies = [];
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

  test('does not ask when currencies are already available', () => {
    const { app, sent } = makeApp([{ ticker: 'ETH' }]);

    requestStoreWeb3Tickers(app);

    expect(sent).toHaveLength(0);
  });
});
