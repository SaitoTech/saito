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

    const description = view.hasDescription ? view.description : 'No description provided.';
    const loader = view.imageLoading
      ? `<i class="fas fa-spinner fa-spin loader" aria-hidden="true"></i>`
      : '';
    const imageAlt = view.listingTitle
      ? String(view.listingTitle).replace(/"/g, '&quot;')
      : 'Listing image';

    const quantity = view.showQuantity
      ? `<div class="quantity">
          <label for="listing-qty">Quantity</label>
          <input class="saito-input" id="listing-qty" type="number" min="1" max="${view.supply}" value="1" />
          <span class="hint">max ${view.supply}</span>
        </div>`
      : '';

    const nextBid = view.showNextBid
      ? `<p class="next-bid">Next minimum bid ${view.nextBidDisplay}</p>`
      : '';

    return `
    <article class="listing-detail view">
      <header>
        <img class="saito-identicon" src="${view.identicon}" alt="" />
        <div class="meta">
          <h2 class="title" id="listing-detail-title"><span class="title-text">${view.listingTitle}</span></h2>
          <p class="creator">${view.seller}</p>
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
          <section class="section price">
            <p class="label">${view.primaryLabel}</p>
            <p class="amount">${view.primaryDisplay}</p>
            ${nextBid}
          </section>

          <section class="section description">
            <h3 class="label">Description</h3>
            <p class="text">${description}</p>
          </section>

          <section class="section meta-facts">
            <dl class="facts">
              <div><dt>Type</dt><dd>${view.productType}</dd></div>
              <div><dt>File</dt><dd>${view.fileType}</dd></div>
              <div><dt>Listed</dt><dd>${view.createdDate}</dd></div>
            </dl>
          </section>

          <section class="section checkout">
            ${quantity}
            <textarea id="listing-note" class="saito-textarea note" placeholder="Note to seller (optional)" aria-label="Note to seller"></textarea>
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
