module.exports = (slips = [], direction = 'From') => {
	const hasSlips = slips.length > 0;
	if (!hasSlips) {
		const message =
			direction.toLowerCase() === 'to'
				? 'There are no outputs in this transaction.'
				: 'There are no inputs in this transaction.';
		return { hasSlips: false, html: `<p class="explorer-tx-empty-line">${message}</p>` };
	}

	const rows = slips
		.map(
			(slip) => `
      <tr class="explorer-slip-row">
        <td class="explorer-slip-pk">${slip.publicKey}</td>
        <td class="explorer-slip-amount explorer-slip-numeric">${slip.amount}</td>
        <td class="explorer-slip-type">${slip.slipType}</td>
        <td class="explorer-slip-loc explorer-slip-numeric">${slip.block}</td>
        <td class="explorer-slip-loc explorer-slip-numeric">${slip.transaction}</td>
        <td class="explorer-slip-loc explorer-slip-numeric">${slip.slip}</td>
      </tr>
    `
		)
		.join('');

	return {
		hasSlips: true,
		html: `
    <div class="explorer-slip-table-wrap">
      <table class="explorer-slip-table">
        <colgroup>
          <col class="explorer-slip-col-pk" />
          <col class="explorer-slip-col-amount" />
          <col class="explorer-slip-col-type" />
          <col class="explorer-slip-col-block" />
          <col class="explorer-slip-col-tx" />
          <col class="explorer-slip-col-slip" />
        </colgroup>
        <thead>
          <tr>
            <th scope="col">Public key</th>
            <th scope="col" class="explorer-slip-th-numeric">Amount</th>
            <th scope="col">Slip type</th>
            <th scope="col" class="explorer-slip-th-numeric">Block</th>
            <th scope="col" class="explorer-slip-th-numeric">Transaction</th>
            <th scope="col" class="explorer-slip-th-numeric">Slip</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `
	};
};
