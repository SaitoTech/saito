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

const { EventEmitter } = require('events');

const Mixin = require('../../../mods/mixin/mixin');
const SaitoPurchaseOverlay = require('../../../mods/mixin/lib/ui/overlays/buysaito-purchase');

function connection() {
  const emitter = new EventEmitter();
  return emitter;
}

function browserApp() {
  const sent = [];
  const app = {
    BROWSER: 1,
    options: {},
    browser_active: 0,
    build_number: 'test',
    browser: {
      escapeHTML: (value) => value,
      returnURLParameter: () => '',
      formatDecimals: (value) => value
    },
    storage: { saveOptions() {} },
    wallet: { getPrivateKey: async () => 'private', getPublicKey: async () => 'me' },
    crypto: {},
    connection: connection(),
    network: {
      sendRequestAsTransaction(request, data, callback, publicKey) {
        sent.push({ request, data, publicKey });
      }
    },
    modules: {
      returnModule() {
        return null;
      },
      respondTo() {
        return [];
      }
    }
  };
  app.sent = sent;
  return app;
}

describe('Mixin purchase UI', () => {
  test('launch asks the connected buysaito peer for currencies', () => {
    const app = browserApp();
    const mod = {
      publicKey: 'buyer',
      available_currencies: [],
      buysaito_peer: { publicKey: 'service-key' },
      app
    };
    mod.app = app;
    const overlay = new SaitoPurchaseOverlay(app, mod);
    overlay.overlay.show = () => {};
    const opened = [];
    app.connection.on('saito-purchase-overlay-open', (close) => opened.push(typeof close));

    app.connection.emit('saito-purchase-launch');

    expect(opened).toEqual(['function']);
    expect(app.sent).toEqual([
      {
        request: 'buysaito available currencies',
        data: null,
        publicKey: 'service-key'
      }
    ]);
    expect(overlay.active).toBe(true);
    clearTimeout(overlay.timer);
  });

  test('a reserve reply is matched on address and announced to the overlay', async () => {
    const app = browserApp();
    const mixin = new Mixin(app);
    mixin.publicKey = 'me';
    mixin.buysaito_peer = { publicKey: 'service-key' };
    mixin.pending_payments = [];
    const reserved = [];
    app.connection.on('saito-purchase-address-reserved', (data) => reserved.push(data));

    const tx = {
      isTo: () => false,
      isFrom: (key) => key === 'service-key',
      returnMessage: () => ({
        request: 'buysaito reserve address',
        data: {
          id: 7,
          address: '0xabc',
          mixin_id: 'user-1',
          ticker: 'ETH',
          status: 'new'
        }
      })
    };

    const ignored = await mixin.handlePeerTransaction(app, tx, { publicKey: 'other-peer' });
    expect(ignored).toBe(0);
    expect(reserved).toEqual([]);

    const handled = await mixin.handlePeerTransaction(app, tx, { publicKey: 'service-key' });

    expect(handled).toBe(1);
    expect(reserved).toEqual([
      {
        id: 7,
        address: '0xabc',
        mixin_id: 'user-1',
        ticker: 'ETH',
        status: 'new'
      }
    ]);
    expect(mixin.pending_payments[0].address).toBe('0xabc');
  });

  test('payment detected and issuance notices arrive from the connected service', async () => {
    const app = browserApp();
    const mixin = new Mixin(app);
    mixin.publicKey = 'me';
    mixin.buysaito_peer = { publicKey: 'service-key' };
    mixin.pending_payments = [{ id: 7, address: '0xabc', ticker: 'ETH', status: 'new' }];
    const detected = [];
    const issued = [];
    app.connection.on('saito-purchase-payment-detected', (data) => detected.push(data));
    app.connection.on('saito-purchase-saito-issued', (data) => issued.push(data));

    const notice = (request, data) => ({
      isTo: () => false,
      isFrom: (key) => key === 'service-key',
      returnMessage: () => ({ request, data })
    });

    await mixin.handlePeerTransaction(
      app,
      notice('buysaito payment detected', {
        id: 7,
        address: '0xabc',
        ticker: 'ETH',
        status: 'pending'
      }),
      { publicKey: 'service-key' }
    );
    await mixin.handlePeerTransaction(
      app,
      notice('buysaito saito issued', {
        id: 7,
        address: '0xabc',
        ticker: 'ETH',
        paid: 'payout-sig',
        status: 'confirmed'
      }),
      { publicKey: 'service-key' }
    );

    expect(detected).toEqual([
      { id: 7, address: '0xabc', ticker: 'ETH', status: 'pending' }
    ]);
    expect(issued[0].paid).toBe('payout-sig');
    expect(mixin.pending_payments).toEqual([]);
  });

  test('the reserve callback supplies the deposit instructions', async () => {
    const app = browserApp();
    app.network.sendRequestAsTransaction = (request, data, callback, publicKey) => {
      app.sent.push({ request, data, callback, publicKey });
    };
    const mod = {
      publicKey: 'buyer',
      buysaito_peer: { publicKey: 'service-key' },
      pending_payments: [],
      app
    };
    const overlay = new SaitoPurchaseOverlay(app, mod);
    overlay.overlay.show = () => {};
    overlay.active = true;
    overlay.crypto_selected = { ticker: 'TRX' };
    overlay.amount = 10;
    overlay.expected_deposit = 1.5;
    overlay.recipient = 'buyer';
    overlay.render = () => {};

    await overlay.requestPaymentAddressFromServer();
    const sent = app.sent.find((message) => message.request === 'buysaito reserve address');
    expect(typeof sent.callback).toBe('function');

    sent.callback({
      id: 4,
      address: 'Taddr',
      mixin_id: 'user-1',
      ticker: 'TRX',
      expected_deposit: '1.5',
      issue_amount: '10',
      status: 'new',
      reserved_until: Date.now() + 60000
    });

    expect(overlay.address).toBe('Taddr');
    expect(mod.pending_payments[0].address).toBe('Taddr');
    clearTimeout(overlay.reservation_timer);
    clearTimeout(overlay.payment_instruction_timer);
  });

  test('the overlay is created for a lite-client without BuySaito installed', async () => {
    const app = browserApp();
    global.window = { location: { toString: () => 'http://localhost/mixin' } };
    const mixin = new Mixin(app);

    await mixin.initialize(app);

    expect(mixin.purchase_overlay).toBeTruthy();
    expect(mixin.main).toBeTruthy();
    expect(mixin.transfers).toBeNull();

    const page = { sends: [] };
    const button = { onclick: null };
    global.document = {
      getElementById(id) {
        return id === 'mixin-buysaito-launch' ? button : null;
      }
    };
    mixin.available_currencies = [{ ticker: 'ETH', price_usd: 1 }];
    mixin.purchase_overlay.render = () => page.sends.push('overlay');
    mixin.browser_active = 1;
    mixin.purchase_overlay.renderAmountPage = () => page.sends.push('amount');
    mixin.render();
    button.onclick({ preventDefault() {} });

    expect(page.sends).toEqual(['amount', 'overlay']);
    expect(mixin.purchase_overlay.active).toBe(true);
    delete global.document;
  });

  test('/mixin is always served and /buy is kept when BuySaito is not installed', () => {
    const app = browserApp();
    const mixin = new Mixin(app);
    const routes = [];
    const expressapp = {
      get(route) {
        routes.push(route);
      },
      use() {}
    };

    mixin.webServer(app, expressapp, { static() {} });
    expect(routes).toEqual([
      ['/migration', '/migration/'],
      '/mixin',
      '/buy'
    ]);

    app.modules.returnModule = (name) => (name === 'BuySaito' ? { name } : null);
    const withBuySaito = [];
    mixin.webServer(
      app,
      {
        get(route) {
          withBuySaito.push(route);
        },
        use() {}
      },
      { static() {} }
    );
    expect(withBuySaito).toEqual([
      ['/migration', '/migration/'],
      '/mixin'
    ]);
  });

  test('currency conversion uses the server list and ignores local module prices', () => {
    const mixin = new Mixin(browserApp());
    mixin.erc_saito = { price_usd: 1 };
    mixin.available_currencies = [{ ticker: 'ETH', price_usd: 2 }];
    mixin.crypto_mods = [{ ticker: 'ETH', price_usd: 99 }];

    expect(mixin.convertSaitoToOther(10, 'ETH')).toBe(5.5);
    expect(mixin.convertToSaito(5.5, 'ETH')).toBe(10);
  });

  test('missing or unusable server prices do not invent a conversion', () => {
    const mixin = new Mixin(browserApp());
    mixin.erc_saito = { price_usd: 1 };
    mixin.available_currencies = [{ ticker: 'ETH', price_usd: 2 }];
    mixin.crypto_mods = [{ ticker: 'ETH', price_usd: 99 }];

    mixin.available_currencies = [{ ticker: 'ETH', price_usd: 0 }];
    expect(mixin.convertToSaito(1, 'ETH')).toBeNaN();
    mixin.available_currencies = [{ ticker: 'ETH', price_usd: -2 }];
    expect(mixin.convertSaitoToOther(1, 'ETH')).toBeNaN();
    mixin.available_currencies = [{ ticker: 'ETH' }];
    expect(mixin.convertToSaito(1, 'ETH')).toBeNaN();
    mixin.available_currencies = [{ ticker: 'ETH', price_usd: 2 }];
    mixin.erc_saito = null;
    expect(mixin.convertToSaito(1, 'ETH')).toBeNaN();
  });
});
