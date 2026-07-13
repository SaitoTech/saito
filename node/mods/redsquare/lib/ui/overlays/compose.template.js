module.exports = (compose) => {
  const title = compose.parent_tweet ? 'Reply' : 'New post';
  const submitLabel = compose.parent_tweet ? 'Reply' : 'Post';

  return `
    <section class="compose-overlay" id="${compose.overlay_id}" aria-label="${title}">
      <header class="compose-overlay-header">
        <button class="compose-close" type="button" aria-label="Close">
          <i class="fa-solid fa-xmark"></i>
        </button>
        <h2 class="compose-overlay-title">${title}</h2>
      </header>

      <div class="compose-overlay-body">
        <div class="compose-author">
          <img class="compose-author-avatar" src="${compose.avatar}" alt="" />
          <div class="compose-author-meta">
            <span class="compose-author-name">${compose.display_name}</span>
            <span class="compose-author-handle">@${compose.handle}</span>
          </div>
        </div>

        <p class="compose-helper">${compose.helper_text}</p>

        <div class="compose-editor">
          <textarea
            class="compose-input"
            placeholder="${compose.placeholder}"
            rows="5"
            maxlength="${compose.char_limit}"
          ></textarea>
        </div>

        <div class="compose-gif-placeholder" aria-hidden="true">
          <p>GIF search is coming soon.</p>
          <button class="compose-gif-dismiss" type="button">Dismiss</button>
        </div>

        <div class="compose-image-preview"></div>
      </div>

      <footer class="compose-overlay-footer">
        <div class="compose-tools">
          <button class="compose-tool compose-image-btn" type="button" title="Add image">
            <i class="fa-regular fa-image"></i>
          </button>
          <button class="compose-tool compose-gif-btn" type="button" title="Add GIF">
            <i class="fa-regular fa-face-smile"></i>
          </button>
        </div>

        <div class="compose-footer-end">
          <div class="compose-char-count" aria-live="polite">
            <span class="compose-char-current">0</span>
            <span class="compose-char-separator">/</span>
            <span class="compose-char-max">${compose.char_limit}</span>
          </div>
          <button class="compose-submit saito-button-primary small" type="button">
            <span class="compose-submit-label">${submitLabel}</span>
            <span class="compose-submit-spinner" aria-hidden="true"></span>
          </button>
        </div>
      </footer>

      <div class="compose-posting-screen" aria-hidden="true">
        <div class="compose-posting-loader">
          <div class="saito-loader"></div>
        </div>
        <p class="compose-posting-message">Posting…</p>
      </div>

      <input
        class="compose-file-input"
        type="file"
        accept="image/png,image/jpeg,image/jpg,image/gif,image/webp"
        hidden
      />
    </section>
  `;
};
