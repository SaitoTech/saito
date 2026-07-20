module.exports = () => {
	return `
    <ul class="list saito-menu-select-subtle" role="list">
      <li class="item active" role="button" tabindex="0" data-view="featured">Featured</li>
      <li class="item" role="button" tabindex="0" data-view="all">All Listings</li>
      <li class="divider" role="separator"></li>
      <li class="item" role="button" tabindex="0" data-view="sell">Sell Something</li>
      <li class="item" role="button" tabindex="0" data-view="my-listings">My Listings</li>
      <li class="item" role="button" tabindex="0" data-view="sales">Sales</li>
    </ul>
  `;
};
