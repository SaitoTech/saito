const { buildPublicKeyLink } = require('../explorer-format');

module.exports = ({ peerNode = {}, blockchain = {}, modules = {}, app = null } = {}) => {
	const esc = (value) =>
		app?.browser?.escapeHTML ? app.browser.escapeHTML(String(value ?? '')) : String(value ?? '');

	//
	// Peer Node Information card
	//
	let serverInfoCard;

	if (peerNode.loading) {
		// While loading, hide the heading and center a single status message so the
		// card reads as an intentional loading state rather than stray placeholder text.
		serverInfoCard = `
      <div class="explorer-card explorer-dashboard-card explorer-dashboard-peer-card explorer-dashboard-card--loading">
        <p class="explorer-dashboard-loading">Loading peer node information…</p>
      </div>
    `;
	} else {
		let peerNodeBody;

		if (peerNode.error) {
			peerNodeBody = `
      <p class="explorer-dashboard-peer-status explorer-dashboard-peer-error">${esc(peerNode.error)}</p>
    `;
		} else if (peerNode.ready) {
			const publicKeyLink = app
				? buildPublicKeyLink(app, peerNode.publicKey, peerNode.publicKey)
				: esc(peerNode.publicKeyDisplay);

			peerNodeBody = `
      <div class="explorer-dashboard-peer-grid">
        <div class="explorer-stat">
          <div class="explorer-stat-label">Public Key</div>
          <div class="explorer-stat-value explorer-dashboard-peer-key explorer-truncate" title="${esc(peerNode.publicKey)}">
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

		serverInfoCard = `
      <div class="explorer-card explorer-dashboard-card explorer-dashboard-peer-card">
        <div class="explorer-stat-label">Peer Node Information</div>
        ${peerNodeBody}
      </div>
    `;
	}

	//
	// Blockchain Information card
	//
	let blockchainBody;

	if (blockchain.loading) {
		blockchainBody = `<p class="explorer-dashboard-status">Loading blockchain information…</p>`;
	} else if (blockchain.error) {
		blockchainBody = `<p class="explorer-dashboard-status explorer-dashboard-status--error">${esc(blockchain.error)}</p>`;
	} else if (blockchain.ready && Array.isArray(blockchain.rows) && blockchain.rows.length) {
		const statRows = blockchain.rows
			.map(
				(row) => `
            <div class="explorer-stat">
              <div class="explorer-stat-label">${esc(row.label)}</div>
              <div class="explorer-stat-value">${esc(row.value)}</div>
            </div>
          `
			)
			.join('');
		blockchainBody = `<div class="explorer-dashboard-quad">${statRows}</div>`;
	} else {
		blockchainBody = `<p class="explorer-dashboard-status">Blockchain information unavailable.</p>`;
	}

	//
	// Most Popular Modules card
	//
	let modulesBody;

	if (modules.loading) {
		modulesBody = `<p class="explorer-dashboard-status">Loading module activity…</p>`;
	} else if (modules.error) {
		modulesBody = `<p class="explorer-dashboard-status explorer-dashboard-status--error">${esc(modules.error)}</p>`;
	} else if (modules.ready && Array.isArray(modules.rows) && modules.rows.length) {
		const moduleItems = modules.rows
			.map((row) => {
				const name = row.wikiUrl
					? `<a href="${esc(row.wikiUrl)}" class="explorer-link" target="_blank" rel="noopener noreferrer">${esc(row.name)}</a>`
					: esc(row.name);
				return `
            <li class="explorer-module-item">
              <span class="explorer-module-name">${name}</span>
              <span class="explorer-module-count">${esc(String(row.count))} · ${esc(String(row.percent))}%</span>
            </li>
          `;
			})
			.join('');
		modulesBody = `<ul class="explorer-module-list">${moduleItems}</ul>`;
	} else {
		modulesBody = `<p class="explorer-dashboard-status">No recent module activity.</p>`;
	}

	return `
    <section class="explorer-dashboard-component" aria-label="Network statistics">
      <div class="explorer-dashboard-grid">
        ${serverInfoCard}

        <div class="explorer-card explorer-dashboard-card explorer-dashboard-info-card">
          <div class="explorer-stat-label">Blockchain Information</div>
          ${blockchainBody}
        </div>

        <div class="explorer-card explorer-dashboard-card explorer-dashboard-modules-card">
          <div class="explorer-stat-label">Most Popular Modules</div>
          ${modulesBody}
        </div>
      </div>
    </section>
  `;
};
