const StoreAdminTemplate = require('../../../mods/store/lib/admin/store-admin.template');

describe('Store admin web3 payments', () => {
  test('payments are shown off until an issuance identity is authorized', () => {
    const html = StoreAdminTemplate();
    expect(html).toContain('<h1>Store</h1>');
    expect(html).toContain('Enable Web3 Payments');
    expect(html).toContain('No issuance identity is authorized.');
    expect(html).not.toContain('data-action="authorize-web3"');
  });

  test('turning payments on asks the administrator to confirm the discovered key', () => {
    const html = StoreAdminTemplate({
      confirming: true,
      discovered_publickey: 'treasury-key'
    });
    expect(html).toContain('authorize this identity');
    expect(html).toContain('treasury-key');
    expect(html).toContain('data-action="authorize-web3"');
  });
});
