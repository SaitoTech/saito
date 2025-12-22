module.exports = (app, mod, posts = [], hasDraft = false) => {
  return `
    <div class="stack-welcome-overlay">
      <div class="stack-welcome-content">
        <div class="stack-welcome-header">
          <h2>Welcome back</h2>
          <p class="stack-welcome-body">We found an active draft and posts you've written before.</p>
        </div>

        <div class="stack-welcome-actions">
          <button id="stack-welcome-continue-btn" class="stack-welcome-primary-btn">
            <i class="fa-solid fa-pen"></i> Continue writing
          </button>
          
          <button id="stack-welcome-edit-another-btn" class="stack-welcome-secondary-btn">
            <i class="fa-solid fa-list"></i> Edit another post
          </button>
          
          <button id="stack-welcome-start-fresh-btn" class="stack-welcome-tertiary-btn">
            <i class="fa-solid fa-plus"></i> Start fresh
          </button>
        </div>
      </div>
    </div>
  `;
};

