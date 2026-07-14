const TweetHeaderTemplate = require('./tweet-header.template');
const TweetBodyTemplate = require('./tweet-body.template');
const TweetGalleryTemplate = require('./tweet-gallery.template');
const TweetFooterTemplate = require('./tweet-footer.template');

function resolvePresentation(className = '', options = {}) {
  if (options.presentation) {
    return options.presentation;
  }

  if (options.embedded || String(className).includes('embedded')) {
    return 'embedded';
  }

  if (options.focused || String(className).includes('focused')) {
    return 'focused';
  }

  if (options.root || String(className).includes('root')) {
    return 'root';
  }

  if (options.reply || String(className).includes('reply')) {
    return 'reply';
  }

  return 'timeline';
}

/**
 * Public-key meta for headers — always the key, never a duplicate of the username.
 */
function formatHandle(tweet = {}) {
  if (tweet.handle != null && String(tweet.handle).trim() !== '') {
    const raw = String(tweet.handle).trim();
    return raw.startsWith('@') ? raw : `@${raw}`;
  }

  const key = tweet.publicKey != null ? String(tweet.publicKey).trim() : '';
  return key ? `@${key}` : '';
}

function resolveHeaderMode(presentation) {
  if (presentation === 'focused') {
    return 'expanded';
  }

  if (presentation === 'compose') {
    return 'compose';
  }

  return 'compact';
}

const TweetTemplate = (tweet, className = 'tweet', options = {}) => {
  const presentation = resolvePresentation(className, options);
  const embedded = presentation === 'embedded' || options.embedded;
  const allowEmbed = options.allowEmbed !== false && !embedded;
  const hideControls = embedded || options.hideControls || presentation === 'compose';
  const mode = options.mode || resolveHeaderMode(presentation);

  const handle =
    options.handle != null ? String(options.handle) : mode === 'compose' ? '' : formatHandle(tweet);
  const time =
    options.time != null
      ? String(options.time)
      : mode === 'compact' && tweet.time
        ? String(tweet.time)
        : '';

  const header = TweetHeaderTemplate({
    mode,
    presentation,
    name: tweet.username || '',
    handle,
    time,
    secondary: options.secondary != null ? String(options.secondary) : ''
  });

  const body = TweetBodyTemplate({
    presentation,
    text: tweet.text
  });

  const gallery = TweetGalleryTemplate({
    presentation,
    images: tweet.images
  });

  let embed = '';

  if (allowEmbed && tweet.embedded) {
    embed = `
      <div class="tweet-embed">
        ${TweetTemplate(tweet.embedded, 'tweet embedded', {
          presentation: 'embedded',
          embedded: true,
          allowEmbed: false
        })}
      </div>
    `;
  }

  const footer = hideControls
    ? ''
    : TweetFooterTemplate({
        presentation,
        replies: tweet.replies,
        retweets: tweet.retweets,
        likes: tweet.likes
      });

  // Absolute-style timestamp under body for focused (relative value for now).
  const timeBlock =
    presentation === 'focused' && tweet.time
      ? `<div class="tweet-time ${presentation}">${tweet.time}</div>`
      : '';

  const chain = embedded ? '' : '<div class="tweet-chain" aria-hidden="true"></div>';

  return `
    <article class="${className}" data-id="${tweet.signature}" data-presentation="${presentation}">
      ${chain}
      <img class="tweet-avatar saito-identicon" src="${tweet.avatar}" alt="${tweet.username}" />
      <div class="tweet-content">
        ${header}
        ${body}
        ${gallery}
        ${embed}
        ${timeBlock}
        ${footer}
      </div>
    </article>
  `;
};

TweetTemplate.resolvePresentation = resolvePresentation;
TweetTemplate.formatHandle = formatHandle;
TweetTemplate.resolveHeaderMode = resolveHeaderMode;

module.exports = TweetTemplate;
