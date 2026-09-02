const { normalizeListingMode } = require('../../categories');

const NftPickerTemplate = (model = {}) => {
  const mode = normalizeListingMode(model.listing_mode);

  return `
    <div class="nft-picker" data-listing-mode="${mode}">
      <header>
        <div class="heading">
          <h2>Select an NFT</h2>
          <p class="lede">
            Choose something from your wallet to
            <label class="mode-inline">
              <select class="saito-form-select" data-listing-mode-select aria-label="Listing mode">
                <option value="sell"${mode === 'sell' ? ' selected' : ''}>SELL</option>
                <option value="rent"${mode === 'rent' ? ' selected' : ''}>RENT</option>
              </select>
            </label>
            on the Store.
          </p>
        </div>
      </header>
      <div class="body hide-scrollbar">
        <div class="send-nft-list" data-nft-grid></div>
        <div class="status" data-nft-status></div>
      </div>
      <div class="nft-list-instructions" data-nft-instructions hidden></div>
    </div>
  `;
};

NftPickerTemplate.emptyInstructions = (mode = 'sell') => {
  const listing_mode = normalizeListingMode(mode);
  if (listing_mode === 'rent') {
    return `
    <div class="empty">
      <p>No items to rent.</p>
      <p>A Vault rental NFT (vault-nft-rental) is required to create Store rental inventory.</p>
    </div>
  `;
  }
  // Sell empty state: bottom create-prompt is enough; no mid-panel "No NFTs" line.
  return '';
};

NftPickerTemplate.createPrompt = () => {
  return `
    <div class="instructions">
      Don't own any NFTs? <span class="saito-anchor" id="nft-picker-create-link" role="button" tabindex="0">
        <span>Create one and list it for sale</span>
      </span>.
    </div>
  `;
};

module.exports = NftPickerTemplate;
