const fs = require('fs');
const path = require('path');
const { classifyWeb3Proceeds } = require('../../../mods/store/lib/web3-amount');
const WithdrawalTemplate = require('../../../mods/store/lib/ui/overlays/withdrawal.template');

let shown = '';
const clicks = {};

jest.mock('../../../lib/saito/ui/saito-overlay/saito-overlay', () => {
  return class SaitoOverlay {
    show(html) {
      shown = html;
    }
    close() {}
  };
});

const WithdrawalOverlay = require('../../../mods/store/lib/ui/overlays/withdrawal');

function installDocument() {
  global.document = {
    querySelector() {
      return {
        querySelector(selector) {
          const action = String(selector).match(/data-action="([^"]+)"/)?.[1];
          if (!action || !shown.includes(`data-action="${action}"`)) {
            return null;
          }
          return {
            addEventListener(_event, handler) {
              clicks[action] = handler;
            }
          };
        },
        addEventListener() {}
      };
    }
  };
}

function overlayFor(crypto, eligible = '3') {
  const requests = [];
  const app = {
    wallet: {
      returnCryptoModuleByTicker: () => crypto
    },
    network: {
      sendRequestAsTransaction(_request, _data, callback) {
        requests.push(_request);
        callback({ eligible: { TRX: eligible } });
      }
    }
  };
  return {
    overlay: new WithdrawalOverlay(app, { store_public_key: 'server' }),
    requests
  };
}

describe('web3 withdrawal eligibility', () => {
  test('a sale becomes eligible on the fifth block after inclusion', () => {
    const rows = [
      {
        web3_ticker: 'TRX',
        web3_amount: '1.5',
        quantity_sold: 2,
        block_id_sold: 10,
        longest_chain_sold: 1
      }
    ];
    expect(classifyWeb3Proceeds(rows, 14, 5)).toEqual({
      pending: { TRX: '3' },
      eligible: {}
    });
    expect(classifyWeb3Proceeds(rows, 15, 5)).toEqual({
      pending: {},
      eligible: { TRX: '3' }
    });
  });

  test('an off-chain sale stays pending after the wait', () => {
    const rows = [
      {
        web3_ticker: 'TRX',
        web3_amount: '4',
        quantity_sold: 1,
        block_id_sold: 1,
        longest_chain_sold: 0
      }
    ];
    expect(classifyWeb3Proceeds(rows, 20, 5).pending).toEqual({ TRX: '4' });
    expect(classifyWeb3Proceeds(rows, 20, 5).eligible).toEqual({});
  });
});

describe('withdrawal overlay', () => {
  beforeEach(() => {
    shown = '';
    for (const key of Object.keys(clicks)) {
      delete clicks[key];
    }
    installDocument();
    global.alert = jest.fn();
  });

  test('an activated account shows its address and the full read-only amount', async () => {
    const crypto = { address: 'TLocalAddress', isActivated: () => true, activate: jest.fn() };
    const { overlay } = overlayFor(crypto, '3');
    await overlay.open('trx');

    expect(crypto.activate).not.toHaveBeenCalled();
    expect(shown).toContain('Withdraw TRX');
    expect(shown).not.toContain('name="ticker"');
    expect(shown).not.toContain('Cryptocurrency');
    expect(shown).not.toContain('data-action="cancel"');
    expect(shown).toContain('>Address<');
    expect(shown).toContain('>Amount<');
    expect(shown).toContain('value="TLocalAddress"');
    expect(shown).toContain('value="3"');
    expect(shown).toContain('readonly');
    expect(shown).toContain('data-action="confirm-withdraw"');
  });

  test('a missing local account can be activated and then shows the address', async () => {
    const crypto = {
      address: '',
      isActivated: () => false,
      activate: jest.fn(async () => {
        crypto.address = 'TNewAddress';
        return true;
      })
    };
    const { overlay } = overlayFor(crypto, '3');
    await overlay.open('TRX');
    expect(shown).toContain('You need a TRX withdrawal address to receive your crypto.');
    expect(shown).not.toContain('data-action="cancel"');

    await clicks['activate-account']({ preventDefault() {} });
    expect(crypto.activate).toHaveBeenCalled();
    expect(shown).toContain('value="TNewAddress"');
    expect(shown).toContain('value="3"');
  });

  test('activation failure keeps the create button and an error', async () => {
    const crypto = {
      address: '',
      isActivated: () => false,
      activate: jest.fn(async () => false)
    };
    const { overlay } = overlayFor(crypto, '3');
    await overlay.open('TRX');
    await clicks['activate-account']({ preventDefault() {} });
    expect(shown).toContain('Could not create a local TRX account.');
    expect(shown).toContain('data-action="activate-account"');
  });

  test('withdraw requests a store quote and does not sign by itself', async () => {
    const crypto = { address: 'TLocalAddress', isActivated: () => true };
    const { overlay, requests } = overlayFor(crypto, '3');
    await overlay.open('TRX');
    await clicks['confirm-withdraw']({ preventDefault() {} });
    expect(global.alert).not.toHaveBeenCalled();
    expect(requests).toEqual(['load-web3-proceeds', 'store-withdrawal-quote']);
    expect(shown).toContain('The Store could not prepare a withdrawal quote.');
  });

  test('an insufficient SAITO balance stops before a transaction is created', async () => {
    const crypto = { address: 'TLocalAddress', isActivated: () => true };
    const requests = [];
    const app = {
      wallet: {
        returnCryptoModuleByTicker: () => crypto,
        getBalance: async () => 0n,
        convertSaitoToNolan: () => 100000000,
        createUnsignedTransactionWithDefaultFee: jest.fn()
      },
      network: {
        sendRequestAsTransaction(request, _data, callback) {
          requests.push(request);
          if (request === 'load-web3-proceeds') {
            callback({ eligible: { TRX: '3' } });
            return;
          }
          callback({
            data: {
              amount: '1',
              publickey: 'treasury',
              ticker: 'TRX',
              withdrawal_amount: '3',
              withdrawal_address: 'TLocalAddress',
              transfer_uuids: ['1'],
              payment_uuids: ['hash'],
              timestamp: '1-1'
            },
            signature: 'sig'
          });
        }
      }
    };
    const overlay = new WithdrawalOverlay(app, { store_public_key: 'server' });
    await overlay.open('TRX');
    await clicks['confirm-withdraw']({ preventDefault() {} });

    expect(shown).toContain('does not contain enough SAITO');
    expect(shown).toContain('https://wiki.saito.io/applications/store/payments');
    expect(shown).toContain('info@saito.io');
    expect(shown).not.toContain('data-action="cancel"');
    expect(app.wallet.createUnsignedTransactionWithDefaultFee).not.toHaveBeenCalled();
    expect(requests).toEqual(['load-web3-proceeds', 'store-withdrawal-quote']);
  });

  test('withdraw signs and submits the quote without a second confirmation', async () => {
    const crypto = { address: 'TLocalAddress', isActivated: () => true };
    const requests = [];
    const sign = jest.fn(async () => {
      prepared.signature = 'user-sig';
    });
    const prepared = {
      to: [{ publicKey: 'treasury', amount: 0n }],
      sign,
      serialize_to_web: () => 'serialized-withdrawal'
    };
    const app = {
      wallet: {
        returnCryptoModuleByTicker: () => crypto,
        getBalance: async () => 0n,
        convertSaitoToNolan: () => 0,
        createUnsignedTransactionWithDefaultFee: jest.fn(async () => prepared)
      },
      network: {
        sendRequestAsTransaction(request, _data, callback) {
          requests.push(request);
          if (request === 'load-web3-proceeds') {
            callback({ eligible: { TRX: '3' } });
            return;
          }
          if (request === 'store-withdrawal') {
            callback({
              status: 'submitted',
              message: 'Withdrawal request submitted to the treasury. The external cryptocurrency has not been sent.'
            });
            return;
          }
          callback({
            data: {
              amount: '0',
              publickey: 'treasury',
              ticker: 'TRX',
              withdrawal_amount: '3',
              timestamp: '1-1'
            },
            signature: 'sig'
          });
        }
      }
    };
    const overlay = new WithdrawalOverlay(app, { store_public_key: 'server' });
    await overlay.open('TRX');
    await clicks['confirm-withdraw']({ preventDefault() {} });
    expect(sign).toHaveBeenCalledTimes(1);
    expect(requests).toEqual(['load-web3-proceeds', 'store-withdrawal-quote', 'store-withdrawal']);
    expect(shown).toContain('submitted to the treasury');
    expect(shown).not.toContain('data-action="sign-withdrawal"');
    expect(shown).not.toContain('data-action="cancel"');
  });

  test('an empty submission result is not sent again', async () => {
    const crypto = { address: 'TLocalAddress', isActivated: () => true };
    let submissions = 0;
    const prepared = {
      to: [{ publicKey: 'treasury', amount: 0n }],
      sign: jest.fn(async () => {
        prepared.signature = 'user-sig';
      }),
      serialize_to_web: () => 'serialized-withdrawal'
    };
    const app = {
      wallet: {
        returnCryptoModuleByTicker: () => crypto,
        getBalance: async () => 0n,
        convertSaitoToNolan: () => 0,
        createUnsignedTransactionWithDefaultFee: jest.fn(async () => prepared)
      },
      network: {
        sendRequestAsTransaction(request, _data, callback) {
          if (request === 'load-web3-proceeds') {
            callback({ eligible: { TRX: '3' } });
            return;
          }
          if (request === 'store-withdrawal') {
            submissions += 1;
            callback({});
            return;
          }
          callback({
            data: { amount: '0', publickey: 'treasury', ticker: 'TRX', timestamp: '1-1' },
            signature: 'sig'
          });
        }
      }
    };
    const overlay = new WithdrawalOverlay(app, { store_public_key: 'server' });
    await overlay.open('TRX');
    await clicks['confirm-withdraw']({ preventDefault() {} });
    expect(shown).toContain('was not submitted again');
    expect(submissions).toBe(1);
    expect(app.wallet.createUnsignedTransactionWithDefaultFee).toHaveBeenCalledTimes(1);
  });

  test('the loader status is centered and the action row is right aligned', () => {
    const css = fs.readFileSync(
      path.join(__dirname, '../../../mods/store/web/css/store-withdrawals.css'),
      'utf8'
    );
    const html = WithdrawalTemplate({ state: 'loading', ticker: 'TRX', statusText: 'Retrieving withdrawal details...' });
    expect(html).toContain('activation-status');
    expect(html).toContain('Retrieving withdrawal details...');
    expect(html).not.toContain('data-action="cancel"');
    expect(css).toContain('text-align: center');
    expect(css).toContain('width: 1.75rem');
    expect(css).toContain('justify-content: flex-end');
    expect(css).toContain('min(92vw, 42rem)');
  });

  test('the confirmation template keeps the amount read-only', () => {
    const html = WithdrawalTemplate({
      state: 'ready',
      ticker: 'TRX',
      eligible: '3',
      address: 'TLocalAddress'
    });
    expect(html).toContain('name="amount" value="3" readonly');
    expect(html).toContain('name="address" value="TLocalAddress" readonly');
  });
});
