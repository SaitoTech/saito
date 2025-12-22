const ExploreTemplate = require('./explore.template');
const SaitoOverlay = require('../../../../../lib/saito/ui/saito-overlay/saito-overlay');

class ExploreOverlay {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
    this.overlay = new SaitoOverlay(this.app, this.mod);
    this.posts = [];
  }

  async render() {
    // Load posts (placeholder - will implement actual loading later)
    await this.loadPosts();
    
    const html = ExploreTemplate(this.app, this.mod, this.posts);
    this.overlay.show(html);
    
    setTimeout(() => {
      this.attachEvents();
    }, 25);
  }

  async loadPosts() {
    // Load posts from:
    // 1. Default whitelisted feed (Saito Official)
    // 2. Identities the user follows
    // 3. Access NFTs the user holds
    // 4. If URL includes a public key, show only posts from that key
    
    // Placeholder - will implement actual post loading later
    // For now, ensure we always have content (no empty state)
    this.posts = [];
    
    // TODO: Load from Saito Official feed by default
    // TODO: Load from followed identities
    // TODO: Load from access NFTs
    // TODO: Filter by public key if present in URL
    
    // Explore always shows content - there is no empty state
  }

  attachEvents() {
    try {
      // Subscription/Identity list items
      const subscriptionItems = document.querySelectorAll('.stack-explore-subscription-item');
      subscriptionItems.forEach(item => {
        item.onclick = (e) => {
          e.preventDefault();
          // Remove active class from all items
          subscriptionItems.forEach(i => i.classList.remove('active'));
          // Add active class to clicked item
          item.classList.add('active');
          const filter = item.getAttribute('data-filter');
          console.log('Subscription filter clicked:', filter);
          // Will implement filtering by identity/subscription later
        };
      });

      // Post teaser clicks (using standardized teaser component)
      const teasers = document.querySelectorAll('.stack-post-teaser');
      teasers.forEach(teaser => {
        const postId = teaser.getAttribute('data-post-id');
        const publicKey = teaser.getAttribute('data-public-key');
        
        // Read button click handler
        const readBtn = teaser.querySelector('.stack-post-teaser-read-btn');
        if (readBtn) {
          readBtn.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            console.log('Read button clicked for post:', postId);
            // Will implement post viewing later
          };
        }
        
        // Entire teaser click handler
        teaser.onclick = (e) => {
          // Don't trigger if clicking on the read button (it has its own handler)
          if (e.target.closest('.stack-post-teaser-read-btn')) {
            return;
          }
          console.log('Post teaser clicked:', { postId, publicKey });
          // Will implement post viewing later
        };
      });
    } catch (err) {
      console.error('Explore overlay attachEvents error:', err);
    }
  }
}

module.exports = ExploreOverlay;

