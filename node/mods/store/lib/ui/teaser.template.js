module.exports = (data = {}, cardId = '', mediaClass = '', mediaBackground = '', showLoading = false) => {
	const badge = data.has_action_text || data.show_buy_now
		? `<span class="badge">Buy Now</span>`
		: '';
	const loader = showLoading
		? `<i class="fas fa-spinner fa-spin loader" aria-hidden="true"></i>`
		: '';
	const loadingClass = showLoading ? ' loading' : '';
	const subtitle = data.subtitle
		? `<p class="subtitle">${data.subtitle}</p>`
		: '';
	const label = data.title
		? `View listing: ${String(data.title).replace(/"/g, '&quot;')}`
		: 'View listing';

	return `
    <article class="teaser" id="${cardId}" role="button" tabindex="0" aria-label="${label}">
      <div class="media ${mediaClass}${loadingClass}" style="background: ${mediaBackground};">
        ${loader}
        ${badge}
        <img class="saito-identicon" src="${data.identicon}" alt="" />
      </div>
      <div class="info">
        <h3 class="title">${data.title}</h3>
        ${subtitle}
        <p class="seller">${data.seller}</p>
      </div>
    </article>
  `;
};
