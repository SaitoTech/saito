jest.mock('../../../lib/saito/saito', () => ({}));
jest.mock('../../../lib/templates/modtemplate', () => {
  return class ModTemplate {
    constructor(app) {
      this.app = app;
      this.publicKey = '';
    }
    async handlePeerTransaction() {
      return 0;
    }
  };
});

const MainTemplate = require('../../../mods/admin/lib/ui/main.template');
const PaymentsTemplate = require('../../../mods/admin/lib/ui/payments.template');
const AdminPaymentsUI = require('../../../mods/admin/lib/ui/payments');
const Admin = require('../../../mods/admin/admin');

function adminApp() {
  return {
    BROWSER: 0,
    options: { admin: ['admin-key'] },
    modules: {
      getRespondTos(type) {
        if (type !== 'admin-config') {
          return [];
        }
        return this.returnModulesRespondingTo(type).map((mod) => mod.respondTo(type));
      },
      returnModulesRespondingTo() {
        return [];
      }
    }
  };
}

describe('Admin payments tab', () => {
  test('the payments nav is present only when mixin exposes admin-config', () => {
    const absent = MainTemplate(adminApp(), {});
    expect(absent).not.toContain('data-admin-view="payments"');

    const app = adminApp();
    app.modules.returnModulesRespondingTo = () => [
      {
        respondTo: () => ({ id: 'mixin', name: 'Mixin' })
      }
    ];
    const present = MainTemplate(app, {});
    expect(present).toContain('data-admin-view="payments">Payments');
    expect(present).toContain('admin-page admin-payments');
  });

  test('a confirmed manual migration can be issued and an unverified one exposes its deposit', () => {
    const html = PaymentsTemplate({
      transfers: [
        {
          id: 3,
          purpose: 'migration',
          mode: 'manual',
          requester_publickey: 'user',
          recipient_publickey: 'user',
          inbound_amount: '4',
          inbound_ticker: 'ERC-SAITO',
          inbound_tx_hash: 'erc-hash',
          inbound_sender: '0xabc',
          outbound_amount: '4',
          outbound_ticker: 'SAITO',
          outbound_tx_sig: '',
          status: 'inbound_confirmed',
          last_error: '',
          action: null
        },
        {
          id: 4,
          purpose: 'migration',
          mode: 'manual',
          requester_publickey: 'user',
          recipient_publickey: 'user',
          inbound_amount: '',
          inbound_ticker: '',
          outbound_amount: '',
          status: 'inbound_awaiting',
          last_error: '',
          action: { action: 'detect-inbound', label: 'Mark inbound payment detected' }
        }
      ],
      account: { user_id: 'server-user', backup: '{}' }
    });

    expect(html).toContain('data-payment-action="approve-migration"');
    expect(html).toContain('Issue SAITO');
    expect(html).toContain('erc-hash');
    expect(html).toContain('0xabc');
    expect(html).toContain('data-payment-action="verify-migration"');
    expect(html).toContain('data-migration-amount="4"');
    expect(html).not.toContain('data-payment-action="detect-inbound"');
  });

  test('the table offers the legal next action and escapes transfer fields', () => {
    const html = PaymentsTemplate({
      transfers: [
        {
          id: 7,
          requester_publickey: '<buyer>',
          recipient_publickey: 'recipient',
          inbound_amount: '0.5',
          inbound_ticker: 'ETH',
          outbound_amount: '10',
          outbound_ticker: 'SAITO',
          status: 'inbound_awaiting',
          last_error: '',
          action: { action: 'detect-inbound', label: 'Mark inbound payment detected' }
        },
        {
          id: 8,
          requester_publickey: 'buyer',
          recipient_publickey: 'recipient',
          inbound_amount: '1',
          inbound_ticker: 'ETH',
          outbound_amount: '20',
          outbound_ticker: 'SAITO',
          status: 'inbound_confirmed',
          last_error: 'insufficient_funds',
          action: null
        }
      ]
    });

    expect(html).toContain('Mark inbound payment detected');
    expect(html).toContain('data-payment-action="detect-inbound"');
    expect(html).toContain('&lt;buyer&gt;');
    expect(html).toContain('Waiting for SAITO issuance');
    expect(html).toContain('insufficient_funds');
    expect(html).not.toContain('<buyer>');
    expect(html).not.toContain('create account');
  });

  test('a missing mixin account is the first payments view', () => {
    const html = PaymentsTemplate({ account: null, transfers: [{ id: 1 }] });
    expect(html).toContain(
      'In order to setup web3 payment processing with Saito, you must create a Mixin Account for your server.'
    );
    expect(html).toContain('id="admin-payments-create-account"');
    expect(html).toContain('create account');
    expect(html).toContain('id="admin-payments-restore-account"');
    expect(html).toContain('restore account');
    expect(html).not.toContain('admin-payments-table');
    expect(html).not.toContain('Outstanding BuySaito transfers');
  });

  test('a configured mixin account is noted by its id', () => {
    const html = PaymentsTemplate({
      account: {
        user_id: 'user-9',
        full_name: 'Saito User <server>',
        backup: '{"user_id":"user-9","spend_private_key":"secret"}'
      },
      transfers: []
    });
    expect(html).toContain('Mixin account user-9 (Saito User &lt;server&gt;) is configured on this server.');
    expect(html).toContain('id="admin-payments-account-backup"');
    expect(html).toContain('{&quot;user_id&quot;:&quot;user-9&quot;,&quot;spend_private_key&quot;:&quot;secret&quot;}');
    expect(html).toContain('No outstanding BuySaito transfers.');
    expect(html).not.toContain('id="admin-payments-create-account"');
  });

  test('the page loads and advances through the admin-config requests', async () => {
    const messages = [];
    const app = {
      browser: { replaceElementContentBySelector() {} },
      wallet: {
        createUnsignedTransactionWithDefaultFee: async () => ({
          msg: null,
          sign: async function sign() {}
        })
      },
      network: {
        sendTransactionWithCallback(tx, callback) {
          messages.push(tx.msg);
          callback({
            returnMessage: () => ({
              result: {
                account: { user_id: 'user-9', full_name: 'Saito User' },
                transfers: [
                  {
                    id: 7,
                    status: 'inbound_broadcast',
                    action: { action: 'confirm-inbound', label: 'Mark inbound payment confirmed' }
                  }
                ]
              }
            })
          });
        }
      }
    };
    const mod = { server_publickey: 'server', server_info: {} };
    global.document = {
      getElementById() {
        return null;
      },
      querySelectorAll() {
        return [];
      }
    };

    const page = new AdminPaymentsUI(app, mod);
    await page.load();
    expect(messages[0]).toEqual({
      module: 'Admin',
      request: 'get-admin-config',
      module_id: 'mixin'
    });

    await page.advance(7, 'confirm-inbound');
    expect(messages[1]).toEqual({
      module: 'Admin',
      request: 'update-admin-config',
      module_id: 'mixin',
      data: { id: 7, action: 'confirm-inbound' }
    });
    expect(page.transfers[0].status).toBe('inbound_broadcast');
    expect(page.account).toEqual({ user_id: 'user-9', full_name: 'Saito User' });

    page.account = null;
    await page.createAccount();
    expect(messages[2]).toEqual({
      module: 'Admin',
      request: 'update-admin-config',
      module_id: 'mixin',
      data: { action: 'create-account' }
    });
    expect(page.account.user_id).toBe('user-9');

    page.account = null;
    global.document.getElementById = (id) =>
      id === 'admin-payments-restore-account' ? { value: '{"user_id":"user-9"}' } : null;
    await page.restoreAccount();
    expect(messages[3]).toEqual({
      module: 'Admin',
      request: 'update-admin-config',
      module_id: 'mixin',
      data: { action: 'restore-account', account: '{"user_id":"user-9"}' }
    });
    expect(page.account.user_id).toBe('user-9');
    delete global.document;
  });

  test('update-admin-config stays behind admin authorization', async () => {
    const calls = [];
    const app = adminApp();
    app.modules.returnModulesRespondingTo = () => [
      {
        respondTo() {
          return {
            id: 'mixin',
            getConfig: async () => ({ transfers: [] }),
            updateConfig: async (data) => {
              calls.push(data);
              return { transfers: [] };
            }
          };
        }
      }
    ];
    const admin = new Admin(app);
    admin.publicKey = 'server';
    admin.app = app;

    const tx = {
      signature: 'short',
      isTo: (key) => key === 'server',
      returnMessage: () => ({
        request: 'update-admin-config',
        module_id: 'mixin',
        data: { id: 7, action: 'detect-inbound' }
      })
    };

    const denied = [];
    await admin.handlePeerTransaction(app, tx, {}, (res) => denied.push(res));
    expect(denied).toEqual([{ err: 'Unauthorized access' }]);
    expect(calls).toEqual([]);

    admin.adminRequestSigner = () => 'admin-key';
    const allowed = [];
    await admin.handlePeerTransaction(app, tx, {}, (res) => allowed.push(res));
    expect(calls).toEqual([{ id: 7, action: 'detect-inbound' }]);
    expect(allowed[0].result).toEqual({ transfers: [] });
  });
});
