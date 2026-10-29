const { decimalIsPositive } = require('../web3-amount');

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatAmount(value) {
  const raw = String(value ?? '').trim();
  if (/^\d+(\.\d+)?$/.test(raw)) {
    const [whole, fraction = ''] = raw.split('.');
    const head = whole.replace(/^0+(?=\d)/, '') || '0';
    const tail = fraction.replace(/0+$/, '');
    const normalized = tail ? `${head}.${tail}` : head;
    const [shownWhole, shownFraction = ''] = normalized.split('.');
    const grouped = shownWhole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return shownFraction ? `${grouped}.${shownFraction}` : grouped;
  }
  const amount = Number(value);
  if (!Number.isFinite(amount)) {
    return '0';
  }
  return amount.toLocaleString('en-US', { maximumFractionDigits: 8 });
}

module.exports = ({ rows = [] } = {}) => {
  const body = rows.length
    ? rows
        .map((row) => {
          const ticker = escapeHtml(row.ticker);
          const eligible = row.eligible || 0;
          const pending = row.pending || 0;
          const withdraw = decimalIsPositive(eligible)
            ? `<button type="button" class="withdraw-link" data-action="withdraw" data-ticker="${ticker}">You can withdraw this</button>`
            : '';
          return `
            <tr>
              <th scope="row">${ticker}</th>
              <td>
                <div class="eligible">
                  <span class="amount">${escapeHtml(formatAmount(eligible))}</span>
                  <span class="label">eligible</span>
                  ${withdraw}
                </div>
                <div class="pending">
                  <span class="amount">${escapeHtml(formatAmount(pending))}</span>
                  <span class="label">pending</span>
                </div>
              </td>
            </tr>`;
        })
        .join('')
    : `<tr><td class="empty" colspan="2">No web3 currencies are available from this server.</td></tr>`;

  return `
    <section class="store-withdrawals">
      <h2 class="title">Your web3 crypto balance:</h2>
      <table class="balances">
        <tbody>${body}</tbody>
      </table>
    </section>
  `;
};
