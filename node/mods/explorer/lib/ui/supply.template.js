function renderNumericCell(value, options = {}) {
	const classes = ['explorer-supply-numeric'];

	if (options.isGoldenTicketColumn) {
		classes.push('explorer-column-golden-ticket');
	}

	if (value && typeof value === 'object' && value.text != null) {
		const tone = value.tone || 'muted';

		if (options.isNetFlow) {
			classes.push('explorer-supply-net-flow');
			classes.push(`explorer-supply-net-flow-${tone}`);
		} else {
			classes.push('explorer-supply-delta');
			classes.push(`explorer-supply-delta-${tone}`);
		}

		return `<td class="${classes.join(' ')}">${value.text}</td>`;
	}

	if (options.isUnknown) {
		classes.push('explorer-supply-unknown');
	}

	return `<td class="${classes.join(' ')}">${value}</td>`;
}

function renderGoldenTicketIcon() {
	return '<i class="fa-solid fa-star explorer-golden-ticket-icon" aria-hidden="true" title="Golden Ticket"></i>';
}

function renderBlockHeaderCells(columns = []) {
	return columns
		.map((column) => {
			const blockId = column?.blockId != null ? String(column.blockId) : '—';
			const hash = column?.blockHash || '';
			const headerClasses = ['explorer-supply-block-header', 'explorer-supply-numeric'];
			if (column?.hasGoldenTicket) {
				headerClasses.push('explorer-column-golden-ticket');
			}
			const goldenTicketIcon = column?.hasGoldenTicket ? renderGoldenTicketIcon() : '';
			if (hash) {
				return `<th class="${headerClasses.join(' ')}" data-block-hash="${hash}"><a href="/explorer/block/${encodeURIComponent(hash)}" class="explorer-link explorer-supply-block-link"><span class="explorer-supply-block-id">${blockId}</span>${goldenTicketIcon}</a></th>`;
			}
			return `<th class="${headerClasses.join(' ')}"><span class="explorer-supply-block-id">${blockId}</span>${goldenTicketIcon}</th>`;
		})
		.join('');
}

function renderMatrixRows(rows = [], columns = []) {
	const columnCount = columns.length;
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

			if (row.isSectionTitle) {
				return `
      <tr class="explorer-supply-net-flow-title">
        <td colspan="${colspan}">${row.label}</td>
      </tr>
    `;
			}

			return `
      <tr class="${row.className}">
        <td class="explorer-supply-row-label">${row.label}</td>
        ${row.values
					.map((value, columnIndex) =>
						renderNumericCell(value, {
							isUnknown: row.key === 'utxo' && !row.isNetFlow,
							isNetFlow: row.isNetFlow,
							isTotal: row.isTotal,
							isGoldenTicketColumn: Boolean(columns[columnIndex]?.hasGoldenTicket),
						})
					)
					.join('')}
      </tr>
    `;
		})
		.join('');
}

function renderBlockControls(showBlockControls = false) {
	if (!showBlockControls) {
		return '';
	}

	return `
          <div class="explorer-supply-admin-controls" aria-label="Manual block production">
            <button type="button" class="explorer-supply-admin-button" data-supply-produce-block>
              Produce Block
            </button>
            <button type="button" class="explorer-supply-admin-button" data-supply-produce-block-gt>
              Produce Block + Golden Ticket
            </button>
          </div>
  `;
}

module.exports = ({
	loading = false,
	error = null,
	columns = [],
	rows = [],
	hasData = false,
	fullWidth = false,
	showBlockControls = false,
}) => {
	const headerCells = renderBlockHeaderCells(columns);
	const bodyRows = renderMatrixRows(rows, columns);
	const containerClasses = ['explorer-container', 'explorer-stack'];
	if (fullWidth) {
		containerClasses.push('full-width');
	}
	const toggleLabel = fullWidth ? 'Collapse supply dashboard' : 'Expand supply dashboard';
	const blockControlsHtml = renderBlockControls(showBlockControls);

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
      <div class="${containerClasses.join(' ')}">
        <div class="explorer-supply-header">
          <button type="button" class="explorer-back-link" data-nav="home" aria-label="Back to explorer home">
            <i class="fa-solid fa-arrow-left"></i>
          </button>
          <div class="explorer-supply-header-text">
            <h1 class="explorer-page-title">Token Supply</h1>
            <p class="explorer-subtitle">Longest-chain protocol accounting by block (SAITO)</p>
          </div>
          ${blockControlsHtml}
        </div>

        <div class="explorer-supply-dashboard explorer-card explorer-card-padded">
          <div class="explorer-supply-dashboard-toolbar">
            <span class="explorer-supply-width-toggle" data-supply-width-toggle role="button" tabindex="0" aria-label="${toggleLabel}" title="${toggleLabel}" aria-expanded="${fullWidth ? 'true' : 'false'}">
              <i class="fa-solid fa-expand explorer-supply-expand-icon" aria-hidden="true"></i>
              <i class="fa-solid fa-down-left-and-up-right-to-center explorer-supply-collapse-icon" aria-hidden="true"></i>
            </span>
          </div>
          ${statusHtml}
          ${tableHtml}
        </div>
      </div>
    </main>
  `;
};
