function renderMetaRow(row) {
	const valueClass = `explorer-block-meta-value${row.mono ? ' explorer-block-meta-value-mono' : ''}${row.numeric ? ' explorer-block-meta-value-numeric' : ''}`;

	return `
      <dt class="explorer-block-meta-label">${row.label}</dt>
      <dd class="${valueClass}">${row.value}</dd>
    `;
}

function renderBadge(badge) {
	if (!badge?.label) {
		return '';
	}

	const stateClass = badge.active ? ' explorer-block-badge-active' : ' explorer-block-badge-muted';
	return `<span class="explorer-block-badge${stateClass}">${badge.label}</span>`;
}

function renderDetailTable(rows = []) {
	if (!rows.length) {
		return '';
	}

	const body = rows
		.map(
			(row) => `
      <tr class="explorer-info-row">
        <th class="explorer-info-label" scope="row">${row.label}</th>
        <td class="explorer-info-value${row.numeric ? ' explorer-info-numeric' : ''}${row.mono ? ' explorer-mono' : ''}">
          ${
						row.html
							? row.value
							: row.link
							? `<span class="explorer-link explorer-info-link">${row.value}</span>`
							: row.value
					}
        </td>
      </tr>
    `
		)
		.join('');

	return `
    <div class="explorer-info-table-wrap">
      <table class="explorer-info-table">
        <tbody>${body}</tbody>
      </table>
    </div>
  `;
}

module.exports = ({ primary = [], detail = [], badges = null } = {}) => {
	const badgeHtml =
		badges?.goldenTicket || badges?.longestChain
			? `
      <div class="explorer-block-badges" aria-label="Block status">
        ${renderBadge(badges.goldenTicket)}
        ${renderBadge(badges.longestChain)}
      </div>
    `
			: '';

	const primaryHtml = primary.length
		? `
      <dl class="explorer-block-meta">
        ${primary.map(renderMetaRow).join('')}
      </dl>
    `
		: '';

	const detailToggle = detail.length
		? `
      <div class="explorer-block-meta-footer">
        <button type="button" class="explorer-action explorer-block-meta-toggle" aria-expanded="false">
          View full block metadata
        </button>
      </div>
      <div class="explorer-block-detail-panel" hidden>
        ${renderDetailTable(detail)}
      </div>
    `
		: '';

	if (!primaryHtml && !detailToggle && !badgeHtml) {
		return '';
	}

	return `
    <div class="explorer-block-summary-panel">
      ${badgeHtml}
      ${primaryHtml}
      ${detailToggle}
    </div>
  `;
};
