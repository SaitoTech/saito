module.exports = (tx) => {
	return `
    <div class="explorer-feed-item explorer-tx-teaser" role="button" tabindex="0" aria-expanded="false">
      <span class="explorer-feed-icon" aria-hidden="true"><i class="fas fa-file-alt"></i></span>
      <div class="explorer-feed-main">
        <div class="explorer-feed-line">
          <span class="explorer-hash-link" title="${tx.hashFull}">${tx.hash}</span>
          <span class="explorer-tx-type-badge explorer-tx-type-badge-subtle">${tx.type}</span>
        </div>
        <div class="explorer-feed-meta">Tx #${tx.txId}</div>
      </div>
      <div class="explorer-feed-aside">
        <span class="explorer-feed-time">${tx.time}</span>
        <span class="explorer-feed-detail">${tx.fee}</span>
      </div>
      <span class="explorer-feed-chevron" aria-hidden="true"><i class="fas fa-angle-down"></i></span>
    </div>
  `;
};
