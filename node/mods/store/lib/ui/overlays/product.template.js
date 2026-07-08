module.exports = (view) => {
	const thumbHtml = view.hasGallery
		? view.images
				.map(
					(src, idx) => `
          <div class="store-product-thumb ${idx === 0 ? 'active' : ''}" data-src="${src}">
            <img src="${src}" />
          </div>
        `
				)
				.join('')
		: '';

	const descHtml = view.hasDescription ? view.description : 'No description provided';
	const loadingHtml = view.imageLoading
		? `<div class="store-product-media-loading" aria-hidden="true"></div>`
		: '';
	return `
    <div class="store-product-overlay">
      <div class="store-product-header">
        <div class="store-product-header-left">
          <div class="store-product-identicon">
            <img src="${view.identicon}" />
          </div>

          <div class="store-product-meta">
            <div class="store-product-title">${view.listingTitle}</div>
            <div class="store-product-seller">by ${view.shortSeller}</div>
          </div>
        </div>

        <div class="store-product-menu" aria-label="menu">
          <span class="store-product-menu-line"></span>
          <span class="store-product-menu-line"></span>
          <span class="store-product-menu-line"></span>
        </div>
      </div>

      <div class="store-product-body">
        <div class="store-product-media-col">
          <div class="store-product-media">
            ${loadingHtml}
            <img class="store-product-main-image" src="${view.images[0]}" />
          </div>
          ${view.hasGallery ? `<div class="store-product-thumbs">${thumbHtml}</div>` : ''}
        </div>

        <div class="store-product-info-col">
          <div class="store-product-info-block store-product-price-block">
            <div class="store-product-section-label">${view.primaryLabel}</div>
            <div class="store-product-price-main">${view.primaryDisplay}</div>
            ${
							view.showNextBid
								? `<div class="store-product-next-bid">Next minimum bid: ${view.nextBidDisplay}</div>`
								: ''
						}
          </div>

          <div class="store-product-info-block store-product-description">
            <div class="store-product-section-label">Description</div>
            <div class="store-product-desc-body">${descHtml}</div>
          </div>

          <div class="store-product-info-block store-product-purchase-info">
            <div class="store-product-meta-section">
              <div class="store-product-meta-row"><span class="store-product-section-label">Type:</span> <span class="store-product-meta-value">${view.productType}</span></div>
              <div class="store-product-meta-row"><span class="store-product-section-label">File type:</span> <span class="store-product-meta-value">${view.fileType}</span></div>
              <div class="store-product-meta-row"><span class="store-product-section-label">Created:</span> <span class="store-product-meta-value">${view.createdDate}</span></div>
            </div>

            ${
							view.showQuantity
								? `<div class="store-product-qty-selector">
                <label for="store-product-qty-input">Quantity:</label>
                <input id="store-product-qty-input" type="number" min="1" max="${view.supply}" value="1" />
                <span class="store-product-qty-max">(max ${view.supply})</span>
              </div>`
								: ''
						}

            <textarea id="store-product-note-input" class="store-product-note" placeholder="note to seller (size, color, delivery info, etc)"></textarea>
          </div>
        </div>
      </div>

      <div class="store-product-footer">
        <button class="store-product-buy">${view.actionText}</button>
      </div>
    </div>
  `;
};
