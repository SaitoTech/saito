const TweetTemplate = require('../../tweet.template');
const TweetHeaderTemplate = require('../../tweet-header.template');

module.exports = (compose) => {
  const mode = compose.mode || 'post';
  const ariaLabel =
    mode === 'retweet' ? 'Retweet' : mode === 'reply' ? 'Reply' : 'Compose post';
  const submitLabel =
    mode === 'retweet' ? 'Retweet' : mode === 'reply' ? 'Reply' : 'Post';

  let replyPreview = '';

  if (compose.reply_to) {
    replyPreview = `
      <div class="reply-preview">
        ${TweetTemplate(compose.reply_to, 'tweet preview', {
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
    <div class="compose ${mode}" id="${compose.overlay_id}" aria-label="${ariaLabel}">
      <div class="body">
        ${replyPreview}

        <div class="composer">
          <img class="avatar saito-identicon" src="${compose.avatar}" alt="" />
          <div class="main">
            ${authorHeader}

            <div class="surface" id="redsquare-compose-surface">
              <textarea
                class="input"
                placeholder="${compose.placeholder}"
                rows="4"
                maxlength="${compose.char_limit}"
              ></textarea>

              <div class="gif-placeholder" aria-hidden="true">
                <p>GIF search is coming soon.</p>
                <span class="gif-dismiss" role="button" tabindex="0">Dismiss</span>
              </div>

              <div class="image-preview"></div>
            </div>
          </div>
        </div>
      </div>

      <footer class="footer">
        <div class="tools saito-menu-select-subtle">
          <div class="tool emoji" role="button" tabindex="0" title="Add emoji">
            <i class="fa-regular fa-face-smile"></i>
          </div>
          <div class="tool image" role="button" tabindex="0" title="Add image">
            <i class="fa-regular fa-image"></i>
          </div>
          <div class="tool gif" role="button" tabindex="0" title="Add GIF">
            <i class="fa-solid fa-photo-film"></i>
          </div>
        </div>

        <div class="actions">
          <div class="char-count" aria-live="polite">
            <span class="current">0</span>
            <span class="separator">/</span>
            <span class="max">${compose.char_limit}</span>
          </div>

          <button class="submit saito-button-primary" type="button">
            <span class="label">${submitLabel}</span>
            <span class="spinner" aria-hidden="true"></span>
          </button>
        </div>
      </footer>

      <div class="posting-screen" aria-hidden="true">
        <div class="posting-loader">
          <div class="saito-loader"></div>
        </div>
        <p class="posting-message">${mode === 'retweet' ? 'Retweeting…' : 'Posting…'}</p>
      </div>

      <input
        class="file-input"
        type="file"
        accept="image/png,image/jpeg,image/jpg,image/gif,image/webp"
        hidden
      />
    </div>
  `;
};
