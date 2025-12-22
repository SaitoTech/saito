module.exports = (app, mod, postState = {}) => {
  const title = document.querySelector('#stack-post-title-input')?.value || 'Untitled';
  const editor = document.querySelector('#stack-post-body-editor');
  const { serializeDocumentToMarkdown } = require('../../post-document');
  const content = editor ? serializeDocumentToMarkdown(mod.create_post_ui.document) : '';
  
  // Get first paragraph for mini snapshot
  const firstParagraph = content.split('\n\n')[0] || content.substring(0, 150);
  const snapshotText = firstParagraph.length > 150 ? firstParagraph.substring(0, 150) + '...' : firstParagraph;

  const isPublished = postState.published || false;
  const accessLevel = postState.accessLevel || 'public';
  const description = postState.description || '';
  const imageUrl = postState.image ? `data:image/png;base64,${postState.image}` : (postState.imageUrl || '');

  // Pre-publish mode: simple explanation and minimal actions
  if (!isPublished) {
    return `
      <div class="stack-publish-settings-overlay">
        <div class="stack-publish-settings-content">
          <div class="stack-publish-settings-header">
            <h2>About Publishing</h2>
          </div>

          <div class="stack-publish-section">
            <div class="stack-publish-info-box">
              <h3 class="stack-publish-info-title">This post is private and local</h3>
              <p class="stack-publish-info-text">
                Your draft is saved locally on your device. It is not visible to anyone else and will not be shared until you publish it.
              </p>
            </div>
          </div>

          <div class="stack-publish-section">
            <h3 class="stack-publish-section-title">What publishing will do</h3>
            <ul class="stack-publish-info-list">
              <li>Make your post visible to others on the network</li>
              <li>Create a permanent record on the blockchain</li>
              <li>Allow you to set access controls and monetization</li>
            </ul>
          </div>

          <div class="stack-publish-section">
            <h3 class="stack-publish-section-title">What will NOT change</h3>
            <ul class="stack-publish-info-list">
              <li>Your local draft will remain editable</li>
              <li>You can update or unpublish at any time</li>
              <li>Your writing process stays the same</li>
            </ul>
          </div>

          <div class="stack-publish-actions">
            <button id="stack-publish-delete-draft-btn" class="stack-publish-delete-btn">
              <i class="fa-solid fa-trash"></i> Delete Draft
            </button>
            <button id="stack-publish-close-btn" class="stack-publish-close-btn">
              Close
            </button>
          </div>
        </div>
      </div>
    `;
  }

  // Post-publish mode: full settings
  return `
    <div class="stack-publish-settings-overlay">
      <div class="stack-publish-settings-content">
        <div class="stack-publish-settings-header">
          <h2>Edit Publication</h2>
        </div>

        <!-- Mini Snapshot -->
        <div class="stack-publish-snapshot">
          <h3 class="stack-publish-snapshot-title">${app.browser.escapeHTML(title)}</h3>
          <p class="stack-publish-snapshot-text">${app.browser.escapeHTML(snapshotText)}</p>
          <a href="#" id="stack-publish-preview-link" class="stack-publish-preview-link">View Preview →</a>
        </div>

        <!-- Access Controls -->
        <div class="stack-publish-section">
          <h3 class="stack-publish-section-title">Access</h3>
          <div class="stack-publish-access-controls">
            <button class="stack-publish-access-btn ${accessLevel === 'public' ? 'active' : ''}" data-access="public">
              <i class="fa-solid fa-globe"></i> Public
            </button>
            <button class="stack-publish-access-btn ${accessLevel === 'nft' ? 'active' : ''}" data-access="nft">
              <i class="fa-solid fa-image"></i> NFT Holders
            </button>
            <button class="stack-publish-access-btn ${accessLevel === 'custom' ? 'active' : ''}" data-access="custom">
              <i class="fa-solid fa-gear"></i> Custom
            </button>
          </div>
          <div class="stack-publish-custom-section" style="display: ${accessLevel === 'custom' ? 'block' : 'none'}; margin-top: 1rem;">
            <p class="stack-publish-helper-text">Custom access controls coming soon</p>
          </div>
        </div>

        <!-- Metadata -->
        <div class="stack-publish-section">
          <h3 class="stack-publish-section-title">Metadata</h3>
          
          <div class="stack-publish-field">
            <label for="stack-publish-description">Description</label>
            <textarea 
              id="stack-publish-description" 
              class="stack-publish-textarea"
              placeholder="Brief description of your post..."
              rows="3"
            >${app.browser.escapeHTML(description)}</textarea>
          </div>

          <div class="stack-publish-field">
            <label>Title Image</label>
            <div class="stack-publish-image-upload">
              ${imageUrl ? `
                <img id="stack-publish-image-preview" src="${imageUrl}" alt="Title image" class="stack-publish-image-preview" />
              ` : `
                <img id="stack-publish-image-preview" src="" alt="" class="stack-publish-image-preview" style="display: none;" />
              `}
              <input type="file" id="stack-publish-image-input" accept="image/*" style="display: none;" />
              <button type="button" id="stack-publish-image-upload-btn" class="stack-publish-image-btn">
                <i class="fa-solid fa-upload"></i> ${imageUrl ? 'Change Image' : 'Upload Image'}
              </button>
            </div>
          </div>
        </div>

        <!-- Advanced Section (Collapsed) -->
        <div class="stack-publish-section">
          <button id="stack-publish-advanced-toggle" class="stack-publish-advanced-toggle">
            <span>Advanced</span>
            <i class="fa-solid fa-chevron-down"></i>
          </button>
          <div class="stack-publish-advanced-section">
            <div class="stack-publish-field">
              <label for="stack-publish-custom-css">Custom CSS</label>
              <textarea 
                id="stack-publish-custom-css" 
                class="stack-publish-textarea stack-publish-css-input"
                placeholder="Custom CSS for this post..."
                rows="5"
              >${app.browser.escapeHTML(postState.customCSS || '')}</textarea>
            </div>
            <button id="stack-publish-unpublish-btn" class="stack-publish-unpublish-btn">
              <i class="fa-solid fa-ban"></i> Unpublish
            </button>
          </div>
        </div>

        <!-- Primary Action -->
        <div class="stack-publish-actions">
          <button id="stack-publish-primary-btn" class="stack-publish-primary-btn">
            <i class="fa-solid fa-check"></i>
            Update
          </button>
        </div>
      </div>
    </div>
  `;
};

