module.exports = (app, mod) => {
  return `
    <div class="stack-create-post-page">
      <div class="stack-create-post-container">
        <div class="stack-editor-content-wrapper">
          <div class="stack-document-column">
            <!-- Featured Image Display (in main page layout, above title) -->
            <div id="stack-featured-image-display" class="stack-featured-image-display" style="display: none;">
              <div class="stack-featured-image-display-container">
                <img id="stack-featured-image-display-img" class="stack-featured-image-display-img" src="" alt="Featured image" />
                <div id="stack-featured-image-display-remove" class="stack-featured-image-display-remove" title="Remove featured image">
                  <i class="fa-solid fa-trash"></i>
                </div>
              </div>
            </div>
            
            <div class="stack-post-title-field">
              <input 
                type="text" 
                id="stack-post-title-input" 
                class="saito-input stack-post-title-input" 
                placeholder="Give your post a working title"
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
            
            <!-- Featured Image Upload Section (in sidebar, between Status and Publish button) -->
            <!-- Upload box is only a chooser - image appears in main layout above title -->
            <div id="stack-featured-image-section" class="stack-featured-image-section">
              <!-- Upload Dropzone (shown when no image) -->
              <div id="stack-featured-image-dropzone" class="stack-featured-image-dropzone stack-editor-primary-control">
                <div class="stack-featured-image-dropzone-content">
                  <i class="fa-solid fa-image stack-featured-image-upload-icon"></i>
                  <p class="stack-featured-image-dropzone-text">Drag and drop feature image here</p>
                  <p class="stack-featured-image-dropzone-subtext">or click to upload</p>
                </div>
              </div>
            </div>
            
            <button class="saito-button-primary stack-editor-publish-btn stack-editor-primary-control" id="stack-editor-publish-btn">
              Publish
            </button>
            
            <div class="stack-editor-help">
              <div class="stack-editor-help-container">
                <div class="stack-editor-help-icon-container">
                  <i class="fa-solid fa-question stack-help-icon"></i>
                  <a href="https://wiki.saito.io/en/applications/stack" target="_blank"><i class="fa-solid fa-info stack-help-icon"></i></a>
                </div>
                <div class="stack-editor-help-text-container">
                  <div class="stack-markdown-cheatsheet">
                    <p class="stack-cheatsheet-title">
                      <b>Cheat Sheet</b>
                      <span>Markdown</span>
                    </p>
                    <div class="stack-cheatsheet-section">
                      <div class="stack-cheatsheet-item">
                        <code># Title</code>
                      </div>
                      <div class="stack-cheatsheet-item">
                        <code>## Subtitle</code>
                      </div>
                      <div class="stack-cheatsheet-item">
                        <code>### Heading</code>
                      </div>
                      <div class="stack-cheatsheet-item">
                        <code>#### Subheading</code>
                      </div>
                    </div>
                    <div class="stack-cheatsheet-section">
                      <div class="stack-cheatsheet-item">
                        <code>_italic_</code>
                      </div>
                      <div class="stack-cheatsheet-item">
                        <code>**bold**</code>
                      </div>
                    </div>
                    <div class="stack-cheatsheet-section">
                      <div class="stack-cheatsheet-item">
                        <code>––-</code> horizontal rule
                      </div>
                    </div>
                    <div class="stack-cheatsheet-section">
                      <div class="stack-cheatsheet-item">
                        <code>* bullet</code>
                      </div>
                      <div class="stack-cheatsheet-item">
                        <code>\`\`\` code \`\`\`</code>
                      </div>
                    </div>
                    <div class="stack-cheatsheet-tips">
                      <p>Paste images<p>
                      <p>cltr/cmd + b for bold</p>
                      <p>cltr/cmd + i for italic</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
};
