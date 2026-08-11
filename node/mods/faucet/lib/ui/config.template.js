/**
 * Faucet administration page. Plain HTML; does not load Saito.
 * Never embed client secrets or the Faucet private key.
 */
function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function asJson(value) {
  return escapeHtml(
    JSON.stringify(
      value,
      (_key, v) => (typeof v === 'bigint' ? v.toString() : v),
      2
    )
  );
}

module.exports = ({
  publickey = '',
  slips = [],
  queue = [],
  githubConfigured = false,
  twitterConfigured = false,
  saved = false
} = {}) => {
  let balance_nolan = 0n;
  for (const slip of slips) {
    try {
      balance_nolan += BigInt(slip.amount || 0);
    } catch (err) {
      // ignore malformed slip amounts
    }
  }

  const queue_view = (queue || []).map((job) => ({
    publickey: job.publickey,
    amount: job.amount != null ? String(job.amount) : ''
  }));

  const statusBlock = saved
    ? `<pre class="ok">GitHub: ${githubConfigured ? 'configured' : 'not set'}\nX: ${twitterConfigured ? 'configured' : 'not set'}</pre>`
    : `<pre>GitHub: ${githubConfigured ? 'configured' : 'not set'}\nX: ${twitterConfigured ? 'configured' : 'not set'}</pre>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Faucet Config</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 48rem; margin: 2rem auto; padding: 0 1rem; background: #111; color: #eee; }
    label { display: block; margin-top: 1.2rem; font-size: 0.95rem; }
    input[type="password"], input[type="text"] { width: 100%; box-sizing: border-box; margin-top: 0.4rem; padding: 0.6rem; }
    button { margin-top: 1.6rem; padding: 0.7rem 1.2rem; cursor: pointer; }
    .ok { color: #3df71f; }
    .note { opacity: 0.75; font-size: 0.9rem; line-height: 1.4; }
    pre { background: #1a1a1a; padding: 0.8rem 1rem; border-radius: 0.4rem; overflow: auto; }
    h2 { margin-top: 2.4rem; font-size: 1.1rem; }
  </style>
</head>
<body>
  <h1>Faucet Config</h1>
  <p class="note">Administrative diagnostics. Refresh after deposits confirm. Secrets stay in server memory only.</p>

  <h2>Faucet Public Key</h2>
  <pre>${escapeHtml(publickey)}</pre>

  <h2>Faucet Balance</h2>
  <pre>${escapeHtml((balance_nolan / 100000000n).toString())} SAITO (${escapeHtml(balance_nolan.toString())} nolan)</pre>

  <h2>Payment Queue</h2>
  <pre>${asJson(queue_view)}</pre>

  <h2>Faucet Slips</h2>
  <pre>${asJson(slips)}</pre>

  <h2>OAuth secrets</h2>
  <p class="note">Leave a secret blank to leave that provider unchanged.</p>
  ${statusBlock}
  <form method="POST" action="" autocomplete="off">
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
