function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function sourceLabel(source) {
  if (source === 'environment') {
    return 'server environment';
  }
  if (source === 'wallet') {
    return 'server wallet';
  }
  return 'unavailable';
}

module.exports = ({
  configured = false,
  active = false,
  source = '',
  config = null,
  error = '',
  loading = false,
  saving = false,
  configText = ''
} = {}) => {
  const disabled = saving ? 'disabled' : '';
  const body = loading
    ? '<p class="admin-payments-empty">Loading Sendgrid settings…</p>'
    : configured
      ? `<p class="admin-payments-note">${
          active
            ? 'Mail relay is active on this server.'
            : 'Sendgrid is configured. Mail relay is not yet advertised by this server.'
        }</p>
        <p class="admin-payments-note">Source: ${escapeHtml(sourceLabel(source))}</p>
        <label for="admin-sendgrid-live">Live configuration</label>
        <textarea class="admin-input admin-payments-backup" id="admin-sendgrid-live" readonly rows="8">${escapeHtml(
          JSON.stringify(config || {}, null, 2)
        )}</textarea>`
      : `<div class="admin-payments-setup">
          <p class="admin-payments-note">Configure Sendgrid: </p>
          <textarea class="admin-input admin-payments-backup" id="admin-sendgrid-config" rows="8" ${disabled}>${escapeHtml(
            configText || ''
          )}</textarea>
          <button type="button" class="admin-button" id="admin-sendgrid-submit" ${disabled}>Submit</button>
        </div>`;

  return `
    <div>
      <h1>Sendgrid</h1>
      ${error ? `<div class="admin-payments-error">${escapeHtml(error)}</div>` : ''}
      ${body}
    </div>
  `;
};
