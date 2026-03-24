module.exports = (data = {}, cardId = '', mediaClass = '', mediaBackground = '', badgeClass = '') => {
	return `
    <div class="store-teaser" id="${cardId}">
      <div class="teaser-media ${mediaClass}" style="background: ${mediaBackground};">
        <button class="teaser-buy-btn">Buy Now</button>
        <div class="teaser-badge ${badgeClass}">
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
