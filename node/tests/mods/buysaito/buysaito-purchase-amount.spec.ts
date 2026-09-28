/** @jest-environment jsdom */
// @ts-nocheck

jest.mock('../../../lib/saito/transaction', () => ({ default: class Transaction {} }));
jest.mock('../../../lib/saito/saito', () => ({}));
jest.mock('../../../lib/templates/modtemplate', () => class ModTemplate {});
jest.mock('../../../lib/saito/ui/saito-header/saito-header', () => class SaitoHeader {});
jest.mock(
  '../../../lib/saito/ui/saito-overlay/saito-overlay',
  () =>
    class SaitoOverlay {
      visible = false;
      show = jest.fn(() => {
        this.visible = true;
      });
    }
);

const { EventEmitter } = require('events');
const BuySaito = require('../../../mods/buysaito/buysaito');
const SaitoPurchaseOverlay = require('../../../mods/buysaito/lib/saito-purchase');
const SaitoPurchaseAmountTemplate = require('../../../mods/buysaito/lib/saito-purchase-amount.template');
const BuySaitoHome = require('../../../mods/buysaito/index');

function setup() {
  const app = {
    BROWSER: 1,
    connection: new EventEmitter(),
    modules: { getRespondTos: jest.fn(() => []) },
    browser: { escapeHTML: (value) => value }
  };
  const mod = Object.assign(Object.create(BuySaito.prototype), {
    app,
    browser_active: true,
    publicKey: 'buyer',
    authorized_public_key: 'treasury',
    available_currencies: [
      { ticker: 'USDT', icon_url: '/usdt.png', price_usd: 1 },
      { ticker: 'SOL', icon_url: '/sol.png', price_usd: 100 }
    ],
    erc_saito: { price_usd: 0.01 }
  });
  const overlay = new SaitoPurchaseOverlay(app, mod);
  mod.purchase_overlay = overlay;
  overlay.checkForLocalCrypto = jest.fn(async () => {});
  document.body.innerHTML = '<div id="buysaito-amount-form"></div>';
  mod.attachEvents();
  const crypto = document.getElementById('buy-page-input-amount');
  const saito = document.getElementById('buy-page-saito-input-amount');
  const next = document.getElementById('buy-page-next-purchase-btn');
  const select = document.getElementById('buy-page-payment-currency');
  const input = (element, value) => {
    element.value = value;
    element.dispatchEvent(new Event('input'));
  };
  const changeCurrency = (ticker) => {
    select.value = ticker;
    select.dispatchEvent(new Event('change'));
  };
  return { app, mod, overlay, crypto, saito, next, select, input, changeCurrency };
}

describe('BuySaito amount selection', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
    document.body.innerHTML = '';
  });

  test('replaces the preset quote picker on the default page', () => {
    const { app, mod } = setup();
    mod.returnSlug = () => 'buy';
    const html = BuySaitoHome(app, mod, '', {});
    expect(html).toContain('id="buysaito-amount-form"');
    expect(html).not.toMatch(/Get Quote|purchase-saito-amount|buysaito-button/);
  });

  test('renders two editable amounts, a currency dropdown, and only Next', () => {
    const { app, mod } = setup();
    const html = SaitoPurchaseAmountTemplate(app, mod, {
      crypto_selected: { ticker: 'USDT' }
    });
    expect(html.match(/inputmode="decimal"/g)).toHaveLength(2);
    expect(html).toContain('id="payment-currency"');
    expect(html).toContain('value="SOL"');
    expect(html).not.toMatch(/readonly|back-purchase-btn|Cancel/);
    expect(document.querySelectorAll('#buysaito-amount-form button')).toHaveLength(1);
  });

  test('enables Next only for positive amounts and disables it after clearing either field', () => {
    const { crypto, saito, next, input } = setup();
    expect(next.disabled).toBe(true);
    for (const value of ['', 'abc', '.', '0', '0.00000001']) {
      input(crypto, value);
      expect(next.disabled).toBe(true);
    }
    input(crypto, '1x.2.3');
    expect(crypto.value).toBe('1.23');
    expect(next.disabled).toBe(false);
    input(saito, '');
    expect(crypto.value).toBe('');
    expect(next.disabled).toBe(true);
    input(saito, '100');
    expect(crypto.value).toBe('1.1');
    expect(next.disabled).toBe(false);
    input(crypto, '');
    expect(saito.value).toBe('');
    expect(next.disabled).toBe(true);
  });

  test('switches payment currency while retaining the last edited amount and updating the logo', () => {
    const { crypto, saito, input, changeCurrency } = setup();
    input(saito, '100');
    changeCurrency('SOL');
    expect(saito.value).toBe('100');
    // Retain the existing conversion's upward rounding to six decimal places.
    expect(crypto.value).toBe('0.011001');
    expect(crypto.getAttribute('aria-label')).toBe('Amount in SOL');
    expect(document.querySelector('[data-payment-logo="SOL"]').hidden).toBe(false);
    expect(document.querySelector('[data-payment-logo="USDT"]').hidden).toBe(true);
    input(crypto, '2');
    changeCurrency('USDT');
    expect(crypto.value).toBe('2');
    expect(saito.value).toBe('181');
  });

  test.each(['crypto', 'saito'])(
    'requests instructions directly using the entered %s amount',
    async (source) => {
      const { app, overlay, crypto, saito, next, input, changeCurrency } = setup();
      const send = jest.fn();
      app.connection.on('relay-send-message', send);
      changeCurrency('SOL');
      input(source === 'saito' ? saito : crypto, '100');
      await next.onclick();
      expect(overlay.active).toBe(true);
      expect(overlay.overlay.show).toHaveBeenCalledTimes(1);
      expect(overlay.checkForLocalCrypto).toHaveBeenCalledTimes(1);
      expect(send).toHaveBeenCalledWith({
        recipient: 'treasury',
        request: 'buysaito reserve address',
        data: {
          initiator_pubkey: 'buyer',
          recipient_pubkey: 'buyer',
          ticker: 'SOL',
          tx: null,
          ...(source === 'saito' ? { issue_amount: '100' } : { expected_deposit: '100' })
        }
      });
      await next.onclick();
      expect(send).toHaveBeenCalledTimes(1);
    }
  );

  test('does not request instructions for an empty form or after closing during balance lookup', async () => {
    const { app, overlay, crypto, next, input } = setup();
    const send = jest.fn();
    app.connection.on('relay-send-message', send);
    await next.onclick();
    expect(send).not.toHaveBeenCalled();
    input(crypto, '2');
    let finish;
    overlay.checkForLocalCrypto.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    const pending = next.onclick();
    overlay.active = false;
    overlay.reset();
    finish();
    await pending;
    expect(send).not.toHaveBeenCalled();
  });

  test('disables the form without currencies and initializes when availability arrives', async () => {
    const { mod, overlay } = setup();
    mod.available_currencies = [];
    overlay.renderAmountPage();
    expect(document.getElementById('buy-page-input-amount').disabled).toBe(true);
    expect(document.getElementById('buy-page-next-purchase-btn').disabled).toBe(true);
    await mod.handlePeerTransaction(mod.app, {
      isTo: () => true,
      returnMessage: () => ({
        request: 'buysaito available currencies',
        data: {
          ac: [{ ticker: 'SOL', price_usd: 100 }],
          erc: 0.01
        }
      })
    });
    expect(document.getElementById('buy-page-payment-currency').value).toBe('SOL');
    expect(document.getElementById('buy-page-input-amount').disabled).toBe(false);
    expect(document.getElementById('buy-page-next-purchase-btn').disabled).toBe(true);
  });

  test('page refreshes retain entered amounts and do not overwrite an active purchase', () => {
    const { mod, overlay, saito, input } = setup();
    input(saito, '100');
    overlay.crypto_selected = { ticker: 'SOL' };
    overlay.amount = 500;
    overlay.renderAmountPage();
    expect(document.getElementById('buy-page-saito-input-amount').value).toBe('100');
    expect(document.getElementById('buy-page-input-amount').value).toBe('1.1');
    expect(overlay.crypto_selected.ticker).toBe('SOL');
    expect(overlay.amount).toBe(500);
    expect(mod.convertSaitoToOther(100, 'USDT')).toBe(1.1);
  });
});
