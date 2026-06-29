module.exports = (slips = [], direction = 'From') => {
	if (!slips.length) {
		return `<p class="explorer-tx-section-empty">No ${direction.toLowerCase()} slips.</p>`;
	}

	const rows = slips
		.map(
			(slip, index) => `
      <tr class="explorer-slip-row">
        <td class="explorer-slip-index explorer-info-numeric">${index + 1}</td>
        <td class="explorer-slip-pk">
          ${slip.publicKey}
        </td>
        <td class="explorer-slip-amount explorer-info-numeric">${slip.amount}</td>
        <td class="explorer-slip-type">${slip.slipType}</td>
      </tr>
    `
		)
		.join('');

	return `
    <div class="explorer-slip-table-wrap">
      <table class="explorer-slip-table">
        <thead>
          <tr>
            <th scope="col">#</th>
            <th scope="col">Public key</th>
            <th scope="col" class="explorer-info-numeric">Amount</th>
            <th scope="col">Slip type</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
};
