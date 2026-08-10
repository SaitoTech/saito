/**
 * TEMP OAUTH CONFIG — remove with /faucet/oauth/config when production env secrets exist.
 * Plain HTML; does not load Saito. Never embed client secrets in this page.
 */
module.exports = ({ githubConfigured = false, twitterConfigured = false, saved = false, error = '' } = {}) => {
  const statusBlock = error
    ? `<p class="err">${escapeHtml(error)}</p>`
    : saved
      ? `<pre class="ok">GitHub: ${githubConfigured ? 'configured' : 'not set'}\nX: ${twitterConfigured ? 'configured' : 'not set'}</pre>`
      : `<pre>GitHub: ${githubConfigured ? 'configured' : 'not set'}\nX: ${twitterConfigured ? 'configured' : 'not set'}</pre>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Faucet OAuth Config (temporary)</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 36rem; margin: 2rem auto; padding: 0 1rem; background: #111; color: #eee; }
    label { display: block; margin-top: 1.2rem; font-size: 0.95rem; }
    input[type="password"], input[type="text"] { width: 100%; box-sizing: border-box; margin-top: 0.4rem; padding: 0.6rem; }
    button { margin-top: 1.6rem; padding: 0.7rem 1.2rem; cursor: pointer; }
    .ok { color: #3df71f; }
    .err { color: #f66; }
    .note { opacity: 0.75; font-size: 0.9rem; line-height: 1.4; }
    pre { background: #1a1a1a; padding: 0.8rem 1rem; border-radius: 0.4rem; }
  </style>
</head>
<body>
  <h1>Faucet OAuth secrets</h1>
  <p class="note">Temporary test endpoint. Secrets stay in server memory only. Leave a secret blank to leave that provider unchanged.</p>
  ${statusBlock}
  <form method="POST" action="" autocomplete="off">
    <label>Config key
      <input type="password" name="config_key" required autocomplete="off" />
    </label>
    <label>GitHub Client Secret
      <input type="password" name="github_secret" autocomplete="off" />
    </label>
    <label>X Client Secret
      <input type="password" name="twitter_secret" autocomplete="off" />
    </label>
    <button type="submit">Save</button>
  </form>
</body>
</html>`;
};

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
