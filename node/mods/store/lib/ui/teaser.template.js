module.exports = (data = {}, cardId = '', mediaClass = '', badgeClass = '') => {
	return `
    <div class="store-teaser" id="${cardId}">
      <div class="teaser-media ${mediaClass}">
        <button class="buy-btn">Buy Now</button>
        <div class="badge ${badgeClass}"></div>
      </div>
      <div class="teaser-info">
        <div class="title">${data.title}</div>
        <div class="subtitle">${data.subtitle}</div>
        <div class="seller">seller: ${data.seller}</div>
      </div>
    </div>
  `;
};
