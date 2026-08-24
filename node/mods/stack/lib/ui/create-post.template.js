module.exports = (app, mod) => {
  return `
    <div class="create-post">
      <div class="frame">
        <div class="workspace">
          <div class="document">
            <div class="title-field">
              <textarea
                id="stack-post-title-input"
                class="saito-textarea title"
                rows="1"
                placeholder="Untitled"
                aria-label="Document title"
              ></textarea>
            </div>

            <div class="body-field">
              <div
                id="stack-post-body-editor"
                class="body"
                contenteditable="true"
                data-placeholder="Write something…"
              ></div>
            </div>
          </div>

          <aside class="sidebar" aria-label="Document controls">
            <div class="status" aria-live="polite">
              <span class="value" id="stack-editor-status-value">Draft</span>
            </div>

            <div id="stack-featured-image-section" class="upload">
              <div id="stack-featured-image-display" class="feature">
                <button
                  type="button"
                  id="stack-featured-image-preview"
                  class="preview"
                  aria-label="Replace cover image"
                >
                  <img id="stack-featured-image-display-img" class="image" src="" alt="" />
                </button>
                <button
                  type="button"
                  id="stack-featured-image-display-remove"
                  class="remove"
                  aria-label="Remove cover image"
                >
                  <i class="fa-solid fa-trash" aria-hidden="true"></i>
                </button>
              </div>
              <div
                id="stack-featured-image-dropzone"
                class="dropzone"
                role="button"
                tabindex="0"
                aria-label="Add cover image"
              >
                <i class="fa-solid fa-image icon" aria-hidden="true"></i>
                <span class="text">Add cover image</span>
              </div>
            </div>

            <button type="button" class="saito-button-primary compact control" id="stack-editor-publish-btn">
              Publish
            </button>
          </aside>
        </div>
      </div>
    </div>
  `;
};
