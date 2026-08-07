module.exports = (
  data = {},
  listingAttrs = '',
  mediaClass = '',
  mediaBackground = '',
  showLoading = false
) => {
  const badge =
    data.has_action_text || data.show_buy_now ? `<span class="badge">Buy Now</span>` : '';
  const loader = showLoading
    ? `<i class="fas fa-spinner fa-spin loader" aria-hidden="true"></i>`
    : '';
  const loadingClass = showLoading ? ' loading' : '';
  const price = data.price ? `<p class="price">${data.price}</p>` : '';
  const seller = data.seller ? `<p class="seller">${data.seller}</p>` : '';
  const title = data.title || 'Untitled Item';
  const label = `View listing: ${String(title).replace(/"/g, '&quot;')}`;
  const attrs = listingAttrs ? ` ${listingAttrs}` : '';

  return `
    <article class="teaser"${attrs} role="button" tabindex="0" aria-label="${label}">
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
