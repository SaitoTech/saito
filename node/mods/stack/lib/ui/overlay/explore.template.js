module.exports = (app, mod, subs = []) => {
  let pk = mod.exploreOverlay.targetPublicKey;
  let html = `
    <div class="stack-explore-overlay">
      <div class="stack-explore-sidebar">
        <div class="stack-explore-sidebar-header">
          <h2>Explore</h2>
        </div>
        <div class="stack-explore-sidebar-content">
          <div class="stack-explore-subscriptions-list">
  `;
  for (let z = 0; z < subs.length; z++) {
    let active = subs[z].publickey == pk ? ' active' : '';

    html += `
            <div class="stack-explore-subscription-item ${active}" data-filter="${subs[z].publickey}">
              <i class="${subs[z].icon}"></i>
              <span>${subs[z].label}</span>
            </div>
    `;
  }

  html += `
          </div>
          
          <!-- Contextual help note - only shown when subscription list is short (2 or fewer) -->
          <div id='stack-explore-add-subscription-btn' class="stack-explore-help-note">
            <p>Need help? Explore shows posts from people you follow. <span class="saito-anchor">Subscribe to creators to see their posts here.</span></p>
            <div class='stack-explore-subscription-item'><i class="fa-solid fa-user-plus"></i><span>add creator</span></div>
          </div>
        </div>
      <div class='stack-explorer-mobile-header'>
        <select class="saito-form-select stack-explorer-mobile-selector">`;
  for (let z = 0; z < subs.length; z++) {
    let active = subs[z].publickey == pk ? 'selected' : '';
    html += `<option value="${subs[z].publickey}" ${active}>${subs[z].label}</option>`;
  }

  html += `</select>
        <div class="stack-explorer-mobile-icon">
          <i class="fa-solid fa-user-plus"></i>
        </div>
      </div>


      </div>
      
      <div class="stack-explore-main">
        <!-- Main Panel Header - Contains author identity and action links -->
        <div class="stack-explore-main-header">
          <!-- Author Identity Header - Context-aware based on selected subscription -->
          <div class="stack-explore-author-header" id="stack-explore-author-header">
            <!-- TEMPORARY: Hardcoded identity placeholder - will be replaced by JavaScript SaitoUser component -->
            <!-- This ensures the left-side anchor is always present for layout stability -->
            <div class="saito-user" style="display: flex; align-items: center; gap: 1rem;">
              <div class="saito-userline" style="display: flex; align-items: center; gap: 1rem;">
                <div class="saito-userline-identicon" style="width: 3.6rem; height: 3.6rem; border-radius: 50%; background: var(--saito-primary); opacity: 0.3;"></div>
                <div class="saito-userline-name" style="font-size: 1.8rem; font-weight: 600; color: var(--saito-foreground);">Loading...</div>
              </div>
            </div>
          </div>
          <!-- Subscribe button appears here when viewing via URL routing and not already subscribed -->
          <div id="stack-explore-subscribe-button-container" style="display: none;">
            <button class="stack-explore-subscribe-btn" id="stack-explore-subscribe-btn">
              Subscribe
            </button>
          </div>
          
          <!-- Action Button Container (in main panel header, right-aligned) -->
          <div class="stack-explore-action-button-container">
            <a href="#" class="stack-view-post-action-badge stack-alt-new-post" id="stack-explore-new-post-btn" style="display: none;">
              <i class="fa-solid fa-plus"></i>
            </a>
            <a href="#" class="stack-view-post-action-badge" id="stack-explore-settings-btn" style="display: none;">
              <i class="fa-solid fa-gear"></i>
            </a>
            <a href="#" id="stack-explore-author-share" class="stack-view-post-action-badge" aria-label="Share Author" title="Share Author">
              <i class="fa-solid fa-share-nodes"></i>
            </a>
          </div>
        </div>

        <div class="stack-explore-content">
          <div class="stack-explore-posts-grid" id="stack-explore-posts-grid">
            <!-- Loading state -->
            <div class="stack-explore-loading" style="display: flex; justify-content: center; align-items: center; min-height: 200px; padding: 4rem 2rem;">
              <div style="text-align: center;">
                <i class="fa-solid fa-spinner fa-spin" style="font-size: 3rem; color: var(--saito-muted-foreground); margin-bottom: 1rem;"></i>
                <p style="color: var(--saito-muted-foreground); font-size: 1.6rem;">Loading posts...</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  return html;
};
