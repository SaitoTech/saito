const PostTeaserTemplate = require('../post-teaser.template');

module.exports = (app, mod, posts = []) => {
  return `
    <div class="stack-explore-overlay">
      <div class="stack-explore-sidebar">
        <div class="stack-explore-sidebar-header">
          <h2>Explore</h2>
        </div>
        <div class="stack-explore-sidebar-content">
          <div class="stack-explore-filter-section">
            <h3>Subscriptions</h3>
            <div class="stack-explore-subscriptions-list">
              <div class="stack-explore-subscription-item active" data-filter="all">
                <i class="fa-solid fa-newspaper"></i>
                <span>Saito Official</span>
              </div>
              <div class="stack-explore-subscription-item" data-filter="my-posts">
                <i class="fa-solid fa-user"></i>
                <span>My Posts</span>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <div class="stack-explore-main">
        ${posts.length > 0 ? `
          <div class="stack-explore-main-header">
            <h2>Posts</h2>
          </div>
        ` : ''}

        <div class="stack-explore-content">
          ${posts.length > 0 ? `
            <div class="stack-explore-posts-grid">
              ${posts.map(post => PostTeaserTemplate(app, mod, post)).join('')}
            </div>
          ` : `
            <div class="stack-explore-empty-state">
              <p class="stack-explore-empty-message">
                Posts appear here from creators you follow or subscribe to.
              </p>
              <p class="stack-explore-empty-link">
                <a href="https://saito.io/wiki/subscriptions" target="_blank" rel="noopener noreferrer">
                  Learn about subscriptions
                </a>
              </p>
            </div>
          `}
        </div>
      </div>
    </div>
  `;
};

