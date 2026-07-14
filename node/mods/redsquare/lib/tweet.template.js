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

function formatHandle(handle) {
  const raw = handle != null ? String(handle).trim() : '';

  if (!raw) {
    return '';
  }

  return raw.startsWith('@') ? raw : `@${raw}`;
}

/**
 * Secondary line content — filled by Tweet/compose, never by header logic.
 */
function resolveSecondary(tweet, presentation, options = {}) {
  if (options.secondary != null) {
    return String(options.secondary);
  }

  const handle = formatHandle(tweet.handle);
  const time = tweet.time != null ? String(tweet.time) : '';

  if (presentation === 'compose') {
    return '';
  }

  if (presentation === 'focused') {
    return handle;
  }

  // timeline | root | reply | embedded — single-line meta: @handle · time
  if (handle && time) {
    return `${handle} · ${time}`;
  }

  return handle || time;
}

const TweetTemplate = (tweet, className = 'tweet', options = {}) => {
  const presentation = resolvePresentation(className, options);
  const embedded = presentation === 'embedded' || options.embedded;
  const allowEmbed = options.allowEmbed !== false && !embedded;
  const hideControls = embedded || options.hideControls || presentation === 'compose';

  const header = TweetHeaderTemplate({
    presentation,
    name: tweet.username || '',
    secondary: resolveSecondary(tweet, presentation, options)
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

module.exports = TweetTemplate;
