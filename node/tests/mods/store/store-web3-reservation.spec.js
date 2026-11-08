const Web3PaymentOverlay = require('../../../mods/store/lib/ui/overlays/web3-payment');

function harness() {
  const pending = [];
  const sent = [];
  const alerts = [];
  global.salert = (message) => alerts.push(message);
  global.document = { querySelector: () => null };
  const app = {
    connection: { on() {} },
    wallet: { getPublicKey: async () => 'buyer' },
    browser: {
      formatDecimals: (value) => String(value),
      escapeHTML: (value) => String(value),
      generateQRCode() {}
    },
    network: {
      sendRequestAsTransaction(request, data, callback, publicKey) {
        sent.push({ request, data, callback, publicKey });
      }
    },
    modules: {
      returnModule(name) {
        if (name === 'Mixin') {
          return {
            buysaito_peer: { publicKey: 'service-key' },
            pending_payments: pending
          };
        }
        return null;
      }
    }
  };
  const overlay = new Web3PaymentOverlay(app, { web3PaymentsEnabled: () => true });
  overlay.overlay.show = () => {};
  overlay.overlay.blockClose = () => {};
  overlay.active = true;
  overlay.session = 3;
  overlay.ticker = 'TRX';
  overlay.expected_deposit = '1.5';
  overlay.purchase_tx = { serialize_to_web: () => 'carrier' };
  return { app, overlay, pending, sent, alerts };
}

describe('Store web3 address reservation', () => {
  afterEach(() => {
    delete global.salert;
    delete global.document;
  });

  test('the reserve callback supplies the deposit address and records one pending payment', async () => {
    const { overlay, pending, sent } = harness();
    await overlay.requestAddress();
    const message = sent.find((row) => row.request === 'buysaito reserve address');
    expect(typeof message.callback).toBe('function');
    expect(message.publicKey).toBe('service-key');

    const reservation = {
      id: 4,
      address: 'Taddr',
      mixin_id: 'user-1',
      ticker: 'TRX',
      expected_deposit: '1.5',
      status: 'new',
      reserved_until: Date.now() + 60000
    };
    message.callback(reservation);
    message.callback(reservation);

    expect(overlay.destination).toBe('Taddr');
    expect(pending).toEqual([reservation]);
    clearTimeout(overlay.reservation_timer);
    clearTimeout(overlay.instruction_timer);
  });

  test('a late callback from an older session does not replace the overlay', async () => {
    const { overlay, pending, sent } = harness();
    await overlay.requestAddress();
    overlay.session = 4;
    sent[0].callback({
      id: 4,
      address: 'Taddr',
      mixin_id: 'user-1',
      ticker: 'TRX'
    });
    expect(overlay.destination).toBe('');
    expect(pending).toEqual([]);
    clearTimeout(overlay.instruction_timer);
  });

  test('checkout does not ask for an address while web3 payments are disabled', async () => {
    const { overlay, sent, alerts } = harness();
    overlay.mod.web3PaymentsEnabled = () => false;
    await overlay.start({ nft_id: 'nft', web3_ticker: 'TRX', web3_amount: '1' });
    expect(sent).toEqual([]);
    expect(alerts).toEqual(['Web3 payments are not enabled for this Store.']);
  });
});
