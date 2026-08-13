function durationLabel(hours) {
  const n = Number(hours) || 1;
  return n === 1 ? '1 hour' : `${n} hours`;
}

function rightsLabel(rights = 'all') {
  return String(rights || 'all').toLowerCase() === 'all' ? 'All rights' : String(rights);
}

module.exports = {
  durationLabel,
  rightsLabel,

  infoTemplate: (view) => {
    const durationOptions = Array.from({ length: 24 }, (_, i) => {
      const hours = i + 1;
      const selected = Number(view.durationHours) === hours ? ' selected' : '';
      return `<option value="${hours}"${selected}>${durationLabel(hours)}</option>`;
    }).join('');

    const sourceName = view.sourceName || 'Protected file';

    return `
    <article class="rental-listing info">
      <header>
        <div class="meta">
          <h2 class="title">List this item to rent</h2>
        </div>
      </header>

      <div class="body">
        <div class="details">
          <p class="lede">
            To rent assets using the Saito Store, you must create an NFT that provides buyers with temporary access. Provide the details below and click “Continue” to start the standard NFT creation process and provide the title and description for your item. You will be brought back here once your rental NFTs have been created and are ready for listing on the Store.
          </p>

          <section class="section file">
            <p class="label">File to rent</p>
            <p class="file-name">${sourceName}</p>
            <p class="file-kind">Vault Rental NFT</p>
          </section>

          <section class="section rental-fields">
            <div class="rental-field">
              <label class="label" for="rental-duration">Duration</label>
              <select id="rental-duration" class="saito-form-select" data-field="duration" aria-label="Rental duration">
                ${durationOptions}
              </select>
            </div>
            <div class="rental-field">
              <label class="label" for="rental-rights">Rights</label>
              <select id="rental-rights" class="saito-form-select" data-field="rights" aria-label="Rental rights">
                <option value="all" selected>All rights</option>
              </select>
            </div>
            <div class="rental-field">
              <label class="label" for="rental-amount">Amount</label>
              <input id="rental-amount" class="saito-input" type="number" min="1" max="100000000" value="${view.amount}" data-field="amount" aria-label="Number of rental NFTs" />
            </div>
            <div class="rental-field">
              <label class="label" for="rental-price-display">Rental Price</label>
              <div class="price-inline" id="rental-price-display">
                <span data-field="price">${view.priceDisplay}</span><button type="button" class="saito-icon-button" data-edit="price" aria-label="Edit rental price"><i class="fas fa-pen" aria-hidden="true"></i></button>
              </div>
            </div>
          </section>

          <section class="section checkout">
            <button type="button" class="saito-button-primary" data-action="create">Continue</button>
          </section>
        </div>
      </div>
    </article>
  `;
  },

  readyTemplate: (view) => {
    const description = view.description || 'No description provided.';
    const duration = durationLabel(view.durationHours);
    const rights = rightsLabel(view.rights);

    return `
    <article class="listing-detail edit rental-ready">
      <header>
        <img class="saito-identicon" src="${view.nftIdenticon}" alt="" />
        <div class="meta">
          <h2 class="title">
            <span class="title-text" data-field="title">${view.listingTitle}</span><button type="button" class="saito-icon-button" data-edit="title" aria-label="Edit title"><i class="fas fa-pen" aria-hidden="true"></i></button>
          </h2>
          <p class="creator">Store Rental NFT</p>
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
            <p class="label">Rental Price</p>
            <p class="amount">
              <span data-field="price">${view.priceDisplay}</span><button type="button" class="saito-icon-button" data-edit="price" aria-label="Edit rental price"><i class="fas fa-pen" aria-hidden="true"></i></button>
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
              <div><dt>Type</dt><dd>store-nft-rental</dd></div>
              <div><dt>Duration</dt><dd>${duration}</dd></div>
              <div><dt>Rights</dt><dd>${rights}</dd></div>
              <div><dt>Amount</dt><dd data-field="amount">${view.amount}</dd></div>
              <div><dt>Listed</dt><dd>${view.createdDate}</dd></div>
            </dl>
          </section>

          <section class="section checkout">
            <button type="button" class="saito-button-primary action" data-action="submit">Submit Rental Listing</button>
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
