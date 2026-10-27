const template = require('../../../mods/store/lib/ui/overlays/web3-payment.template');

const app = {
  browser: {
    escapeHTML: (value) =>
      String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
  }
};

describe('store web3 payment template', () => {
  test('reserves the deposit area with a loader while the address is requested', () => {
    const html = template(app, {
      awaitingAddress: true,
      amountLabel: '1.25 ETH',
      productLabel: 'Purchase item',
      statusLead: 'Requesting a payment address...'
    });

    expect(html).toContain('deposit-pending');
    expect(html).toContain('deposit-loader');
    expect(html).toContain('saito-spinner');
    expect(html).toContain('aria-busy="true"');
    expect(html).not.toContain('id="store-web3-qrcode"');
  });

  test('shows the qr code and address once the deposit address arrives', () => {
    const html = template(app, {
      destination: '0xabc',
      amountLabel: '1.25 ETH',
      productLabel: 'Purchase item'
    });

    expect(html).toContain('id="store-web3-qrcode"');
    expect(html).toContain('0xabc');
    expect(html).not.toContain('deposit-pending');
  });
});
