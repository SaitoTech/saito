const TweetTemplate = require('../../tweet.template');
const TweetHeaderTemplate = require('../../tweet-header.template');

module.exports = (compose) => {
  const mode = compose.mode || 'post';
  const ariaLabel =
    mode === 'retweet' ? 'Retweet' : mode === 'reply' ? 'Reply' : 'Compose post';
  const submitLabel =
    mode === 'retweet' ? 'Retweet' : mode === 'reply' ? 'Reply' : 'Post';
  const modeClass =
    mode === 'retweet'
      ? 'compose-overlay--retweet'
      : mode === 'reply'
        ? 'compose-overlay--reply'
        : 'compose-overlay--post';

  let replyPreview = '';

  if (compose.reply_to) {
    replyPreview = `
      <div class="compose-reply-preview">
        ${TweetTemplate(compose.reply_to, 'tweet timeline', {
          presentation: 'timeline',
          hideControls: true
        })}
      </div>
    `;
  }

  const authorHeader = TweetHeaderTemplate({
    presentation: 'compose',
    name: compose.display_name,
    secondary: compose.helper_text
  });

  return `
    <div class="compose-overlay ${modeClass}" id="${compose.overlay_id}" aria-label="${ariaLabel}">
      <div class="compose-overlay-body">
        ${replyPreview}

        <div class="compose-composer">
          <img class="compose-author-avatar saito-identicon" src="${compose.avatar}" alt="" />
          <div class="compose-composer-main">
            ${authorHeader}

            <div class="compose-surface" id="redsquare-compose-surface">
              <textarea
                class="compose-input"
                placeholder="${compose.placeholder}"
                rows="4"
                maxlength="${compose.char_limit}"
              ></textarea>

              <div class="compose-gif-placeholder" aria-hidden="true">
                <p>GIF search is coming soon.</p>
                <span class="compose-gif-dismiss" role="button" tabindex="0">Dismiss</span>
              </div>

              <div class="compose-image-preview"></div>
            </div>
          </div>
        </div>
      </div>

      <footer class="compose-overlay-footer">
        <div class="compose-tools saito-menu-select-subtle">
          <div class="compose-tool compose-emoji-btn" role="button" tabindex="0" title="Add emoji">
            <i class="fa-regular fa-face-smile"></i>
          </div>
          <div class="compose-tool compose-image-btn" role="button" tabindex="0" title="Add image">
            <i class="fa-regular fa-image"></i>
          </div>
          <div class="compose-tool compose-gif-btn" role="button" tabindex="0" title="Add GIF">
            <i class="fa-solid fa-photo-film"></i>
          </div>
        </div>

        <div class="compose-footer-actions">
          <div class="compose-char-count" aria-live="polite">
            <span class="compose-char-current">0</span>
            <span class="compose-char-separator">/</span>
            <span class="compose-char-max">${compose.char_limit}</span>
          </div>

          <button class="compose-submit saito-button-primary" type="button">
            <span class="compose-submit-label">${submitLabel}</span>
            <span class="compose-submit-spinner" aria-hidden="true"></span>
          </button>
        </div>
      </footer>

      <div class="compose-posting-screen" aria-hidden="true">
        <div class="compose-posting-loader">
          <div class="saito-loader"></div>
        </div>
        <p class="compose-posting-message">${mode === 'retweet' ? 'Retweeting…' : 'Posting…'}</p>
      </div>

      <input
        class="compose-file-input"
        type="file"
        accept="image/png,image/jpeg,image/jpg,image/gif,image/webp"
        hidden
      />
    </div>
  `;
};
