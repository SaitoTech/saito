/**
 * Publish Settings Overlay Template
 * 
 * Complete rewrite - three-card layout for the moment of publishing.
 */
module.exports = (app, mod, postState = {}) => {
  const titleInput = document.querySelector('#stack-post-title-input');
  const title = titleInput ? titleInput.value || 'Untitled' : 'Untitled';
  
  // Check if post is published (from postState or create_post_ui.isPublished)
  const isPublished = postState.published || (mod.create_post_ui && mod.create_post_ui.isPublished) || false;
  // PART 3 — BUTTON LABEL LOGIC: Use parent_id to determine button text
  // parent_id === null → "Publish" (new post or draft)
  // parent_id !== null → "Update" (editing published post)
  const parent_id = mod.create_post_ui && mod.create_post_ui.parent_id ? mod.create_post_ui.parent_id : null;
  const buttonText = parent_id ? 'Update' : 'Publish';
  const accessLevel = postState.accessLevel || 'public';
  
  // Get content for size calculation (using DOM-based serialization if available)
  const editor = document.querySelector('#stack-post-body-editor');
  let content = '';
  if (editor && mod.create_post_ui && mod.create_post_ui.serializeDOMToMarkdown) {
    content = mod.create_post_ui.serializeDOMToMarkdown();
  }
  
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

  // Map internal access levels to display
  // 'public' -> 'public', 'private' -> 'private', 'subscription' -> 'subscription'
  const isPublic = accessLevel === 'public';
  const isPrivate = accessLevel === 'private';
  const isSubscription = accessLevel === 'subscription';
  
  // Get access mode for private posts (default to 'transferable' - Flexible)
  const accessMode = postState.accessMode || 'transferable';
  const isNonTransferable = accessMode === 'non-transferable';
  const isTransferable = accessMode === 'transferable';

  // Determine educational content based on current access level
  let educationalContent = '';
  if (isPublic) {
    educationalContent = 'This post will be visible to anyone with the link and may be shared freely.\nIf you later restrict access, copies may still exist.';
  } else if (isPrivate) {
    educationalContent = 'This post will only be readable by people you explicitly grant access to.\nYou control who can see it.';
  } else if (isSubscription) {
    educationalContent = 'This post will only be readable by people with an active subscription.\nThis option is under development.';
  } else {
    // Default to public
    educationalContent = 'This post will be visible to anyone with the link and may be shared freely.\nIf you later restrict access, copies may still exist.';
  }

  return `
    <div class="stack-publish-overlay">
      <div class="stack-publish-content">
        <!-- Three-Column Layout -->
        <div class="stack-publish-cards">
          
          <!-- LEFT COLUMN: ACCESS DECISION -->
          <div class="stack-publish-card stack-publish-card-access">
            <h3 class="stack-publish-card-title">Who can read this post?</h3>
            <div class="stack-publish-access-cards">
              <label class="stack-publish-access-card ${isPublic ? 'stack-publish-access-card-active' : ''}" data-access="public">
                <input 
                  type="checkbox" 
                  name="stack-publish-access" 
                  value="public" 
                  ${isPublic ? 'checked' : ''}
                  class="stack-publish-access-checkbox"
                />
                <div class="stack-publish-access-card-content">
                  <div class="stack-publish-access-card-label">Public</div>
                  <div class="stack-publish-access-card-description">Anyone can read this post.</div>
                </div>
              </label>

              <label class="stack-publish-access-card ${isPrivate ? 'stack-publish-access-card-active' : ''}" data-access="private">
                <input 
                  type="checkbox" 
                  name="stack-publish-access" 
                  value="private" 
                  ${isPrivate ? 'checked' : ''}
                  class="stack-publish-access-checkbox"
                />
                <div class="stack-publish-access-card-content">
                  <div class="stack-publish-access-card-label">Private</div>
                  <div class="stack-publish-access-card-description">Only people you give access to can read this post.</div>
                </div>
              </label>

              <label class="stack-publish-access-card ${isSubscription ? 'stack-publish-access-card-active' : ''}" data-access="subscription">
                <input 
                  type="checkbox" 
                  name="stack-publish-access" 
                  value="subscription" 
                  ${isSubscription ? 'checked' : ''}
                  class="stack-publish-access-checkbox"
                />
                <div class="stack-publish-access-card-content">
                  <div class="stack-publish-access-card-label">Subscription</div>
                  <div class="stack-publish-access-card-description">Only people with valid subscription have access.</div>
                </div>
              </label>
            </div>
          </div>

          <!-- MIDDLE COLUMN: CONTEXTUAL EXPLANATION -->
          <div class="stack-publish-card stack-publish-card-educational">
            <div id="stack-publish-educational-content" class="stack-publish-educational-content">
              ${educationalContent.split('\n').map(line => `<p>${line}</p>`).join('')}
            </div>
            
            <!-- Access type selector (only shown when Private is selected) -->
            ${isPrivate ? `
              <div class="stack-publish-access-type-selector">
                <div class="stack-publish-access-type-label">Access type:</div>
                <div class="stack-publish-access-type-options">
                  <label class="stack-publish-access-type-option">
                    <input 
                      type="radio" 
                      name="stack-publish-access-type" 
                      value="transferable"
                      ${isTransferable ? 'checked' : ''}
                      class="stack-publish-access-type-radio"
                    />
                    <span class="stack-publish-access-type-option-label">Flexible (transferable)</span>
                  </label>
                  <label class="stack-publish-access-type-option">
                    <input 
                      type="radio" 
                      name="stack-publish-access-type" 
                      value="non-transferable"
                      ${isNonTransferable ? 'checked' : ''}
                      class="stack-publish-access-type-radio"
                    />
                    <span class="stack-publish-access-type-option-label">Non-transferable (stricter)</span>
                  </label>
                </div>
              </div>
            ` : ''}

            <!-- Access type selector (only shown when Private is selected) -->
            ${isSubscription ? `
              <div class="stack-publish-access-type-selector">
                <div class="stack-publish-access-type-label">Access type:</div>
                <div class="stack-publish-access-type-options">
                  <label class="stack-publish-access-type-option">
                    <input 
                      type="radio" 
                      name="stack-publish-access-type" 
                      value="transferable"
                      ${isTransferable ? 'checked' : ''}
                      class="stack-publish-access-type-radio"
                    />
                    <span class="stack-publish-access-type-option-label">Flexible (transferable)</span>
                  </label>
                  <label class="stack-publish-access-type-option">
                    <input 
                      type="radio" 
                      name="stack-publish-access-type" 
                      value="non-transferable"
                      ${isNonTransferable ? 'checked' : ''}
                      class="stack-publish-access-type-radio"
                    />
                    <span class="stack-publish-access-type-option-label">Non-transferable (stricter)</span>
                  </label>
                </div>
              </div>
            ` : ''}
          </div>

          <!-- RIGHT COLUMN: METADATA + DESTRUCTIVE ACTION -->
          <div class="stack-publish-card stack-publish-card-metadata">
            <div class="stack-publish-metadata-header">
              <h3 class="stack-publish-card-title">Metadata</h3>
              <button id="stack-publish-delete-draft-btn" class="stack-publish-delete-draft-icon" title="Delete Draft">
                <i class="fa-solid fa-trash"></i>
              </button>
            </div>
            <div class="stack-publish-metadata-list">
              <div class="stack-publish-metadata-row">
                <span class="stack-publish-metadata-label">Status</span>
                <span class="stack-publish-metadata-value">${isPublished ? 'Published' : 'Draft'}</span>
              </div>
              <div class="stack-publish-metadata-row">
                <span class="stack-publish-metadata-label">Created</span>
                <span class="stack-publish-metadata-value">${formatDate(createdDate)}</span>
              </div>
              <div class="stack-publish-metadata-row">
                <span class="stack-publish-metadata-label">Last updated</span>
                <span class="stack-publish-metadata-value">${formatDate(updatedDate)}</span>
              </div>
              <div class="stack-publish-metadata-row">
                <span class="stack-publish-metadata-label">Size</span>
                <span class="stack-publish-metadata-value">${contentSizeKB} KB</span>
              </div>
            </div>
          </div>

        </div>
        
        <!-- GLOBAL PUBLISH ACTION - Bottom-right of overlay -->
        <div class="stack-publish-global-action">
          <button id="stack-publish-primary-btn" class="stack-publish-primary-action-btn">
            ${buttonText}
          </button>
        </div>
      </div>
    </div>
  `;
};
