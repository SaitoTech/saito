module.exports = (view = {}) => {
  const escape = (value) =>
    String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  const expanded = view.expanded === true;
  const enabled = view.enabled === true;
  const draft = String(view.draft_publickey || '');
  const authorized = String(view.treasury_publickey || '').trim();
  const pending = !enabled || draft.trim() !== authorized;
  const status = !expanded
    ? ''
    : enabled && !pending
      ? ''
      : enabled
        ? 'The replacement key is not authorized until you update it.'
        : 'Web3 payments will not be enabled until you confirm the server authorized to make purchases.';

  return `
    <div class="admin-store">
      <h1>Store</h1>
      ${view.error ? `<p class="admin-store-error">${escape(view.error)}</p>` : ''}
      <label class="admin-store-toggle">
        <input type="checkbox" data-action="toggle-web3" ${expanded ? 'checked' : ''} ${view.loading ? 'disabled' : ''} />
        <span>Enable Web3 Payments</span>
      </label>
      ${
        expanded
          ? `<p class="admin-store-copy">Please confirm the public key of the server responsible for collecting inbound Web3 payments for your Store. Your Store will only sell Web3-listed assets when payment is received through this authorized server. In a default installation, this should be the Mixin treasury node that provides the corresponding Saito payouts.</p>
            <div class="admin-store-key">
              <input class="admin-input" type="text" data-action="web3-key" spellcheck="false" autocomplete="off" value="${escape(draft)}" ${view.loading ? 'disabled' : ''} />
              <button type="button" class="admin-button" data-action="confirm-web3" ${view.loading ? 'disabled' : ''}>${enabled ? 'Update' : 'Confirm'}</button>
            </div>
            ${status ? `<p class="admin-store-status" data-web3-status>${escape(status)}</p>` : '<p class="admin-store-status" data-web3-status></p>'}`
          : ''
      }
    </div>
  `;
};
