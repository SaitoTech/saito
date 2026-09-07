module.exports = {
  viewTemplate: (view) => {
    const description = view.hasDescription ? view.description : 'No description provided.';
    const loader = view.imageLoading
      ? `<i class="fas fa-spinner fa-spin loader" aria-hidden="true"></i>`
      : '';
    const imageAlt = view.listingTitle || 'Listing image';

    return `
    <article class="listing-detail delist view">
      <header>
        <img class="saito-identicon" src="${view.identicon}" alt="" />
        <div class="meta">
          <h2 class="title" id="delist-overlay-title"><span class="title-text">${view.listingTitle}</span></h2>
          <p class="creator">${view.seller}</p>
        </div>
      </header>

      <div class="body">
        <div class="gallery">
          <div class="media">
            ${loader}
            <img class="image" src="${view.images[0]}" alt="${imageAlt}" />
          </div>
        </div>

        <div class="details">
          <section class="section price">
            <p class="label">${view.primaryLabel}</p>
            <p class="amount">${view.primaryDisplay}</p>
          </section>

          <section class="section description">
            <h3 class="label">Description</h3>
            <p class="text">${description}</p>
          </section>

          <section class="section meta-facts">
            <dl class="facts">
              <div><dt>Type</dt><dd>${view.productType}</dd></div>
              <div><dt>Quantity</dt><dd>${view.supply}</dd></div>
              <div><dt>Listed</dt><dd>${view.createdDate}</dd></div>
            </dl>
          </section>

          <section class="section checkout">
            <p class="delist-note">Remove this listing and return the NFT inventory to your wallet.</p>
            <button type="button" class="saito-button-primary action" data-action="delist">Delist Asset</button>
          </section>
        </div>
      </div>
    </article>
  `;
  }
};
