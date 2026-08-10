/**
 * Plain HTML page for the Faucet GitHub OAuth initiation route.
 * Must NOT load Saito (/saito/saito.js). This is a normal browser document.
 *
 * Production: this route will redirect to GitHub's authorize endpoint.
 * Local: credentials/callback are not configured yet — show that clearly,
 * and surface the development callback URL for manual peer-message testing.
 */
function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

module.exports = ({ publickey = '', callbackUrl = '' } = {}) => {
  const safePublicKey = escapeHtml(publickey);
  const safeCallbackUrl = escapeHtml(callbackUrl);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="noindex" />
  <title>SAITO Faucet — GitHub Authentication</title>
  <style>
    :root {
      color-scheme: dark;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 2rem;
      font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
      background: #1c1c23;
      color: #f2f2f5;
    }
    main {
      width: min(40rem, 100%);
      padding: 2rem;
      border: 1px solid #3a3a48;
      border-radius: 1rem;
      background: #12121a;
    }
    h1 {
      margin: 0 0 0.5rem;
      font-size: 1.5rem;
      font-weight: 650;
    }
    .eyebrow {
      margin: 0 0 1.25rem;
      color: #9b9bb0;
      font-size: 0.85rem;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
    p {
      margin: 0 0 1rem;
      line-height: 1.55;
      color: #d0d0dc;
    }
    section {
      margin: 1.5rem 0;
      padding-top: 1.25rem;
      border-top: 1px solid #3a3a48;
    }
    h2 {
      margin: 0 0 0.75rem;
      font-size: 0.95rem;
      font-weight: 650;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: #9b9bb0;
    }
    code, input[type="text"] {
      display: block;
      width: 100%;
      margin: 0 0 0.75rem;
      padding: 0.75rem 0.85rem;
      border: 1px solid #3a3a48;
      border-radius: 0.5rem;
      background: #0c0c12;
      color: #c7c7ff;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 0.85rem;
      line-height: 1.4;
      word-break: break-all;
    }
    input[type="text"] {
      cursor: text;
    }
    button {
      appearance: none;
      border: 1px solid #5a5a74;
      border-radius: 0.5rem;
      background: #2a2a3a;
      color: #f2f2f5;
      padding: 0.65rem 0.9rem;
      font: inherit;
      cursor: pointer;
    }
    button:hover {
      background: #35354a;
    }
    .hint {
      margin: 0;
      font-size: 0.9rem;
      color: #9b9bb0;
    }
  </style>
</head>
<body>
  <main>
    <p class="eyebrow">SAITO Faucet</p>
    <h1>GitHub Authentication</h1>
    <p>
      This page is the Faucet OAuth initiation endpoint for GitHub.
      In production it will redirect this window to GitHub&rsquo;s authorization page.
    </p>
    <p>
      Local OAuth application credentials and callback URL are not configured yet,
      so the redirect to GitHub is not active in this development environment.
    </p>
    <p>
      Planned authorize URL:
      <code>https://github.com/login/oauth/authorize</code>
    </p>

    <section>
      <h2>SAITO Public Key</h2>
      <input id="faucet-oauth-publickey" type="text" readonly value="${safePublicKey}" />
      ${
        publickey
          ? ''
          : '<p class="hint">No SAITO public key was provided to this popup.</p>'
      }
    </section>

    <section>
      <h2>OAuth Callback URL</h2>
      <input id="faucet-oauth-callback-url" type="text" readonly value="${safeCallbackUrl}" />
      <button type="button" id="faucet-oauth-copy-callback">Copy Callback URL</button>
      <p class="hint">
        Paste this URL into another browser window to hit the Faucet development
        callback and notify the connected SAITO client.
      </p>
    </section>
  </main>
  <script>
    (function () {
      var btn = document.getElementById('faucet-oauth-copy-callback');
      var input = document.getElementById('faucet-oauth-callback-url');
      if (!btn || !input) return;
      btn.addEventListener('click', function () {
        input.focus();
        input.select();
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(input.value).catch(function () {});
        } else {
          try { document.execCommand('copy'); } catch (e) {}
        }
      });
    })();
  </script>
</body>
</html>`;
};
