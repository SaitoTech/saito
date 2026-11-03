const { webcrypto } = require('crypto');

if (!globalThis.crypto || typeof globalThis.crypto.getRandomValues !== 'function') {
  globalThis.crypto = webcrypto;
}

const {
  SANDBOX_CSP,
  buildSandboxCsp,
  createBootstrapNonce,
  escapeInlineScript
} = require('../../../lib/helpers/sandbox');

describe('sandbox CSP helpers', () => {
  test('buildSandboxCsp authorizes only a nonce plus blob workers/scripts', () => {
    const csp = buildSandboxCsp('abc123');
    expect(csp).toContain("script-src 'nonce-abc123' 'unsafe-eval' blob:");
    expect(csp).toContain('worker-src blob:');
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("connect-src 'none'");
    expect(csp).not.toMatch(/unsafe-inline/);
    expect(csp).not.toMatch(/allow-same-origin/);
  });

  test('SANDBOX_CSP export remains a restrictive policy string', () => {
    expect(SANDBOX_CSP).toContain("default-src 'none'");
    expect(SANDBOX_CSP).toContain('blob:');
    expect(SANDBOX_CSP).toContain("'unsafe-eval'");
    expect(SANDBOX_CSP).not.toMatch(/unsafe-inline/);
  });

  test('createBootstrapNonce returns a hex token', () => {
    const nonce = createBootstrapNonce();
    expect(nonce).toMatch(/^[0-9a-f]{32}$/);
    expect(createBootstrapNonce()).not.toBe(nonce);
  });

  test('escapeInlineScript neutralizes script closer sequences', () => {
    expect(escapeInlineScript('a</script>b')).toBe('a<\\/script>b');
    expect(escapeInlineScript('a</SCRIPT>b')).toBe('a<\\/SCRIPT>b');
  });
});
