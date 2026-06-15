module.exports = {
	selectTemplate: () => {
		return `
    <div class="store-product-overlay store-listing-overlay store-listing-mode-select">
      <div class="store-listing-select-header">
        <div class="store-listing-select-title">Select NFT to List</div>
        <div class="store-listing-select-subtitle">Choose an NFT from your wallet.</div>
      </div>
      <div class="store-listing-select-body hide-scrollbar">
        <div id="store-listing-nft-list" class="send-nft-list store-listing-nft-grid"></div>
      </div>
    </div>
  `;
	},

	configureTemplate: (view) => {
		const descHtml = view.description || 'No description provided';
		return `
    <div class="store-product-overlay store-listing-overlay store-listing-mode-configure">
      <div class="store-product-header">
        <div class="store-product-header-left">
          <div class="store-product-identicon store-listing-back-slot" id="store-listing-back" role="button" tabindex="0" aria-label="Back to NFT selection">
            <span class="store-listing-back-btn">←</span>
          </div>
          <div class="store-product-meta">
            <div class="store-product-title store-listing-editable-line store-listing-title-line">
              <span id="store-listing-title-text">${view.listingTitle}</span>
              <span class="store-listing-edit-affordance" id="store-listing-edit-title" role="button" tabindex="0" aria-label="Edit title">✎</span>
            </div>
            <div class="store-product-seller">by ${view.shortSeller}</div>
          </div>
        </div>
        <div class="store-product-menu store-listing-header-spacer" aria-hidden="true">
          <span class="store-product-menu-line"></span>
          <span class="store-product-menu-line"></span>
          <span class="store-product-menu-line"></span>
        </div>
      </div>

      <div class="store-product-body">
        <div class="store-product-media-col">
          <div class="store-product-media store-listing-media">
            ${view.mediaHtml}
          </div>
        </div>

        <div class="store-product-info-col">
          <div class="store-product-info-block store-product-price-block">
            <div class="store-product-section-label">Price</div>
            <div class="store-product-price-main store-listing-editable-line store-listing-price-line">
              <span id="store-listing-price-text">${view.priceDisplay}</span>
              <span class="store-listing-edit-affordance" id="store-listing-edit-price" role="button" tabindex="0" aria-label="Edit price">✎</span>
            </div>
          </div>

          <div class="store-product-info-block store-product-description">
            <div class="store-product-section-label">Description</div>
            <div class="store-product-desc-body store-listing-editable-line store-listing-desc-line">
              <span id="store-listing-desc-text">${descHtml}</span>
              <span class="store-listing-edit-affordance" id="store-listing-edit-desc" role="button" tabindex="0" aria-label="Edit description">✎</span>
            </div>
          </div>

          <div class="store-product-info-block store-product-purchase-info store-listing-purchase-info">
            <div class="store-product-meta-section">
              <div class="store-product-meta-row"><span class="store-product-section-label">Type:</span> <span class="store-product-meta-value">${view.productType}</span></div>
              <div class="store-product-meta-row"><span class="store-product-section-label">File type:</span> <span class="store-product-meta-value">${view.fileType}</span></div>
              <div class="store-product-meta-row"><span class="store-product-section-label">Created:</span> <span class="store-product-meta-value">${view.createdDate}</span></div>
              <div class="store-product-meta-row store-listing-editable-line store-listing-available-line">
                <span class="store-product-section-label">Available:</span>
                <span class="store-product-meta-value" id="store-listing-available-text">${view.supply}</span>
                <span class="store-listing-edit-affordance" id="store-listing-edit-available" role="button" tabindex="0" aria-label="Edit available quantity">✎</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="store-product-footer">
        <button type="button" class="store-product-buy" id="store-listing-submit">Submit Listing</button>
      </div>
    </div>
  `;
	}
};
