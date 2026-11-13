const StoreAdminTemplate = require('../../../mods/store/lib/admin/store-admin.template');

describe('Store admin web3 payments', () => {
  test('the closed page is only the enable checkbox', () => {
    const html = StoreAdminTemplate();
    expect(html).toContain('<h1>Store</h1>');
    expect(html).toContain('Enable Web3 Payments');
    expect(html).toContain('admin-store-toggle');
    expect(html).not.toContain('Web3 Payments</h2>');
    expect(html).not.toContain('No issuance identity');
    expect(html).not.toContain('data-action="confirm-web3"');
    expect(html).not.toContain('data-action="web3-key"');
  });

  test('a checked box shows the discovered key and asks for confirmation', () => {
    const html = StoreAdminTemplate({
      expanded: true,
      draft_publickey: 'treasury-key'
    });
    expect(html).toContain('collecting inbound Web3 payments');
    expect(html).toContain('value="treasury-key"');
    expect(html).toContain('>Confirm<');
    expect(html).toContain('will not be enabled until you confirm');
    expect(html).not.toContain('data-action="authorize-web3"');
    expect(html).not.toContain('data-action="cancel-web3"');
  });

  test('a saved identity uses Update and does not treat an edited key as authorized', () => {
    const saved = StoreAdminTemplate({
      expanded: true,
      enabled: true,
      treasury_publickey: 'key-treasury',
      draft_publickey: 'key-treasury'
    });
    expect(saved).toContain('>Update<');
    expect(saved).not.toContain('will not be enabled until you confirm');

    const edited = StoreAdminTemplate({
      expanded: true,
      enabled: true,
      treasury_publickey: 'key-treasury',
      draft_publickey: 'key-other'
    });
    expect(edited).toContain('not authorized until you update it');
    expect(edited).toContain('value="key-other"');
  });
});