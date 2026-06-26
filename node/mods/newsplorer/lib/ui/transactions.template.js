module.exports = () => {
	const rows = [
		{
			sig: '2Xk9mP4v...7nQw8R',
			age: '3 secs ago',
			from: 'gUNrVx8K...9mPq2L',
			to: 'P2SH 00a3f2...c891',
			fee: '0.00124'
		},
		{
			sig: '8Hn2pL7w...4kTx1M',
			age: '5 secs ago',
			from: 'pQx7mK2n...4vRt8W',
			to: 'mZo8pL4x...2nHs6R',
			fee: '0.00098'
		},
		{
			sig: '5Rt1nK9c...2pLm7Q',
			age: '7 secs ago',
			from: 'hYt3nW9c...7kLm1Q',
			to: 'Store Module',
			fee: '0.00241'
		},
		{
			sig: '9Wm4kP2x...8nHs3T',
			age: '9 secs ago',
			from: 'vBn2kQ7w...8pTx3M',
			to: 'cWp5rT1y...5jKq9N',
			fee: '0.00107'
		},
		{
			sig: '3Lp8nQ1y...6kTx4W',
			age: '11 secs ago',
			from: 'cWp5rT1y...5jKq9N',
			to: 'P2SH 00b7e1...d204',
			fee: '0.00156'
		},
		{
			sig: '7Kx2mT5n...1pQw9L',
			age: '13 secs ago',
			from: 'mZo8pL4x...2nHs6R',
			to: 'gUNrVx8K...9mPq2L',
			fee: '0.00087'
		}
	];

	const body = rows
		.map(
			(row) => `
      <tr class="newsplorer-table-row">
        <td data-label="Signature">
          <a href="#" class="newsplorer-link newsplorer-mono newsplorer-truncate">${row.sig}</a>
        </td>
        <td class="newsplorer-muted" data-label="Age">${row.age}</td>
        <td data-label="From">
          <a href="#" class="newsplorer-link newsplorer-mono newsplorer-truncate">${row.from}</a>
        </td>
        <td data-label="To">
          <a href="#" class="newsplorer-link newsplorer-mono newsplorer-truncate">${row.to}</a>
        </td>
        <td class="newsplorer-mono" data-label="Fee">${row.fee} SAITO</td>
      </tr>`
		)
		.join('');

	return `
    <div class="newsplorer-panel newsplorer-transactions-component">
      <div class="newsplorer-panel-header">
        <h2 class="newsplorer-panel-title">Latest Transactions</h2>
        <a href="#" class="newsplorer-panel-action">View all transactions</a>
      </div>
      <div class="newsplorer-table-wrap">
        <table class="newsplorer-table">
          <thead>
            <tr>
              <th>Signature</th>
              <th>Age</th>
              <th>From</th>
              <th>To</th>
              <th>Fee</th>
            </tr>
          </thead>
          <tbody>
            ${body}
          </tbody>
        </table>
      </div>
    </div>
  `;
};
