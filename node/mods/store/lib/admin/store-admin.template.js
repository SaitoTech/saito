module.exports = (view = {}) => {
  const escape = (value) =>
    String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  const enabled = view.enabled === true;
  const checked = enabled || view.confirming === true;
  const confirming = view.confirming === true;
  const discovered = String(view.discovered_publickey || '');
  const authorized = String(view.treasury_publickey || '');

  return `
    <div class="store-admin-web3">
      <h1>Store</h1>
      <h2>Web3 Payments</h2>
      <p>Web3 payments are off until you authorize the Mixin identity that issues the Saito payment.</p>
      ${view.loading ? '<p>Loading…</p>' : ''}
      ${view.error ? `<p class="store-admin-error">${escape(view.error)}</p>` : ''}
      <label>
        <input type="checkbox" data-action="toggle-web3" ${checked ? 'checked' : ''} ${view.loading ? 'disabled' : ''} />
        Enable Web3 Payments
      </label>
      ${
        authorized
          ? `<p>Authorized issuance identity: <code>${escape(authorized)}</code></p>`
          : '<p>No issuance identity is authorized.</p>'
      }
      ${
        confirming
          ? `<div class="store-admin-confirm">
              <p>Mixin has a configured treasury identity. Do you want to authorize this identity to back Web3-denominated Store sales?</p>
              <p><code>${escape(discovered)}</code></p>
              <button type="button" class="saito-button-primary" data-action="authorize-web3">Authorize</button>
              <button type="button" data-action="cancel-web3">Cancel</button>
            </div>`
          : ''
      }
    </div>
  `;
};
