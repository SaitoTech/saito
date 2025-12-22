module.exports = (app, mod) => {
  return `
    <div class="stack-create-post-page">
      <div class="stack-create-post-sidebar">
        <div class="stack-sidebar-section">
          <h3>Upload Images</h3>
          <div class="stack-image-upload-area" id="stack-image-upload-area">
            <div class="stack-image-upload-content">
              <i class="fa-solid fa-cloud-arrow-up stack-upload-icon"></i>
              <p class="stack-upload-text">Drag and drop images here</p>
              <p class="stack-upload-subtext">or click to browse</p>
              <input 
                type="file" 
                id="stack-image-upload-input" 
                class="stack-image-upload-input" 
                accept="image/*" 
                multiple
              />
            </div>
          </div>
          <div class="stack-uploaded-images" id="stack-uploaded-images"></div>
        </div>
        
        <div class="stack-sidebar-section stack-sidebar-actions">
          <h3>Actions</h3>
          <button class="stack-btn-primary stack-btn-full-width" id="stack-publish-btn">
            <i class="fa-solid fa-paper-plane"></i> Publish
          </button>
          <button class="stack-btn-secondary stack-btn-full-width" id="stack-preview-btn">
            <i class="fa-solid fa-eye"></i> Preview
          </button>
        </div>
      </div>
      
      <div class="stack-create-post-main">
        <div class="stack-create-post-header">
          <button class="stack-back-btn" id="stack-back-to-splash-btn">
            <i class="fa-solid fa-arrow-left"></i> Back
          </button>
          <h1>Create New Post</h1>
        </div>
        
        <div class="stack-create-post-form">
          <div class="stack-post-title-field">
            <input 
              type="text" 
              id="stack-post-title-input" 
              class="stack-post-title-input" 
              placeholder="Enter post title..."
              autofocus
            />
          </div>
          
          <div class="stack-post-body-field">
            <textarea 
              id="stack-post-body-input" 
              class="stack-post-body-input" 
              placeholder="Write your post in Markdown...&#10;&#10;You can use:&#10;- **bold** text&#10;- *italic* text&#10;- # Headings&#10;- Lists&#10;- Links and more"
            ></textarea>
          </div>
        </div>
      </div>
    </div>
  `;
};
