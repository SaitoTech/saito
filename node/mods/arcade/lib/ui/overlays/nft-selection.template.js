module.exports = (title = 'Select NFTs') => {
  return `
    <div id="arcade-nft-selection-overlay" class="saito-overlay-form retain-surface">
      <div class="saito-overlay-form-header">
        <div class="saito-overlay-form-header-title">${title}</div>
      </div>
      <div class="arcade-nft-selection-body">
        <div class="send-nft-list" data-nft-grid></div>
        <div class="nft-list-instructions" data-nft-instructions></div>
      </div>
      <div class="saito-button-row">
        <button type="button" id="arcade-nft-selection-confirm" class="saito-button-primary">
          Play with these NFTs
        </button>
      </div>
    </div>
  `;
};
