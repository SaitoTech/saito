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
          <h2 class="title">Prepare Rental Keys</h2>
        </div>
      </header>

      <div class="body">
        <div class="details">
          <section class="section file">
            <p class="file-name">${sourceName}</p>
            <p class="file-kind">Vault Rental NFT</p>
          </section>

          <p class="lede">
            To rent this item use your Master Rental Key to mint borrower Rental Keys. When users purchase these they will gain and you will lose control of this item for the period specified. You may create as many rental keys as you wish, but they can only be used one-at-a-time.
          </p>

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
              <label class="label" for="rental-amount">Passes to Mint</label>
              <input id="rental-amount" class="saito-input" type="number" min="1" max="100000000" value="${view.amount}" data-field="amount" aria-label="Number of rental-pass NFTs" />
            </div>
            <div class="rental-field">
              <label class="label" for="rental-price">Rental Price</label>
              <input id="rental-price" class="saito-input" type="text" inputmode="decimal" value="${view.priceDisplay}" data-field="price" aria-label="Rental price" />
            </div>
          </section>
        </div>
      </div>

      <footer class="checkout">
        <div class="saito-button-row">
          <button type="button" class="saito-button-primary" data-action="create">Continue</button>
        </div>
      </footer>
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
            <button type="button" class="saito-button-primary action" data-action="submit">List on Store</button>
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
