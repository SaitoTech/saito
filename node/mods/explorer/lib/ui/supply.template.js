function renderNumericCell(value, options = {}) {
	if (value && typeof value === 'object' && value.text != null) {
		const tone = value.tone || 'muted';
		return `<td class="explorer-supply-numeric explorer-supply-delta explorer-supply-delta-${tone}">${value.text}</td>`;
	}

	const classes = ['explorer-supply-numeric'];
	if (options.isUnknown) {
		classes.push('explorer-supply-unknown');
	}

	return `<td class="${classes.join(' ')}">${value}</td>`;
}

function renderBlockHeaderCells(columns = []) {
	return columns
		.map((column) => {
			const blockId = column?.blockId != null ? String(column.blockId) : '—';
			const hash = column?.blockHash || '';
			if (hash) {
				return `<th class="explorer-supply-block-header explorer-supply-numeric" data-block-hash="${hash}"><a href="/explorer/block/${encodeURIComponent(hash)}" class="explorer-link explorer-supply-block-link">${blockId}</a></th>`;
			}
			return `<th class="explorer-supply-block-header explorer-supply-numeric">${blockId}</th>`;
		})
		.join('');
}

function renderMatrixRows(rows = [], columnCount = 0) {
	const colspan = columnCount > 0 ? columnCount + 1 : 2;

	return rows
		.map((row) => {
			if (row.isSectionDivider) {
				return `
      <tr class="explorer-supply-delta-divider" aria-hidden="true">
        <td colspan="${colspan}"></td>
      </tr>
    `;
			}

			return `
      <tr class="${row.className}">
        <td class="explorer-supply-row-label">${row.label}</td>
        ${row.values
					.map((value) => renderNumericCell(value, { isUnknown: row.key === 'utxo' && !row.isDelta }))
					.join('')}
      </tr>
    `;
		})
		.join('');
}

module.exports = ({
	loading = false,
	error = null,
	columns = [],
	rows = [],
	hasData = false,
}) => {
	const headerCells = renderBlockHeaderCells(columns);
	const bodyRows = renderMatrixRows(rows, columns.length);

	const tableHtml =
		hasData && columns.length > 0
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
      <p class="explorer-supply-status">Loading token supply accounting from Explorer peer…</p>
    `;
	} else if (error) {
		statusHtml = `
      <div class="explorer-teaser-loading explorer-teaser-error">
        <p class="explorer-teaser-loading-title">Unable to load supply data</p>
        <p class="explorer-teaser-loading-message">${error}</p>
      </div>
    `;
	} else if (!hasData) {
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
            <p class="explorer-subtitle">Longest-chain protocol accounting by block (SAITO)</p>
          </div>
        </div>

        <div class="explorer-supply-dashboard explorer-card explorer-card-padded">
          ${statusHtml}
          ${tableHtml}
        </div>
      </div>
    </main>
  `;
};
