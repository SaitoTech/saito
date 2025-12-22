module.exports = (app, mod, postState = {}) => {
  const title = document.querySelector('#stack-post-title-input')?.value || 'Untitled';
  const editor = document.querySelector('#stack-post-body-editor');
  const { serializeDocumentToMarkdown } = require('../../post-document');
  const content = editor ? serializeDocumentToMarkdown(mod.create_post_ui.document) : '';
  
  const isPublished = postState.published || false;
  const accessLevel = postState.accessLevel || 'public';
  
  // Calculate content size
  const contentSize = new Blob([content]).size;
  const contentSizeKB = (contentSize / 1024).toFixed(1);
  
  // Get timestamps
  const now = new Date();
  const createdDate = postState.createdAt ? new Date(postState.createdAt) : now;
  const updatedDate = postState.updatedAt ? new Date(postState.updatedAt) : now;
  
  const formatDate = (date) => {
    return date.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const actionButtonText = isPublished ? 'Update' : 'Publish';

  return `
    <div class="stack-publish-settings-overlay">
      <div class="stack-publish-settings-content">
        <!-- Header -->
        <div class="stack-publish-settings-header">
          <h2 class="stack-publish-settings-title">Publishing Options</h2>
          <p class="stack-publish-settings-subtitle">Control how this post is shared</p>
        </div>

        <!-- Status Box -->
        <div class="stack-publish-status-box">
          <div class="stack-publish-status-header">Draft — Private</div>
          <div class="stack-publish-status-body">
            This post is currently saved only on your device. It will not be visible to anyone until you publish it.
          </div>
        </div>

        <!-- Access Control -->
        <div class="stack-publish-section">
          <h3 class="stack-publish-section-title">Who can read this post?</h3>
          <div class="stack-publish-access-options">
            <label class="stack-publish-access-option">
              <input 
                type="radio" 
                name="stack-publish-access" 
                value="public" 
                ${accessLevel === 'public' ? 'checked' : ''}
                class="stack-publish-access-radio"
              />
              <div class="stack-publish-access-option-content">
                <div class="stack-publish-access-option-label">Public</div>
                <div class="stack-publish-access-option-help">Anyone with the link can read this post.</div>
              </div>
            </label>

            <label class="stack-publish-access-option">
              <input 
                type="radio" 
                name="stack-publish-access" 
                value="subscribers" 
                ${accessLevel === 'subscribers' || accessLevel === 'nft' ? 'checked' : ''}
                class="stack-publish-access-radio"
              />
              <div class="stack-publish-access-option-content">
                <div class="stack-publish-access-option-label">Subscribers</div>
                <div class="stack-publish-access-option-help">Only people who own a subscription NFT you created.</div>
              </div>
            </label>

            <label class="stack-publish-access-option">
              <input 
                type="radio" 
                name="stack-publish-access" 
                value="custom" 
                ${accessLevel === 'custom' ? 'checked' : ''}
                class="stack-publish-access-radio"
              />
              <div class="stack-publish-access-option-content">
                <div class="stack-publish-access-option-label">Custom</div>
                <div class="stack-publish-access-option-help">Use a custom access rule (advanced).</div>
              </div>
            </label>
          </div>
        </div>

        <!-- Metadata -->
        <div class="stack-publish-metadata">
          <div class="stack-publish-metadata-item">
            <span class="stack-publish-metadata-label">Status:</span>
            <span class="stack-publish-metadata-value">${isPublished ? 'Published' : 'Draft'}</span>
          </div>
          <div class="stack-publish-metadata-item">
            <span class="stack-publish-metadata-label">Created:</span>
            <span class="stack-publish-metadata-value">${formatDate(createdDate)}</span>
          </div>
          <div class="stack-publish-metadata-item">
            <span class="stack-publish-metadata-label">Last updated:</span>
            <span class="stack-publish-metadata-value">${formatDate(updatedDate)}</span>
          </div>
          <div class="stack-publish-metadata-item">
            <span class="stack-publish-metadata-label">Size:</span>
            <span class="stack-publish-metadata-value">${contentSizeKB} KB</span>
          </div>
        </div>

        <!-- Actions -->
        <div class="stack-publish-actions">
          <button id="stack-publish-delete-draft-btn" class="stack-publish-delete-btn">
            Delete Draft
          </button>
          <button id="stack-publish-primary-btn" class="stack-publish-primary-btn">
            ${actionButtonText}
          </button>
        </div>
      </div>
    </div>
  `;
};
