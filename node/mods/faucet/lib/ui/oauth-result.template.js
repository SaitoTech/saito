/**
 * Minimal OAuth popup result page (no Saito). Attempts window.close().
 * Never embed secrets or access tokens.
 */
function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

module.exports = ({
  ok = false,
  title = '',
  message = '',
  details = ''
} = {}) => {
  const safeTitle = escapeHtml(title);
  const safeMessage = escapeHtml(message);
  const safeDetails = details ? `<pre>${escapeHtml(details)}</pre>` : '';
  const tone = ok ? 'ok' : 'err';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="noindex" />
  <title>${safeTitle}</title>
  <style>
    body { margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center;
      font-family: system-ui, sans-serif; background: #12121a; color: #f2f2f5; padding: 1.5rem; }
    main { max-width: 28rem; width: 100%; border: 1px solid #3a3a48; border-radius: 0.8rem; padding: 1.5rem; background: #1c1c23; }
    h1 { margin: 0 0 0.75rem; font-size: 1.35rem; }
    p { margin: 0 0 0.75rem; line-height: 1.45; color: #c8c8d4; }
    pre { white-space: pre-wrap; word-break: break-word; background: #0e0e14; padding: 0.75rem; border-radius: 0.4rem; font-size: 0.85rem; }
    .ok h1 { color: #3df71f; }
    .err h1 { color: #f54900; }
    .hint { font-size: 0.85rem; opacity: 0.75; }
  </style>
</head>
<body>
  <main class="${tone}">
    <h1>${safeTitle}</h1>
    <p>${safeMessage}</p>
    ${safeDetails}
    <p class="hint">You can close this window and return to Saito.</p>
  </main>
  <script>
    try { window.close(); } catch (e) {}
    setTimeout(function () { try { window.close(); } catch (e) {} }, 400);
  </script>
</body>
</html>`;
};
