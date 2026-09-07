/**
 * Post Teaser Template
 *
 * Editorial-style blog post preview.
 * Root namespace: .post-teaser
 * Modifier: .post-teaser.compact — denser layout for parent slots (e.g. view-post footer)
 */
module.exports = (app, mod, post, options = {}) => {
  let data = {};
  let timestamp = null;
  let postId = '';
  let publicKey = '';

  if (post && post.msg) {
    const msg = post.returnMessage ? post.returnMessage() : post.msg;
    data = msg.data || {};
    timestamp = post.timestamp || data.timestamp || null;
    postId = post.signature || post.id || '';
    publicKey = post.from && post.from.length > 0 ? post.from[0].publicKey : '';
  } else {
    data = post || {};
    timestamp = post.timestamp || null;
    postId = post.id || post.signature || post.sig || '';
    publicKey = post.publicKey || (post.author && post.author.publicKey) || post.author || '';
  }

  const title = data.title || 'Untitled post';
  const subtitle = data.subtitle || null;
  const summary = data.summary || data.excerpt || null;
  const image = data.image || null;
  const imageUrl = data.imageUrl || null;

  let displayImage = imageUrl || '/saito/img/dreamscape.png';
  if (image && !imageUrl) {
    const mimeType = 'image/png';
    displayImage = `data:image/${mimeType};base64,${image}`;
  }

  let dateString = null;
  if (timestamp && app.browser.formatDate) {
    const date = app.browser.formatDate(timestamp);
    if (date) {
      dateString = `${date.month} ${date.day}, ${date.year}`;
    }
  }

  const description = subtitle || summary;
  let displayDescription = null;
  if (description) {
    const maxLength = 120;
    displayDescription =
      description.length > maxLength
        ? description.substring(0, maxLength).trim() + '...'
        : description;
  }

  const compact = options.compact === true;
  const rootClass = compact ? 'post-teaser compact' : 'post-teaser';

  return `
    <article class="${rootClass}" data-tx-signature="${postId}" data-post-id="${postId}" data-public-key="${publicKey}">
      <div class="image">
        <img src="${app.browser.escapeHTML(displayImage)}" alt="${app.browser.escapeHTML(title)}" />
      </div>

      <div class="content">
        <h3 class="title">${app.browser.escapeHTML(title)}</h3>

        ${
          displayDescription
            ? `
          <p class="excerpt">${app.browser.escapeHTML(displayDescription)}</p>
        `
            : ''
        }

        ${
          dateString
            ? `
          <div class="meta">
            <time class="date">${dateString}</time>
          </div>
        `
            : ''
        }
      </div>
    </article>
  `;
};
