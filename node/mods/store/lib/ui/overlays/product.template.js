module.exports = (app, mod, product) => {
	const identicon =
		app?.keychain?.returnIdenticon?.(product?.seller || product?.id) || '';
	const title = product?.title || 'Featured Store Item';
	const seller = product?.seller || 'anon-store';
	const image =
		product?.image && !product.image.startsWith('gradient-')
			? product.image
			: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1200' height='800'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' x2='1' y1='0' y2='1'%3E%3Cstop stop-color='%23132736'/%3E%3Cstop offset='1' stop-color='%233c8fcb'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='1200' height='800' fill='url(%23g)'/%3E%3C/svg%3E";

	return `
    <div class="store-product-overlay">
      <div class="store-product-header">
        <div class="store-product-header-left">
          <div class="store-product-identicon">
            <img src="${identicon}" />
          </div>

          <div class="store-product-meta">
            <div class="store-product-title">${title}</div>
            <div class="store-product-seller">${seller}</div>
          </div>
        </div>

        <div class="store-product-menu" aria-label="menu">
          <span class="store-product-menu-line"></span>
          <span class="store-product-menu-line"></span>
          <span class="store-product-menu-line"></span>
        </div>
      </div>

      <div class="store-product-media">
        <img src="${image}" />
      </div>

      <div class="store-product-footer">
        <button class="store-product-buy">Buy</button>
      </div>
    </div>
  `;
};
