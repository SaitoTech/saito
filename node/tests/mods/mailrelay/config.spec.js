const MailRelayAdminTemplate = require('../../../mods/mailrelay/lib/admin/mailrelay-admin.template');
const {
  parseSendgridConfig,
  resolveSendgridTransport,
  redactSendgridConfig
} = require('../../../mods/mailrelay/lib/config');

const transport = {
  host: 'smtp.sendgrid.net',
  port: 465,
  secure: true,
  auth: { user: 'apikey', pass: 'secret-key' }
};

describe('mailrelay sendgrid config', () => {
  test('environment configuration is used when SENDGRID is set', () => {
    const resolved = resolveSendgridTransport(JSON.stringify(transport), {
      sendgrid: { config: { ...transport, auth: { user: 'wallet', pass: 'other' } } }
    });
    expect(resolved.source).toBe('environment');
    expect(resolved.config.auth.user).toBe('apikey');
  });

  test('the server wallet is used when SENDGRID is missing', () => {
    const resolved = resolveSendgridTransport('', {
      sendgrid: { config: transport }
    });
    expect(resolved.source).toBe('wallet');
    expect(resolved.config.host).toBe('smtp.sendgrid.net');
    expect(resolved.config.auth.pass).toBe('secret-key');
  });

  test('a saved configuration omits the password from the admin view', () => {
    expect(redactSendgridConfig(transport).auth.pass).toBe('••••••••');
    expect(parseSendgridConfig(JSON.stringify(transport)).auth.pass).toBe('secret-key');
  });

  test('incomplete configuration is rejected', () => {
    expect(() => parseSendgridConfig('{"host":"smtp.sendgrid.net"}')).toThrow(/incomplete/);
    expect(() => parseSendgridConfig('not json')).toThrow(/not valid JSON/);
  });

  test('the admin tab asks for configuration until SendGrid is saved', () => {
    const setup = MailRelayAdminTemplate({ configured: false });
    expect(setup).toContain('Configure Sendgrid:');
    expect(setup).toContain('admin-sendgrid-config');

    const live = MailRelayAdminTemplate({
      configured: true,
      active: true,
      source: 'wallet',
      config: redactSendgridConfig(transport)
    });
    expect(live).toContain('Mail relay is active on this server.');
    expect(live).toContain('smtp.sendgrid.net');
    expect(live).toContain('••••••••');
    expect(live).not.toContain('secret-key');
  });
});
