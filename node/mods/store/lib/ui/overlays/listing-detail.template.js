module.exports = {
  viewTemplate: (view) => {
    const thumbs = view.hasGallery
      ? `<div class="thumbs" role="list">${view.images
          .map(
            (src, idx) => `
          <button type="button" class="thumb${idx === 0 ? ' active' : ''}" role="listitem" data-src="${src}" aria-label="View image ${idx + 1}" aria-pressed="${idx === 0 ? 'true' : 'false'}">
            <img src="${src}" alt="" />
          </button>`
          )
          .join('')}</div>`
      : '';

    const loader = view.imageLoading
      ? `<i class="fas fa-spinner fa-spin loader" aria-hidden="true"></i>`
      : '';
    const imageAlt = view.listingTitle || 'Listing image';
    const nextBid = view.showNextBid
      ? `<p class="next-bid">Next minimum bid ${view.nextBidDisplay}</p>`
      : '';
    const rentalFacts = view.isRental
      ? `${view.rentalDuration ? `<div><dt>Duration</dt><dd>${view.rentalDuration}</dd></div>` : ''}${view.rentalRights ? `<div><dt>Rights</dt><dd>${view.rentalRights}</dd></div>` : ''}`
      : '';

    const description = view.hasDescription
      ? `<section class="section description">
            <h3 class="label">Description</h3>
            <p class="text">${view.description}</p>
            ${rentalFacts ? `<dl class="facts rental-facts">${rentalFacts}</dl>` : ''}
          </section>`
      : '';

    const fallbackFacts = [
      view.showType ? `<div><dt>Type</dt><dd>${view.productType}</dd></div>` : '',
      !view.hasDescription ? rentalFacts : '',
      view.showFile ? `<div><dt>File</dt><dd>${view.fileType}</dd></div>` : '',
      view.createdDate ? `<div><dt>Listed</dt><dd>${view.createdDate}</dd></div>` : ''
    ]
      .filter(Boolean)
      .join('');
    const fallback = !view.hasDescription && fallbackFacts
      ? `<section class="section meta-facts"><dl class="facts">${fallbackFacts}</dl></section>`
      : '';

    const quantity =
      view.showQuantity
        ? `<div class="quantity">
            <p class="label" id="listing-qty-label">Quantity</p>
            <div class="qty-stepper">
              <button type="button" data-qty="down" aria-label="Decrease quantity" disabled>−</button>
              <input id="listing-qty" type="text" inputmode="numeric" min="1" max="${view.supply}" value="1" aria-labelledby="listing-qty-label" />
              <button type="button" data-qty="up" aria-label="Increase quantity"${Number(view.supply) <= 1 ? ' disabled' : ''}>+</button>
            </div>
          </div>`
        : '';

    const note = view.isRental
      ? `<p class="rental-note">One rental NFT is transferred per rent. This grants temporary access to the protected file for the listed duration.</p>`
      : `<div class="note-field">
          <label class="note-label" for="listing-note">note to seller (optional)</label>
          <textarea id="listing-note" class="saito-textarea note" aria-label="note to seller (optional)"></textarea>
          <p class="note-help">Include your mailing address or any special instructions for the seller.</p>
        </div>`;

    const share = view.canShare
      ? '<button type="button" class="saito-icon-button share" data-action="share" aria-label="Share listing" title="Share listing"><i class="fas fa-share-nodes" aria-hidden="true"></i></button>'
      : '';
    const availableLabel = Number(view.supply) === 1 ? '1 available' : `${view.supply} available`;

    return `
    <article class="listing-detail view${view.isRental ? ' rental' : ''}">
      <header>
        <img class="saito-identicon" src="${view.identicon}" alt="" />
        <div class="meta">
          <h2 class="title" id="listing-detail-title"><span class="title-text">${view.listingTitle}</span>${share}</h2>
          <p class="meta-row nft-id">
            <span class="meta-label">NFT ID:</span>
            <span class="meta-value" title="${view.nftId}">${view.nftIdDisplay}</span>
          </p>
          <p class="meta-row seller">
            <span class="meta-label">SELLER:</span>
            <span class="meta-value${view.sellerIsKey ? ' is-key' : ''}">${view.seller}</span>
          </p>
        </div>
      </header>

      <div class="body">
        <div class="gallery">
          <div class="media">
            ${loader}
            <img class="image" src="${view.images[0]}" alt="${imageAlt}" />
          </div>
          ${thumbs}
        </div>

        <div class="details">
          <section class="section purchase-controls">
            <div class="purchase-price">
              <p class="label">${view.primaryLabel}</p>
              <p class="amount" data-price-amount data-unit="${view.unitAmount}" data-currency="${view.currencyCode}">${view.primaryDisplay}</p>
              ${view.showQuantity ? `<p class="price-note">per unit · ${availableLabel}</p>` : ''}
              ${nextBid}
            </div>
            ${quantity}
          </section>

          ${description}
          ${fallback}

          <section class="section checkout">
            ${note}
            <button type="button" class="saito-button-primary action" data-action="buy">${view.actionText}</button>
          </section>
        </div>
      </div>
    </article>
  `;
  },

  editTemplate: (view) => {
    const description = view.description || 'No description provided.';
    return `
    <article class="listing-detail edit">
      <header>
        <img class="saito-identicon" src="${view.nftIdenticon}" alt="" />
        <div class="meta">
          <h2 class="title">
            <span class="title-text" data-field="title">${view.listingTitle}</span><button type="button" class="saito-icon-button" data-edit="title" aria-label="Edit title"><i class="fas fa-pen" aria-hidden="true"></i></button>
          </h2>
          <p class="creator">${view.creatorDisplay}</p>
        </div>
      </header>

      <div class="body">
        <div class="gallery">
          <div class="media">
            ${view.mediaHtml}
          </div>
        </div>

        <div class="details">
          <section class="section price">
            <p class="label">Price</p>
            <p class="amount">
              <span data-field="price">${view.priceDisplay}</span><button type="button" class="saito-icon-button" data-edit="price" aria-label="Edit price"><i class="fas fa-pen" aria-hidden="true"></i></button>
            </p>
          </section>

          <section class="section description">
            <h3 class="label">Description</h3>
            <p class="text">
              <span data-field="description">${description}</span><button type="button" class="saito-icon-button" data-edit="description" aria-label="Edit description"><i class="fas fa-pen" aria-hidden="true"></i></button>
            </p>
          </section>

          <section class="section meta-facts">
            <dl class="facts">
              <div><dt>Type</dt><dd>${view.productType}</dd></div>
              <div><dt>File</dt><dd>${view.fileType}</dd></div>
              <div><dt>Listed</dt><dd>${view.createdDate}</dd></div>
              <div>
                <dt>Available</dt>
                <dd>
                  <span data-field="available">${view.supply}</span><button type="button" class="saito-icon-button" data-edit="available" aria-label="Edit available quantity"><i class="fas fa-pen" aria-hidden="true"></i></button>
                </dd>
              </div>
            </dl>
          </section>

          <section class="section category">
            <h3 class="label">Category</h3>
            <select data-field="category" aria-label="Listing category"></select>
          </section>

          <section class="section checkout">
            <button type="button" class="saito-button-primary action" data-action="submit">Submit Listing</button>
          </section>
        </div>
      </div>
    </article>
  `;
  },

  mediaImage: (src) => {
    return `<img class="image" src="${src}" alt="" />`;
  },

  mediaText: (text) => {
    return `<div class="saito-nft-card-text media-text">${text}</div>`;
  }
};
