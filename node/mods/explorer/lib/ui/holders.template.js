const { buildPublicKeyLink, formatSaito, formatAbsoluteTime } = require('../explorer-format');

module.exports = (
  app,
  { view = null, loading = false, waiting = false, error = null, expired = false } = {}
) => {
  const esc = (value) => app.browser.escapeHTML(String(value ?? ''));
  const count = (value) => esc(Number(value).toLocaleString('en-US'));
  let content = '';
  if (loading) {
    content = `<p role="status">${waiting ? 'Waiting for Explorer peer…' : 'Loading holders…'}</p>`;
  } else if (error) {
    content = `<div role="alert"><p>${esc(error)}</p>
      ${expired ? '' : '<button type="button" class="explorer-load-more-btn" data-holders-retry>Retry</button>'}</div>`;
  } else if (view) {
    const page = Number(view.page);
    const totalPages = Number(view.total_pages);
    // A bounded window of page buttons keeps navigation usable for large lists.
    const pages = [
      ...new Set([1, ...Array.from({ length: 5 }, (_, i) => page - 2 + i), totalPages])
    ]
      .filter((number) => number >= 1 && number <= totalPages)
      .sort((a, b) => a - b);
    let previous = 0;
    const pageButtons = pages
      .map((number) => {
        const gap = previous && number - previous > 1 ? '<span aria-hidden="true">…</span>' : '';
        previous = number;
        return `${gap}<button type="button" data-holders-page="${number}" aria-label="Page ${number}"
        ${number === page ? 'aria-current="page" disabled' : ''}>${number}</button>`;
      })
      .join('');

    content = `
      <div class="explorer-address-metrics">
        <div class="explorer-address-metric"><h3>${count(view.total_utxos)}</h3><p>Unspent UTXOs</p></div>
        <div class="explorer-address-metric"><h3>${count(view.total_holders)}</h3><p>Unique holders</p></div>
      </div>
      <p class="explorer-address-status">Snapshot at
        <a class="explorer-link" href="/explorer/block/${encodeURIComponent(view.block_hash)}">block ${esc(view.block_id)}</a>
        · ${esc(formatAbsoluteTime(view.timestamp))}</p>
      ${
        view.rows.length
          ? `
      <div class="explorer-table-wrap" tabindex="0" role="region" aria-label="Holder balances">
        <table class="explorer-table explorer-holders-table">
          <thead><tr><th scope="col">Rank</th><th scope="col">Public key</th>
            <th scope="col" class="explorer-table-cell-numeric" aria-sort="descending">SAITO balance ↓</th>
            <th scope="col" class="explorer-table-cell-numeric">UTXOs</th></tr></thead>
          <tbody>${view.rows
            .map(
              (row) => `<tr class="explorer-table-row">
            <td>${count(row.rank)}</td>
            <td class="explorer-table-cell-mono">${buildPublicKeyLink(app, row.public_key, row.public_key)}</td>
            <td class="explorer-table-cell-numeric">${esc(formatSaito(row.balance))}</td>
            <td class="explorer-table-cell-numeric">${count(row.utxo_count)}</td>
          </tr>`
            )
            .join('')}</tbody>
        </table>
      </div>`
          : '<p>No unspent UTXOs in this snapshot.</p>'
      }
      <nav class="explorer-holders-pagination" aria-label="Holder pages">
        <button type="button" data-holders-page="${page - 1}" ${page <= 1 ? 'disabled' : ''}>Previous</button>
        ${pageButtons}
        <button type="button" data-holders-page="${page + 1}" ${page >= totalPages ? 'disabled' : ''}>Next</button>
        <span>Page ${count(page)} of ${count(totalPages)} · 25 holders per page</span>
      </nav>`;
  }

  return `
    <main class="explorer-content explorer-view-panel explorer-holders-page">
      <div class="explorer-container explorer-stack">
        <div class="explorer-address-header">
          <button type="button" class="explorer-back-link" data-nav="home" aria-label="Back to explorer home"><i class="fa-solid fa-arrow-left" aria-hidden="true"></i></button>
          <div class="explorer-address-header-text"><h1 class="explorer-page-title">Holders &amp; UTXO Set</h1></div>
          <button type="button" class="explorer-load-more-btn" data-holders-refresh ${loading ? 'disabled' : ''}>Refresh</button>
        </div>
        <p class="explorer-address-status">Unspent outputs included in the Token Supply snapshot. Includes locked stake; excludes Bound outputs and outputs outside the genesis window. Balances are ordered highest first.</p>
        <section class="explorer-card explorer-card-padded" aria-label="UTXO holders" aria-busy="${loading}">${content}</section>
      </div>
    </main>`;
};
