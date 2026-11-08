const Store = require('../../../mods/store/store');

function app() {
  const application = {
    options: {},
    crypto: {
      isPublicKey: (key) => String(key || '').startsWith('key-')
    },
    storage: {
      saveOptions() {
        application.saved.push(JSON.parse(JSON.stringify(application.options)));
      }
    },
    modules: {
      returnModule(name) {
        if (name === 'Mixin') {
          return application.mixin || null;
        }
        return null;
      }
    },
    mixin: null,
    saved: []
  };
  return application;
}

describe('Store web3 payment configuration', () => {
  test('payments are disabled until the discovered issuance key is confirmed', async () => {
    const application = app();
    const store = new Store(application);
    store.loadWeb3PaymentOptions();

    expect(store.web3PaymentsEnabled()).toBe(false);
    expect(store.returnWeb3TreasuryPublicKey()).toBe('');
    expect(store.respondTo('admin-config')).toBeTruthy();

    application.mixin = {
      returnSaitoIssuancePublicKey: () => 'not-a-key'
    };
    await expect(
      store.respondTo('admin-config').updateConfig({
        action: 'authorize',
        treasury_publickey: 'not-a-key'
      })
    ).rejects.toThrow(/not the Mixin issuance key/);
    expect(store.web3PaymentsEnabled()).toBe(false);

    application.mixin = {
      returnSaitoIssuancePublicKey: () => 'key-treasury'
    };
    const enabled = await store.respondTo('admin-config').updateConfig({
      action: 'authorize',
      treasury_publickey: 'key-treasury'
    });
    expect(enabled.enabled).toBe(true);
    expect(enabled.treasury_publickey).toBe('key-treasury');
    expect(application.options.store.web3).toEqual({
      enabled: true,
      treasury_publickey: 'key-treasury'
    });
    expect(application.saved.length).toBeGreaterThan(0);

    const disabled = await store.respondTo('admin-config').updateConfig({ action: 'disable' });
    expect(disabled.enabled).toBe(false);
    expect(store.web3PaymentsEnabled()).toBe(false);
    expect(store.returnWeb3TreasuryPublicKey()).toBe('key-treasury');
    expect(application.options.store.web3.treasury_publickey).toBe('key-treasury');
  });
});
