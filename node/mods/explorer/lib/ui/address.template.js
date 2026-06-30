module.exports = ({
	loading = false,
	error = null,
	summary = null,
	rows = [],
}) => {
	const summaryHtml = summary
		? `
      <div class="explorer-address-metrics">
        <div class="explorer-address-metric">
          <h3>${summary.netDeltaSaito}</h3>
          <p>Net activity (indexed)</p>
        </div>
        <div class="explorer-address-metric">
          <h3>${summary.entryCount}</h3>
          <p>Transactions</p>
        </div>
      </div>
    `
		: '';

	const tableHtml = rows.length
		? `
      <div class="explorer-table-wrap">
        <table class="explorer-table explorer-address-table">
          <thead>
            <tr>
              <th>Block</th>
              <th class="explorer-table-cell-numeric">Delta (NOLAN)</th>
              <th class="explorer-table-cell-numeric">Delta (SAITO)</th>
              <th>Recipient</th>
              <th>Transaction</th>
            </tr>
          </thead>
          <tbody>
            ${rows
							.map(
								(row) => `
              <tr class="explorer-table-row">
                <td>
                  ${
										row.blockHash
											? `<a href="/explorer/block/${encodeURIComponent(row.blockHash)}" class="explorer-link explorer-address-block-link" data-block-hash="${row.blockHash}">${row.blockId}</a>`
											: row.blockId
									}
                </td>
                <td class="explorer-table-cell-numeric explorer-address-delta">${row.delta}</td>
                <td class="explorer-table-cell-numeric explorer-address-delta">${row.deltaSaito}</td>
                <td>${row.recipient}</td>
                <td>
                  ${
										row.txHash
											? `<a href="/explorer/block/${encodeURIComponent(row.blockHash)}" class="explorer-link explorer-mono explorer-address-tx-link" data-block-hash="${row.blockHash}" title="${row.txHash}">${row.txHashDisplay}</a>`
											: '—'
									}
                </td>
              </tr>
            `
							)
							.join('')}
          </tbody>
        </table>
      </div>
    `
		: '';

	let statusHtml = '';
	if (loading) {
		statusHtml = `<p class="explorer-address-status">Loading address activity from Explorer peer…</p>`;
	} else if (error) {
		statusHtml = `
      <div class="explorer-teaser-loading explorer-teaser-error">
        <p class="explorer-teaser-loading-title">Unable to load address activity</p>
        <p class="explorer-teaser-loading-message">${error}</p>
      </div>
    `;
	} else if (!rows.length) {
		statusHtml = `<p class="explorer-address-status">No indexed activity found for this public key on the longest chain.</p>`;
	}

	const publicKeyFull = summary?.publicKeyFull || '';

	return `
    <main class="explorer-content explorer-view-panel explorer-address-page">
      <div class="explorer-container explorer-stack">
        <div class="explorer-address-header">
          <button type="button" class="explorer-back-link" data-nav="home" aria-label="Back to explorer home">
            <i class="fa-solid fa-arrow-left"></i>
          </button>
          <div class="explorer-address-header-text">
            <h1 class="explorer-page-title">Address Transfers</h1>
            ${publicKeyFull ? `<p class="explorer-address-key-raw explorer-mono">${publicKeyFull}</p>` : ''}
          </div>
        </div>

        <div class="explorer-address-dashboard explorer-card explorer-card-padded">
          ${summaryHtml}
          ${statusHtml}
          ${tableHtml}
        </div>
      </div>
    </main>
  `;
};
