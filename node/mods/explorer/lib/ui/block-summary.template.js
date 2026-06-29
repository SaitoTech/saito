module.exports = (rows = []) => {
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
							: row.hashLink
								? `<span class="explorer-hash-link explorer-mono" title="${row.full || ''}">${row.value}</span>`
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
};
