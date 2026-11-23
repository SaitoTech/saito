function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

module.exports = ({
  waiting = false,
  loading = false,
  saving = false,
  error = '',
  compilation_enabled = false
} = {}) => {
  let body = '';

  if (waiting) {
    body =
      '<p class="admin-payments-empty">Waiting for the server to finish authenticating this administrator.</p>';
  } else if (loading) {
    body = '<p class="admin-payments-empty">Loading DevTools settings…</p>';
  } else if (error) {
    body = '';
  } else if (compilation_enabled === true) {
    const disabled = saving ? 'disabled' : '';
    body = `
      <p class="admin-payments-note">Server-side compilation is enabled. Visitors can compile applications on the DevTools page.</p>
      <button type="button" class="admin-button" id="admin-devtools-disable" ${disabled}>Disable Compilation</button>
    `;
  } else {
    const disabled = saving ? 'disabled' : '';
    body = `
      <p class="admin-payments-note">Server-side compilation is disabled. The DevTools page will not accept module uploads until you enable it.</p>
      <button type="button" class="admin-button" id="admin-devtools-enable" ${disabled}>Enable Compilation</button>
    `;
  }

  return `
    <div class="devtools-admin">
      <h1>DevTools</h1>
      ${error ? `<div class="admin-payments-error">${escapeHtml(error)}</div>` : ''}
      ${body}
    </div>
  `;
};
