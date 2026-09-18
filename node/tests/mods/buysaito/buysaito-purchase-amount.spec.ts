// @ts-nocheck

jest.mock('../../../lib/saito/transaction', () => ({ default: class Transaction {} }));
jest.mock('../../../lib/saito/saito', () => ({}));
jest.mock('../../../lib/templates/modtemplate', () => class ModTemplate {});
jest.mock('../../../lib/saito/ui/saito-header/saito-header', () => class SaitoHeader {});
jest.mock('../../../lib/saito/ui/saito-overlay/saito-overlay', () => class SaitoOverlay {});
jest.mock('../../../mods/buysaito/index', () => jest.fn());

const BuySaito = require('../../../mods/buysaito/buysaito');
const SaitoPurchaseOverlay = require('../../../mods/buysaito/lib/saito-purchase');
const SaitoPurchaseAmountTemplate = require('../../../mods/buysaito/lib/saito-purchase-amount.template');

describe('BuySaito amount selection', () => {
  test('renders editable decimal inputs for both currencies', () => {
    const app = {
      modules: {
        getRespondTos: jest.fn(() => [])
      }
    };
    const mod = {
      available_currencies: [{ ticker: 'USDT', icon_url: '/usdt.png' }]
    };

    const html = SaitoPurchaseAmountTemplate(app, mod, {
      crypto_selected: { ticker: 'USDT' }
    });

    expect(html).toContain('id="input-amount"');
    expect(html).toContain('id="saito-input-amount"');
    expect(html.match(/inputmode="decimal"/g)).toHaveLength(2);
    expect(html).not.toContain('readonly');
  });

  test('updates the opposite amount live and uses the last edited currency', () => {
    const originalDocument = global.document;
    const originalSalert = global.salert;
    const cryptoInput = { value: '' };
    const saitoInput = { value: '' };
    const nextButton = {};
    const elements = {
      'input-amount': cryptoInput,
      'saito-input-amount': saitoInput,
      'next-purchase-btn': nextButton
    };

    global.document = {
      querySelectorAll: () => [],
      getElementById: (id) => elements[id] || null,
      querySelector: () => null
    };
    global.salert = jest.fn();

    try {
      const overlay = Object.create(SaitoPurchaseOverlay.prototype);
      overlay.mod = {
        available_currencies: [],
        convertToSaito: jest.fn((amount) => amount * 10),
        convertSaitoToOther: jest.fn((amount) => amount / 100)
      };
      overlay.crypto_selected = { ticker: 'USDT' };
      overlay.amount = 0;
      overlay.expected_deposit = 0;
      overlay.amount_input_source = 'crypto';
      overlay.overlay = { show: jest.fn() };
      overlay.requestPaymentAddressFromServer = jest.fn();

      overlay.attachEvents();

      cryptoInput.value = '1x.2.3';
      cryptoInput.oninput();
      expect(cryptoInput.value).toBe('1.23');
      expect(saitoInput.value).toBe('12.3');

      saitoInput.value = '4e5';
      saitoInput.oninput();
      expect(saitoInput.value).toBe('45');
      expect(cryptoInput.value).toBe('0.45');

      nextButton.onclick();
      expect(overlay.amount).toBe('45');
      expect(overlay.expected_deposit).toBe(0);

      cryptoInput.value = '2';
      cryptoInput.oninput();
      nextButton.onclick();
      expect(overlay.amount).toBe(0);
      expect(overlay.expected_deposit).toBe('2');
      expect(overlay.requestPaymentAddressFromServer).toHaveBeenCalledTimes(2);
      expect(global.salert).not.toHaveBeenCalled();
    } finally {
      global.document = originalDocument;
      global.salert = originalSalert;
    }
  });

  test('converts SAITO using browser-provided currency prices', () => {
    const mod = Object.create(BuySaito.prototype);
    mod.mixin_mod = null;
    mod.available_currencies = [{ ticker: 'USDT', price_usd: 1 }];
    mod.erc_saito = { price_usd: 0.01 };

    expect(mod.convertSaitoToOther(100, 'USDT')).toBe(1.1);
  });
});
