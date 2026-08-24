const BlockStatusBadgesTemplate = require('./block-status-badges.template');

module.exports = (block, { showDetails = false, showLongestChain = false, isNew = false } = {}) => {
  const hashLink = (displayHash, rawHash) => {
    if (!rawHash) {
      return `<span class="explorer-block-card-hash-value">${displayHash}</span>`;
    }

    return `<a href="/explorer/block/${encodeURIComponent(rawHash)}" class="explorer-block-card-hash-value explorer-block-card-hash-link explorer-link" data-block-hash="${displayHash}">${displayHash}</a>`;
  };

  const details = showDetails
    ? `
      <div class="explorer-block-card-hashes">
        <div class="explorer-block-card-hash" title="${block.hash}">
          <span class="explorer-block-card-hash-label">Hash</span>
          ${hashLink(block.hash, block.hashRaw || block.hash)}
        </div>
        <div class="explorer-block-card-hash" title="${block.previousHash}">
          <span class="explorer-block-card-hash-label">Previous</span>
          ${hashLink(block.previousHash, block.previousHashRaw)}
        </div>
      </div>
    `
    : '';

  return `
    <div class="explorer-block-card${showDetails ? ' explorer-block-card--detailed' : ''}${isNew ? ' explorer-block-card--new' : ''}" role="button" tabindex="0" data-block-hash="${block.hash}">
      <div class="explorer-block-card-layout">
        <div class="explorer-block-card-icon-section">
          <span class="explorer-block-card-icon" aria-hidden="true">
            <i class="fas fa-cube"></i>
          </span>
        </div>
        <div class="explorer-block-card-information">
          <div class="explorer-block-card-summary">
            <span class="explorer-block-card-id explorer-link">Block ${block.number}</span>
            <span class="explorer-block-card-transactions">${block.txns} txns</span>
            <span class="explorer-block-card-time">${block.time}</span>
          </div>
          <div class="explorer-block-card-miner-status">
            <span class="explorer-block-card-miner" title="${block.minerRaw}">
              Miner ${block.miner}
            </span>
            ${BlockStatusBadgesTemplate(block, { showLongestChain })}
          </div>
          ${details}
        </div>
      </div>
    </div>
  `;
};
