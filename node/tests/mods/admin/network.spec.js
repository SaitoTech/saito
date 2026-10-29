const PeersTemplate = require('../../../mods/admin/lib/ui/peers.template');
const AdminPeersUI = require('../../../mods/admin/lib/ui/peers');

describe('Admin network server address', () => {
  test('shows the current address and leaves update inactive', () => {
    const html = PeersTemplate({
      url: 'https://saito.tech:443',
      host: 'saito.tech',
      port: '443',
      live: [],
      offline: []
    });

    expect(html).toContain('Your Server');
    expect(html).toContain('value="https://saito.tech:443"');
    expect(html).toContain('value="saito.tech"');
    expect(html).toContain('value="443"');
    expect(html).toContain('id="admin-server-update" disabled');
    expect(html).not.toContain('This server');
  });

  test('lists saved peers before other peers and offers SAVED or N/A', () => {
    const html = PeersTemplate({
      peers: [
        { key: 'saved.example|443', host: 'saved.example', port: 443, publicKey: 'abc', verified: true, saved: true },
        { key: 'live.example|443', host: 'live.example', port: 443, publicKey: '', verified: false, saved: false }
      ]
    });

    expect(html.indexOf('saved.example')).toBeLessThan(html.indexOf('live.example'));
    expect(html).toContain('>SAVED<');
    expect(html).toContain('>N/A<');
    expect(html).toContain('>Yes<');
    expect(html).toContain('>No<');
    expect(html).toContain('id="admin-peer-add"');
  });

  test('saved options peers stay ahead of peers that are only connected', () => {
    const page = new AdminPeersUI({}, {});
    page.configured = [{ host: 'saved.example', port: 443, protocol: 'https', synctype: 'full' }];
    page.live = [
      { host: 'live.example', port: 443, publicKey: '', protocol: 'https' },
      { host: 'saved.example', port: 443, publicKey: 'abc', protocol: 'https' }
    ];

    const rows = page.peerRows();
    expect(rows.map((row) => row.host)).toEqual(['saved.example', 'live.example']);
    expect(rows[0]).toMatchObject({ saved: true, verified: true, publicKey: 'abc' });
    expect(rows[1]).toMatchObject({ saved: false, verified: false });
  });
});
