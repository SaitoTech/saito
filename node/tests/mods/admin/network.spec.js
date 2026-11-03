/** @jest-environment jsdom */

const PeersTemplate = require('../../../mods/admin/lib/ui/peers.template');
const AdminPeersUI = require('../../../mods/admin/lib/ui/peers');

describe('Admin network server address', () => {
  test('shows read-only local config above the editable public endpoint', () => {
    const page = new AdminPeersUI({ browser: {
      replaceElementContentBySelector: (html) => { document.body.innerHTML = html; }
    } }, { server_info: { options: { server: {
      host: '0.0.0.0', port: 12101, protocol: 'http',
      endpoint: { host: 'public.example', port: 443, protocol: 'https' }
    } } } });
    page.refresh();

    const local = document.querySelector('.admin-peers-local-address');
    expect([...local.querySelectorAll('dd')].map((el) => el.textContent)).toEqual(['0.0.0.0', '12101']);
    expect(local.querySelector('input, select, textarea, [contenteditable]')).toBeNull();
    expect(local.nextElementSibling.className).toBe('admin-peers-server');
    expect(document.getElementById('admin-server-host').value).toBe('public.example');
    expect(document.getElementById('admin-server-port').value).toBe('443');
    expect(document.getElementById('admin-server-protocol').value).toBe('https');
  });

  test('missing local values never fall back to the public endpoint', () => {
    document.body.innerHTML = PeersTemplate({ host: 'public.example', port: 443 });
    expect([...document.querySelectorAll('.admin-peers-local-address dd')].map((el) => el.textContent)).toEqual(['—', '—']);
    document.body.innerHTML = PeersTemplate({ local_host: '<img src=x onerror=alert(1)>', local_port: 0 });
    expect(document.querySelector('.admin-peers-local-address img')).toBeNull();
    expect(document.querySelector('.admin-peers-local-address dd').textContent).toBe('<img src=x onerror=alert(1)>');
  });

  test('saving the public endpoint preserves the local bind settings', async () => {
    const server = {
      host: '127.0.0.1', port: 12101, protocol: 'http',
      endpoint: { host: 'old.example', port: 443, protocol: 'https', extra: 'keep' }
    };
    const tx = { sign: jest.fn() };
    const app = {
      browser: { replaceElementContentBySelector: (html) => { document.body.innerHTML = html; } },
      wallet: { createUnsignedTransactionWithDefaultFee: jest.fn(async () => tx) },
      network: { sendTransactionWithCallback: jest.fn(async (tx, callback) => callback({ result: 1 })) }
    };
    const mod = { server_info: { options: { server } }, server_publickey: 'server-key' };
    const page = new AdminPeersUI(app, mod);
    page.refresh();
    document.getElementById('admin-server-host').value = 'new.example';
    document.getElementById('admin-server-port').value = '8443';
    await page.updateServerAddress();
    expect(tx.msg.data.server).toEqual({
      ...server,
      endpoint: { host: 'new.example', port: 8443, protocol: 'https', extra: 'keep' }
    });
    expect(mod.server_info.options.server).toEqual(tx.msg.data.server);
    expect([...document.querySelectorAll('.admin-peers-local-address dd')].map((el) => el.textContent)).toEqual(['127.0.0.1', '12101']);
  });

  test('lists saved peers before other peers and offers Saved or N/A', () => {
    const html = PeersTemplate({
      peers: [
        { key: 'saved.example|443', host: 'saved.example', port: 443, publicKey: 'abc', verified: true, saved: true },
        { key: 'live.example|443', host: 'live.example', port: 443, publicKey: '', verified: false, saved: false }
      ]
    });

    expect(html.indexOf('saved.example')).toBeLessThan(html.indexOf('live.example'));
    expect(html).toContain('>Saved<');
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
