module.exports = (data = {}, cardId = '', mediaClass = '', mediaBackground = '', showLoading = false) => {
	const isPending = !!data.pending;
	const badge = isPending
		? `<span class="badge pending">Listing in progress…</span>`
		: data.has_action_text || data.show_buy_now
			? `<span class="badge">Buy Now</span>`
			: '';
	const loader = showLoading || isPending
		? `<i class="fas fa-spinner fa-spin loader" aria-hidden="true"></i>`
		: '';
	const loadingClass = showLoading || isPending ? ' loading' : '';
	const pendingClass = isPending ? ' is-pending' : '';
	const price = data.price
		? `<p class="price">${data.price}</p>`
		: '';
	const seller = data.seller
		? `<p class="seller">${data.seller}</p>`
		: '';
	const title = data.title || 'Untitled Item';
	const label = isPending
		? `Pending listing: ${String(title).replace(/"/g, '&quot;')}`
		: `View listing: ${String(title).replace(/"/g, '&quot;')}`;

	return `
    <article class="teaser${pendingClass}" id="${cardId}" role="button" tabindex="0" aria-label="${label}"${isPending ? ' aria-disabled="true"' : ''}>
      <div class="media ${mediaClass}${loadingClass}" style="background: ${mediaBackground};">
        ${loader}
        ${badge}
        <img class="saito-identicon" src="${data.identicon}" alt="" />
      </div>
      <div class="info">
        <h3 class="title">${title}</h3>
        ${seller}
        ${price}
      </div>
    </article>
  `;
};
