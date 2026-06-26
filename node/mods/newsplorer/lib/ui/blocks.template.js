module.exports = () => {
	const rows = [
		{
			block: '2,847,193',
			age: '2 secs ago',
			producer: 'gUNrVx8K...9mPq2L',
			txns: '142',
			rw: '12,847',
			fee: '0.0241'
		},
		{
			block: '2,847,192',
			age: '4 secs ago',
			producer: 'pQx7mK2n...4vRt8W',
			txns: '118',
			rw: '12,831',
			fee: '0.0198'
		},
		{
			block: '2,847,191',
			age: '6 secs ago',
			producer: 'hYt3nW9c...7kLm1Q',
			txns: '156',
			rw: '12,819',
			fee: '0.0273'
		},
		{
			block: '2,847,190',
			age: '8 secs ago',
			producer: 'mZo8pL4x...2nHs6R',
			txns: '97',
			rw: '12,804',
			fee: '0.0164'
		},
		{
			block: '2,847,189',
			age: '10 secs ago',
			producer: 'vBn2kQ7w...8pTx3M',
			txns: '131',
			rw: '12,792',
			fee: '0.0217'
		},
		{
			block: '2,847,188',
			age: '12 secs ago',
			producer: 'cWp5rT1y...5jKq9N',
			txns: '124',
			rw: '12,778',
			fee: '0.0202'
		}
	];

	const body = rows
		.map(
			(row) => `
      <tr class="newsplorer-table-row">
        <td data-label="Block">
          <a href="#" class="newsplorer-link newsplorer-mono">${row.block}</a>
        </td>
        <td class="newsplorer-muted" data-label="Age">${row.age}</td>
        <td data-label="Producer">
          <a href="#" class="newsplorer-link newsplorer-mono newsplorer-truncate">${row.producer}</a>
        </td>
        <td class="newsplorer-txn-count" data-label="Txn">
          <a href="#" class="newsplorer-link">${row.txns}</a>
        </td>
        <td class="newsplorer-mono" data-label="Routing Work">${row.rw}</td>
        <td class="newsplorer-mono" data-label="Burn Fee">${row.fee} SAITO</td>
      </tr>`
		)
		.join('');

	return `
    <div class="newsplorer-panel newsplorer-blocks-component">
      <div class="newsplorer-panel-header">
        <h2 class="newsplorer-panel-title">Latest Blocks</h2>
        <a href="#" class="newsplorer-panel-action">View all blocks</a>
      </div>
      <div class="newsplorer-table-wrap">
        <table class="newsplorer-table">
          <thead>
            <tr>
              <th>Block</th>
              <th>Age</th>
              <th>Producer</th>
              <th>Txn</th>
              <th>Routing Work</th>
              <th>Burn Fee</th>
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
