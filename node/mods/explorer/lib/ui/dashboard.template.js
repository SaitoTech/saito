const { buildPublicKeyLink } = require('../explorer-format');

module.exports = ({ stats = {}, peerNode = {}, app = null } = {}) => {
	const transactions = stats.transactions || {};
	const fee = stats.fee || {};
	const finalized = stats.finalized || {};
	const safe = stats.safe || {};
	const esc = (value) =>
		app?.browser?.escapeHTML ? app.browser.escapeHTML(String(value ?? '')) : String(value ?? '');

	let peerNodeBody = '';

	if (peerNode.loading) {
		peerNodeBody = `
      <p class="explorer-dashboard-peer-status">Loading node information…</p>
    `;
	} else if (peerNode.error) {
		peerNodeBody = `
      <p class="explorer-dashboard-peer-status explorer-dashboard-peer-error">${esc(peerNode.error)}</p>
    `;
	} else if (peerNode.ready) {
		const publicKeyLink = app
			? buildPublicKeyLink(app, peerNode.publicKey, peerNode.publicKeyDisplay)
			: esc(peerNode.publicKeyDisplay);

		peerNodeBody = `
      <div class="explorer-dashboard-peer-grid">
        <div class="explorer-stat">
          <div class="explorer-stat-label">Public Key</div>
          <div class="explorer-stat-value explorer-dashboard-peer-key" title="${esc(peerNode.publicKey)}">
            ${publicKeyLink}
          </div>
        </div>
        <div class="explorer-stat">
          <div class="explorer-stat-label">Current Balance</div>
          <div class="explorer-stat-value">${esc(peerNode.balance || '—')}</div>
        </div>
        <div class="explorer-stat">
          <div class="explorer-stat-label">Connected Peers</div>
          <div class="explorer-stat-value">${esc(peerNode.peerCount || '—')}</div>
        </div>
        <div class="explorer-stat">
          <div class="explorer-stat-label">Endpoint</div>
          <div class="explorer-stat-value explorer-truncate" title="${esc(peerNode.endpoint || '')}">${esc(peerNode.endpointDisplay || '—')}</div>
        </div>
      </div>
    `;
	} else {
		peerNodeBody = `
      <p class="explorer-dashboard-peer-status">Waiting for Explorer peer…</p>
    `;
	}

	return `
    <section class="explorer-dashboard-component" aria-label="Network statistics">
      <div class="explorer-dashboard-grid">
        <div class="explorer-card explorer-dashboard-card explorer-dashboard-peer-card">
          <div class="explorer-stat-label">Peer Node</div>
          ${peerNodeBody}
        </div>

        <div class="explorer-card explorer-dashboard-card">
          <div class="explorer-dashboard-quad">
            <div class="explorer-stat">
              <div class="explorer-stat-label">${transactions.label || 'Transactions'}</div>
              <div class="explorer-stat-value">${transactions.value || ''}</div>
              ${transactions.sub ? `<div class="explorer-stat-sub">${transactions.sub}</div>` : ''}
            </div>
            <div class="explorer-stat">
              <div class="explorer-stat-label">${fee.label || 'Med Fee Price'}</div>
              <div class="explorer-stat-value">${fee.value || ''}</div>
              ${fee.sub ? `<div class="explorer-stat-sub">${fee.sub}</div>` : ''}
            </div>
            <div class="explorer-stat">
              <div class="explorer-stat-label">${finalized.label || 'Last Finalized Block'}</div>
              <div class="explorer-stat-value">${finalized.value || ''}</div>
            </div>
            <div class="explorer-stat">
              <div class="explorer-stat-label">${safe.label || 'Last Safe Block'}</div>
              <div class="explorer-stat-value">${safe.value || ''}</div>
            </div>
          </div>
        </div>

        <div class="explorer-card explorer-dashboard-card explorer-dashboard-chart">
          <div class="explorer-stat-label">Transaction History in 14 days</div>
          <div class="explorer-chart-placeholder" aria-hidden="true">
            <span></span><span></span><span></span><span></span><span></span><span></span><span></span>
          </div>
        </div>
      </div>
    </section>
  `;
};
