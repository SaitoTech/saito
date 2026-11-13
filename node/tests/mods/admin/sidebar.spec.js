const MainTemplate = require('../../../mods/admin/lib/ui/main.template');

function appWith(responses = {}) {
  return {
    modules: {
      getRespondTos(type) {
        return responses[type] || [];
      }
    }
  };
}

describe('Admin sidebar panels', () => {
  test('a module sidebar appears only when it responds to admin-sidebar', () => {
    const absent = MainTemplate(
      appWith({
        'admin-config': [{ id: 'faucet', name: 'Faucet' }]
      }),
      {}
    );
    expect(absent).not.toContain('data-admin-view="faucet"');
    expect(absent).not.toContain('admin-page admin-faucet');

    const present = MainTemplate(
      appWith({
        'admin-sidebar': [
          {
            id: 'faucet',
            name: 'Faucet',
            render() {}
          }
        ]
      }),
      {}
    );
    expect(present).toContain('data-admin-view="faucet">Faucet');
    expect(present).toContain('admin-page admin-faucet');
  });

  test('a sidebar response without a render function is ignored', () => {
    const html = MainTemplate(
      appWith({
        'admin-sidebar': [{ id: 'faucet', name: 'Faucet' }]
      }),
      {}
    );
    expect(html).not.toContain('data-admin-view="faucet"');
  });
});
