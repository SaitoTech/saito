const PostTeaserTemplate = require('../post-teaser.template');

module.exports = (app, mod, posts = []) => {
  return `
    <div class="stack-explore-overlay">
      <div class="stack-explore-sidebar">
        <div class="stack-explore-sidebar-header">
          <h2>Explore</h2>
        </div>
        <div class="stack-explore-sidebar-content">
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
          
          <!-- Contextual help note - only shown when subscription list is short (2 or fewer) -->
          <div class="stack-explore-help-note">
            <p>Need help? Explore shows posts from people you follow. Subscribe to creators to see their posts here.</p>
          </div>
        </div>
      </div>
      
      <div class="stack-explore-main">
        <!-- Author Identity Header - Context-aware based on selected subscription -->
        <div class="stack-explore-author-header" id="stack-explore-author-header">
          <!-- Will be populated by JavaScript using SaitoUser component -->
        </div>

        <div class="stack-explore-content">
          <div class="stack-explore-posts-grid">
            ${posts.length > 0 ? posts.map(post => PostTeaserTemplate(app, mod, post)).join('') : ''}
            
            <!-- Hardcoded sample posts for visual testing -->
            ${PostTeaserTemplate(app, mod, {
              title: 'Getting Started with Saito Stack',
              subtitle: 'Learn how to create your first post, set up subscriptions, and build your audience on the decentralized web.',
              imageUrl: 'https://via.placeholder.com/400x300/4a90e2/ffffff?text=Sample+Post+1',
              timestamp: Date.now() - 86400000 * 2, // 2 days ago
              id: 'sample-1'
            })}
            
            ${PostTeaserTemplate(app, mod, {
              title: 'Understanding Peer-to-Peer Publishing',
              summary: 'Unlike traditional blogging platforms, Saito Stack runs on a peer-to-peer network. Your posts are stored across the network, giving you true ownership and control over your content.',
              imageUrl: '/saito/img/dreamscape.png',
              timestamp: Date.now() - 86400000 * 5, // 5 days ago
              id: 'sample-2'
            })}
            
            ${PostTeaserTemplate(app, mod, {
              title: 'Advanced Monetization Strategies',
              subtitle: 'This premium content explores advanced techniques for monetizing your writing through NFT subscriptions, custom access rules, and building sustainable revenue streams.',
              imageUrl: 'https://via.placeholder.com/400x300/2e7d32/ffffff?text=Premium+Content',
              timestamp: Date.now() - 86400000 * 7, // 7 days ago
              id: 'sample-3'
            })}
          </div>
        </div>
      </div>
    </div>
  `;
};

