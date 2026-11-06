const StoreAdminTemplate = require('../../../mods/store/lib/admin/store-admin.template');

describe('Store admin placeholder', () => {
  test('the page names the Store and stays empty of controls', () => {
    const html = StoreAdminTemplate();
    expect(html).toContain('<h1>Store</h1>');
    expect(html).toContain('Store administration will be available here.');
    expect(html).not.toContain('<form');
    expect(html).not.toContain('<button');
  });
});
