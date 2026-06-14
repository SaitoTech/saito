module.exports = () => {
	return `
    <div class="store-body">
      <nav class="menu saito-menu-select-subtle" aria-label="Store navigation">
        <div class="store-menu-item active" data-view="featured">Featured</div>
        <div class="store-menu-item" data-view="all">All Listings</div>
        <div class="store-menu-divider" role="separator"></div>
        <div class="store-menu-item" data-view="sell">Sell Something</div>
        <div class="store-menu-item" data-view="my-listings">My Listings</div>
        <div class="store-menu-item" data-view="sales">Sales</div>
      </nav>

      <div class="content">
        <section class="hero">
          <div class="text">Anyone can create a listing and sell directly on Saito.</div>
          <button type="button" class="saito-button-secondary" id="store-sell-btn">Sell Something</button>
        </section>

        <section class="listings" id="store-listings">
          <div class="grid store-teasers"></div>
        </section>
      </div>
    </div>
  `;
};
