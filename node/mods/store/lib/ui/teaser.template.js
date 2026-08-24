function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

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
  const title = escapeHtml(data.title || 'Untitled Item');
  const price = data.price ? `<p class="price">${escapeHtml(data.price)}</p>` : '';
  const seller = data.seller ? `<p class="seller">${escapeHtml(data.seller)}</p>` : '';
  const label = `View listing: ${title}`;
  const attrs = listingAttrs ? ` ${listingAttrs}` : '';
  const identicon = escapeHtml(data.identicon || '');
  const safeBackground = escapeHtml(mediaBackground || '');

  return `
    <article class="teaser"${attrs} role="button" tabindex="0" aria-label="${label}">
      <div class="media ${escapeHtml(mediaClass)}${loadingClass}" style="background: ${safeBackground};">
        ${loader}
        ${badge}
        <img class="saito-identicon" src="${identicon}" alt="" />
      </div>
      <div class="info">
        <h3 class="title">${title}</h3>
        ${seller}
        ${price}
      </div>
    </article>
  `;
};
