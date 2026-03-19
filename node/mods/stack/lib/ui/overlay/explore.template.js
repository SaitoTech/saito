const PostTeaser = require('../post-teaser');

module.exports = (app, mod, posts = [], isLoading = false, subs = []) => {
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
                <div class="saito-userline-name" style="font-size: 1.8rem; font-weight: 600; color: var(--saito-font-color);">Loading...</div>
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
            ${
              isLoading
                ? `
              <!-- Loading state -->
              <div class="stack-explore-loading" style="display: flex; justify-content: center; align-items: center; min-height: 200px; padding: 4rem 2rem;">
                <div style="text-align: center;">
                  <i class="fa-solid fa-spinner fa-spin" style="font-size: 3rem; color: var(--saito-font-color-light); margin-bottom: 1rem;"></i>
                  <p style="color: var(--saito-font-color-light); font-size: 1.6rem;">Loading posts...</p>
                </div>
              </div>
            `
                : posts[pk].length > 0
                  ? `
              <!-- Populated state - render real posts using PostTeaser UI component -->
              ${posts[pk]
                .map((transaction) => {
                  const teaser = new PostTeaser(app, mod, '', transaction);
                  return teaser.render(); // Returns HTML string for template
                })
                .join('')}
            `
                  : `
              <!-- Empty state -->
              <div class="stack-explore-empty-state" style="display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 300px; padding: 4rem 2rem; text-align: center;">
                <i class="fa-solid fa-newspaper" style="font-size: 4rem; color: var(--saito-font-color-light); opacity: 0.5; margin-bottom: 2rem;"></i>
                <h3 style="font-size: 2rem; font-weight: 600; color: var(--saito-font-color); margin: 0 0 1rem 0;">No posts available</h3>
                <p style="font-size: 1.6rem; color: var(--saito-font-color-light); margin: 0; max-width: 500px; line-height: 1.6;">
                  No posts are visible at this time. This may be because no posts have been published yet, or you may need to subscribe to see content from this creator.
                </p>
              </div>
            `
            }
          </div>
        </div>
      </div>
    </div>
  `;

  return html;
};
