const TweetTemplate = (tweet, className = 'tweet', options = {}) => {
  const embedded = options.embedded || className.includes('tweet-embedded');
  const allowEmbed = options.allowEmbed !== false && !embedded;

  const hasText = tweet.text && String(tweet.text).trim() !== '';
  const images = Array.isArray(tweet.images) ? tweet.images.slice(0, 4) : [];
  const hasGallery = images.length > 0;
  const hasEmbed = allowEmbed && tweet.embedded;

  let body = '';
  if (hasText) {
    body = `<div class="tweet-body">${tweet.text}</div>`;
  }

  let gallery = '';
  if (hasGallery) {
    const count = Math.min(images.length, 4);
    const items = images
      .map((img) => `<figure class="tweet-gallery-item"><img src="${img}" alt="" loading="lazy" /></figure>`)
      .join('');

    gallery = `
      <div class="tweet-gallery count-${count}">
        <div class="tweet-gallery-grid">
          ${items}
        </div>
      </div>
    `;
  }

  let embed = '';
  if (hasEmbed) {
    embed = `
      <div class="tweet-embed">
        ${TweetTemplate(tweet.embedded, 'tweet tweet-embedded', { embedded: true, allowEmbed: false })}
      </div>
    `;
  }

  const chain = embedded
    ? ''
    : '<div class="tweet-chain" aria-hidden="true"></div>';

  const footer = embedded || options.hideControls
    ? ''
    : `
      <footer class="tweet-footer">
        <div class="tweet-controls saito-menu-select-subtle">
          <div class="tweet-tool tweet-tool-comment" title="Reply/Comment">
            <span class="tweet-tool-comment-count">${tweet.replies}</span>
            <i class="far fa-comment"></i>
          </div>
          <div class="tweet-tool tweet-tool-retweet" title="Retweet/Quote-tweet">
            <span class="tweet-tool-retweet-count">${tweet.retweets}</span>
            <i class="fa fa-repeat"></i>
          </div>
          <div class="tweet-tool tweet-tool-like" title="Like tweet">
            <span class="tweet-tool-like-count">${tweet.likes}</span>
            <i class="far fa-heart"></i>
          </div>
          <div class="tweet-tool tweet-tool-share" title="Copy link to tweet">
            <i class="fa-solid fa-share-nodes"></i>
          </div>
          <div class="tweet-tool tweet-tool-more" title="More options">
            <i class="fa-solid fa-ellipsis"></i>
          </div>
        </div>
        <div class="tweet-show-more" role="button" tabindex="0">Show more posts</div>
      </footer>
    `;

  return `
    <article class="${className}" data-id="${tweet.signature}">
      ${chain}
      <img class="tweet-avatar saito-identicon" src="${tweet.avatar}" alt="${tweet.username}" />
      <div class="tweet-content">
        <header class="tweet-header">
          <span class="saito-address">${tweet.username}</span>
          <span class="saito-userline">${tweet.time}</span>
        </header>
        ${body}
        ${gallery}
        ${embed}
        ${footer}
      </div>
    </article>
  `;
};

module.exports = TweetTemplate;
