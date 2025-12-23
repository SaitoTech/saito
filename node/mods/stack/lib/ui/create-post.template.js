module.exports = (app, mod) => {
  return `
    <div class="stack-create-post-page">
      <div class="stack-create-post-container">
        <div class="stack-editor-header">
          <div class="stack-draft-state" id="stack-draft-state" title="Publish settings" aria-label="Publish settings">
            <span class="stack-draft-state-text">Admin</span>
          </div>
        </div>
        
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
      </div>
    </div>
  `;
};
