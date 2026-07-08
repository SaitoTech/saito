module.exports = (data = {}, cardId = '', mediaClass = '', mediaBackground = '', badgeClass = '', showLoading = false) => {
	const actionSlot = data.has_action_text || data.show_buy_now
		? `<div class="card-action-slot">Buy Now</div>`
		: '';
	const loadingSlot = showLoading
		? `<div class="teaser-media-loading-indicator" aria-hidden="true"></div>`
		: '';

	return `
    <div class="store-teaser" id="${cardId}">
      <div class="teaser-media ${mediaClass}${showLoading ? ' teaser-media-loading' : ''}" style="background: ${mediaBackground};">
        ${loadingSlot}
        ${actionSlot}
        <div class="teaser-identicon">
          <img src="${data.identicon}" />
        </div>
      </div>
      <div class="teaser-info">
        <div class="teaser-title">${data.title}</div>
        <div class="teaser-subtitle">${data.subtitle}</div>
        <div class="teaser-seller">seller: ${data.seller}</div>
      </div>
    </div>
  `;
};
