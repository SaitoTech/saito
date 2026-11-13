const fs = require('fs');
const path = require('path');
const { classifyWeb3Proceeds } = require('../../../mods/store/lib/web3-amount');
const WithdrawalTemplate = require('../../../mods/store/lib/ui/overlays/withdrawal.template');

let shown = '';
let emailField = null;
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
    querySelector(selector) {
      if (String(selector).includes('name="email"')) {
        return emailField;
      }
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
    emailField = null;
    for (const key of Object.keys(clicks)) {
      delete clicks[key];
    }
    installDocument();
    global.alert = jest.fn();
  });

  test('an activated account shows the withdrawal form without an amount', async () => {
    const crypto = { address: 'TLocalAddress', isActivated: () => true, activate: jest.fn() };
    const { overlay } = overlayFor(crypto, '3');
    await overlay.open('trx');

    expect(crypto.activate).not.toHaveBeenCalled();
    expect(shown).toContain('WITHDRAW TRX');
    expect(shown).toContain('Your account is ready for withdrawal.');
    expect(shown).not.toContain('name="ticker"');
    expect(shown).not.toContain('Cryptocurrency');
    expect(shown).not.toContain('data-action="cancel"');
    expect(shown).not.toContain('name="amount"');
    expect(shown).not.toContain('migration@saito.tech');
    expect(shown).toContain('>Email (optional)<');
    expect(shown).toContain('>TRX withdrawal address<');
    expect(shown).toContain('value="TLocalAddress"');
    expect(shown).toContain('readonly');
    expect(shown).toContain('mailto:info@saito.io');
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
    expect(shown).toContain('you must first enable TRX support in your SAITO Wallet');
    expect(shown).toContain('Enable TRX');
    expect(shown).not.toContain('data-action="cancel"');

    await clicks['activate-account']({ preventDefault() {} });
    expect(crypto.activate).toHaveBeenCalled();
    expect(shown).toContain('value="TNewAddress"');
    expect(shown).toContain('Your account is ready for withdrawal.');
    expect(shown).not.toContain('name="amount"');
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
    expect(shown).toContain('We are having a problem processing this payment.');
    expect(shown).toContain('mailto:info@saito.io');
    expect(shown).not.toContain('could not prepare');
    expect(shown).not.toContain('migration@saito.tech');
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
    expect(shown).toContain('Your withdrawal request is now queued for withdrawal.');
    expect(shown).toContain('data-action="open-wallet"');
    expect(shown).not.toContain('submitted to the treasury');
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
    expect(shown).toContain('We are having a problem processing this payment.');
    expect(shown).not.toContain('was not submitted again');
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
    expect(css).toContain('width: 4.8rem');
    expect(css).toContain('underline dashed');
    expect(css).toContain('justify-content: flex-end');
    expect(css).toContain('min(92vw, 42rem)');
  });

  test('the TRX form has no amount and another ticker keeps its read-only amount', () => {
    const trx = WithdrawalTemplate({
      state: 'ready',
      ticker: 'TRX',
      eligible: '3',
      address: 'TLocalAddress',
      email: 'stored@example.com'
    });
    expect(trx).not.toContain('name="amount"');
    expect(trx).toContain('name="email" value="stored@example.com"');
    expect(trx).toContain('name="address" value="TLocalAddress" readonly');
    expect(trx).not.toContain('migration@saito.tech');

    const eth = WithdrawalTemplate({
      state: 'ready',
      ticker: 'ETH',
      eligible: '3',
      address: '0xabc'
    });
    expect(eth).toContain('name="amount" value="3" readonly');
    expect(eth).toContain('Withdraw ETH');
  });

  test('a stored wallet email is prefilled and an edited address is the one submitted', async () => {
    const crypto = { address: 'TLocalAddress', isActivated: () => true };
    const keychain = { returnKey: () => ({ email: 'stored@example.com' }), addKey: jest.fn() };
    const prepared = {
      to: [{ publicKey: 'treasury', amount: 0n }],
      sign: jest.fn(async () => {}),
      serialize_to_web: () => 'serialized-withdrawal'
    };
    const quotePayloads = [];
    const app = {
      keychain,
      connection: { emit: jest.fn() },
      wallet: {
        publicKey: 'user-key',
        returnCryptoModuleByTicker: () => crypto,
        getBalance: async () => 0n,
        convertSaitoToNolan: () => 0,
        setPreferredCrypto: jest.fn(async () => {}),
        createUnsignedTransactionWithDefaultFee: jest.fn(async () => prepared)
      },
      network: {
        sendRequestAsTransaction(request, data, callback) {
          if (request === 'store-withdrawal-quote') {
            quotePayloads.push(data);
          }
          if (request === 'load-web3-proceeds') {
            callback({ eligible: { TRX: '15' } });
            return;
          }
          if (request === 'store-withdrawal') {
            callback({ status: 'submitted' });
            return;
          }
          callback({
            data: {
              amount: '0',
              publickey: 'treasury',
              ticker: 'TRX',
              withdrawal_amount: '15',
              timestamp: '1-1'
            },
            signature: 'sig'
          });
        }
      }
    };
    const overlay = new WithdrawalOverlay(app, { store_public_key: 'server' });
    await overlay.open('TRX');
    expect(shown).toContain('value="stored@example.com"');
    emailField = { value: 'changed@example.com' };
    await clicks['confirm-withdraw']({ preventDefault() {} });

    expect(quotePayloads[0]).toEqual({
      module: 'Store',
      ticker: 'TRX',
      withdrawal_address: 'TLocalAddress'
    });
    expect(quotePayloads[0].amount).toBeUndefined();
    expect(prepared.msg.email).toBe('changed@example.com');
    expect(prepared.msg.withdrawal_amount).toBeUndefined();
    expect(prepared.msg.data.withdrawal_amount).toBe('15');
    expect(keychain.addKey).not.toHaveBeenCalled();

    await clicks['open-wallet']({ preventDefault() {} });
    expect(app.wallet.setPreferredCrypto).toHaveBeenCalledWith('TRX');
    expect(app.connection.emit).toHaveBeenCalledWith('saito-crypto-wallet-history-render-request', {
      ticker: 'TRX'
    });
  });

  test('a withdrawal without an email still submits', async () => {
    const crypto = { address: 'TLocalAddress', isActivated: () => true };
    const prepared = {
      to: [{ publicKey: 'treasury', amount: 0n }],
      sign: jest.fn(async () => {}),
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
            callback({ eligible: { TRX: '1' } });
            return;
          }
          if (request === 'store-withdrawal') {
            callback({ status: 'submitted' });
            return;
          }
          callback({
            data: { amount: '0', publickey: 'treasury', ticker: 'TRX', withdrawal_amount: '1', timestamp: '1-1' },
            signature: 'sig'
          });
        }
      }
    };
    const overlay = new WithdrawalOverlay(app, { store_public_key: 'server' });
    await overlay.open('TRX');
    expect(shown).toContain('name="email" value=""');
    await clicks['confirm-withdraw']({ preventDefault() {} });
    expect(prepared.msg.email).toBeUndefined();
    expect(shown).toContain('Your withdrawal request is now queued for withdrawal.');
  });
});
