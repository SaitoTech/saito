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
 * Public key for detail headers — raw key, never an @handle.
 */
function formatPublicKey(tweet = {}) {
  const key =
    tweet.publicKey != null && String(tweet.publicKey).trim() !== ''
      ? String(tweet.publicKey).trim()
      : tweet.handle != null
        ? String(tweet.handle).trim()
        : '';

  return key.replace(/^@/, '');
}

/** @deprecated use formatPublicKey — kept for callers that still import formatHandle */
function formatHandle(tweet = {}) {
  return formatPublicKey(tweet);
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

  // Timeline: no key. Detail: public key only (no @). Compose: none.
  const handle =
    options.handle != null
      ? String(options.handle).replace(/^@/, '')
      : mode === 'expanded'
        ? formatPublicKey(tweet)
        : '';

  const time = options.time != null ? String(options.time) : tweet.time ? String(tweet.time) : '';

  const header = TweetHeaderTemplate({
    mode,
    presentation,
    name: tweet.username || '',
    handle,
    time: mode === 'compose' ? '' : time,
    secondary: options.secondary != null ? String(options.secondary) : ''
  });

  const body = TweetBodyTemplate({
    text:
      tweet.app && tweet.app.browser
        ? tweet.app.browser.sanitize(tweet.app.browser.markupMentions(tweet?.text || ''), true)
        : tweet.text
  });

  const gallery = TweetGalleryTemplate({
    images: tweet.images
  });

  let embed = '';

  if (allowEmbed && tweet.embedded) {
    embed = `
      <div class="embed">
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
        replies: tweet.replies,
        retweets: tweet.retweets,
        likes: tweet.likes
      });

  const chain = embedded ? '' : '<div class="chain" aria-hidden="true"></div>';

  return `
    <article class="${className}" data-id="${tweet.signature}">
      ${chain}
      <img class="avatar saito-identicon" src="${tweet.avatar}" alt="${tweet.username}" />
      <div class="content">
        ${header}
        ${body}
        ${gallery}
        ${embed}
        ${footer}
      </div>
    </article>
  `;
};

TweetTemplate.resolvePresentation = resolvePresentation;
TweetTemplate.formatPublicKey = formatPublicKey;
TweetTemplate.formatHandle = formatHandle;
TweetTemplate.resolveHeaderMode = resolveHeaderMode;

module.exports = TweetTemplate;
