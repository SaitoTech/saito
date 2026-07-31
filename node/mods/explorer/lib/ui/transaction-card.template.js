module.exports = (tx, { showModule = false } = {}) => {
  const type = showModule ? tx.module || tx.type : tx.type;

  return `
    <div class="explorer-transaction-card" role="button" tabindex="0" data-tx-signature="${tx.signature}" data-block-hash="${tx.blockHash}" data-block-id="${tx.blockId}">
      <div class="explorer-transaction-card-icon-section">
        <span class="explorer-feed-icon" aria-hidden="true">
          <i class="fas fa-file-alt"></i>
        </span>
      </div>
      <div class="explorer-transaction-card-content">
        <div class="explorer-transaction-card-main-data">
          <div class="explorer-transaction-card-data-field">
            <span class="explorer-transaction-card-label">Sig:</span>
            <span class="explorer-transaction-card-value explorer-link explorer-mono" title="${tx.signature}">${tx.hash}</span>
          </div>
          <div class="explorer-transaction-card-addresses">
            <div class="explorer-transaction-card-data-field">
              <span class="explorer-transaction-card-label">From:</span>
              <span class="explorer-transaction-card-value">${tx.from}</span>
            </div>
            <div class="explorer-transaction-card-data-field">
              <span class="explorer-transaction-card-label">To:</span>
              <span class="explorer-transaction-card-value">${tx.to}</span>
            </div>
          </div>
        </div>
        <div class="explorer-transaction-card-sub-data">
          <span class="explorer-transaction-card-sub-field" title="${tx.time}">${tx.time}</span>
          <div class="explorer-transaction-card-sub-badges">
            <span class="explorer-transaction-card-sub-field">
              <span class="explorer-feed-badge" title="${type}">${type}</span>
            </span>
            <span class="explorer-transaction-card-sub-field">
              <span class="explorer-feed-badge" title="${tx.amount}">${tx.amount}</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  `;
};
