module.exports = (app, mod) => {
  return `
    <div class="stack-create-post-page">
      <div class="stack-create-post-container">
        <div class="stack-editor-content-wrapper">
          <div class="stack-document-column">
            <div class="stack-post-title-field">
              <input 
                type="text" 
                id="stack-post-title-input" 
                class="stack-post-title-input" 
                placeholder="Untitled Post"
              />
            </div>
            
            <div class="stack-post-body-field">
              <div 
                id="stack-post-body-editor" 
                class="stack-post-body-editor"
                contenteditable="true"
                data-placeholder="Start writing..."
              ></div>
            </div>
            
          </div>
          
          <div class="stack-editor-sidebar">
            <div class="stack-editor-status">
              <span class="stack-editor-status-label">Status:</span> <span class="stack-editor-status-value" id="stack-editor-status-value">Draft</span>
            </div>
            
            <button class="stack-editor-publish-btn" id="stack-editor-publish-btn">
              Publish
            </button>
            
            <div class="stack-editor-help">
              <span class="stack-editor-help-text">
                <a href="#" class="stack-editor-help-link" id="stack-editor-help-link">Need help?</a> Learn how to write posts, add headers, quotes, images, and publish to the network.
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
};
