module.exports = ({
	loading = false,
	error = null,
	summary = null,
	columns = [],
	rows = [],
}) => {
	const summaryHtml = summary
		? `
      <div class="explorer-supply-metrics">
        <div class="explorer-supply-metric">
          <h3>${summary.totalSupply}</h3>
          <p>Total supply (NOLAN)</p>
        </div>
        <div class="explorer-supply-metric">
          <h3>${summary.utxo}</h3>
          <p>UTXO</p>
        </div>
        <div class="explorer-supply-metric">
          <h3>${summary.treasury}</h3>
          <p>Treasury</p>
        </div>
        <div class="explorer-supply-metric">
          <h3>${summary.graveyard}</h3>
          <p>Graveyard</p>
        </div>
      </div>
    `
		: '';

	const headerCells = columns
		.map((column) => {
			const blockId = column?.block_id != null ? String(column.block_id) : '—';
			const hash = column?.block_hash || '';
			if (hash) {
				return `<th class="explorer-supply-block-header" data-block-hash="${hash}"><a href="/explorer/block/${encodeURIComponent(hash)}" class="explorer-link explorer-supply-block-link">${blockId}</a></th>`;
			}
			return `<th>${blockId}</th>`;
		})
		.join('');

	const bodyRows = rows
		.map(
			(row) => `
      <tr class="${row.className}">
        <td class="explorer-supply-row-label">${row.label}</td>
        ${row.values.map((value) => `<td class="explorer-supply-numeric">${value}</td>`).join('')}
      </tr>
    `
		)
		.join('');

	const tableHtml =
		columns.length > 0
			? `
      <div class="explorer-supply-table-wrap explorer-table-wrap">
        <table class="explorer-supply-table data-table blocktable">
          <thead>
            <tr class="table-header">
              <th>id</th>
              ${headerCells}
            </tr>
          </thead>
          <tbody>
            ${bodyRows}
          </tbody>
        </table>
      </div>
    `
			: '';

	let statusHtml = '';
	if (loading) {
		statusHtml = `
      <p class="explorer-supply-status">Loading token supply from Explorer peer…</p>
    `;
	} else if (error) {
		statusHtml = `
      <div class="explorer-teaser-loading explorer-teaser-error">
        <p class="explorer-teaser-loading-title">Unable to load supply data</p>
        <p class="explorer-teaser-loading-message">${error}</p>
      </div>
    `;
	} else if (!columns.length) {
		statusHtml = `
      <p class="explorer-supply-status">No supply statistics are available yet. The Explorer node records supply data as new blocks arrive on the longest chain.</p>
    `;
	}

	return `
    <main class="explorer-content explorer-view-panel explorer-supply-page">
      <div class="explorer-container explorer-stack">
        <div class="explorer-supply-header">
          <button type="button" class="explorer-back-link" data-nav="home" aria-label="Back to explorer home">
            <i class="fa-solid fa-arrow-left"></i>
          </button>
          <div class="explorer-supply-header-text">
            <h1 class="explorer-page-title">Token Supply</h1>
            <p class="explorer-subtitle">Longest-chain supply breakdown by block (NOLAN)</p>
          </div>
        </div>

        <div class="explorer-supply-dashboard explorer-card explorer-card-padded">
          ${summaryHtml}
          <div class="explorer-supply-tabs">
            <div class="explorer-supply-tab active">Block data</div>
          </div>
          ${statusHtml}
          ${tableHtml}
        </div>
      </div>
    </main>
  `;
};
