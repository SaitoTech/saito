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
	return `
    <div class="store-product-overlay">
      <div class="store-product-header">
        <div class="store-product-header-left">
          <div class="store-product-identicon">
            <img src="${view.identicon}" />
          </div>

          <div class="store-product-meta">
            <div class="store-product-title">${view.title}</div>
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
            <img class="store-product-main-image" src="${view.images[0]}" />
          </div>
          ${view.hasGallery ? `<div class="store-product-thumbs">${thumbHtml}</div>` : ''}
        </div>

        <div class="store-product-info-col">
          <div class="store-product-info-block store-product-price-block">
            <div class="store-product-price-label">${view.primaryLabel}</div>
            <div class="store-product-price-main">${view.primaryDisplay}</div>
            ${
							view.showNextBid
								? `<div class="store-product-next-bid">Next minimum bid: ${view.nextBidDisplay}</div>`
								: ''
						}
          </div>

          <div class="store-product-info-block store-product-description">
            <div class="store-product-desc-header">Description</div>
            <div class="store-product-desc-body">${descHtml}</div>
          </div>

          <div class="store-product-info-block store-product-purchase-info">
            <div class="store-product-meta-section">
              <div><strong>Type:</strong> ${view.productType}</div>
              <div><strong>File type:</strong> ${view.fileType}</div>
              <div><strong>Created:</strong> ${view.createdDate}</div>
              <div><strong>Quantity available:</strong> ${view.supply}</div>
            </div>

            ${
							view.showQuantity
								? `<div class="store-product-qty-selector">
                <label for="store-product-qty-input">Quantity</label>
                <input id="store-product-qty-input" type="number" min="1" max="${view.supply}" value="1" />
              </div>`
								: ''
						}

            <div class="store-product-message-section">
              <label class="store-product-note-label">Message to seller</label>
              <textarea class="store-product-note" placeholder="Add note (size, color, delivery details, etc.)"></textarea>
            </div>
          </div>
        </div>
      </div>

      <div class="store-product-footer">
        <button class="store-product-buy">${view.actionText}</button>
      </div>
    </div>
  `;
};
