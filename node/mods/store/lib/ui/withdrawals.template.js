function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatAmount(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) {
    return '0';
  }
  return amount.toLocaleString('en-US', { maximumFractionDigits: 8 });
}

function formatPendingDate(value) {
  if (!value) {
    return '';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

module.exports = ({ rows = [] } = {}) => {
  const body = rows.length
    ? rows
        .map((row) => {
          const ticker = escapeHtml(row.ticker);
          const available = Number(row.available);
          const pending = Number(row.pending);
          const canWithdraw = Number.isFinite(available) && available > 0;
          const pendingDate = Number.isFinite(pending) && pending > 0 ? formatPendingDate(row.pending_on) : '';
          const withdraw = canWithdraw
            ? `<button type="button" class="withdraw-link" data-action="withdraw" data-ticker="${ticker}">withdraw</button>`
            : '';
          const date = pendingDate ? `<time datetime="${escapeHtml(pendingDate)}">${escapeHtml(pendingDate)}</time>` : '';
          return `
            <tr>
              <th scope="row">${ticker}</th>
              <td>
                <div class="available">
                  <span class="amount">${escapeHtml(formatAmount(available))}</span>
                  <span class="label">available</span>
                  ${withdraw}
                </div>
                <div class="pending">
                  <span class="amount">${escapeHtml(formatAmount(pending))}</span>
                  <span class="label">pending</span>
                  ${date}
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
