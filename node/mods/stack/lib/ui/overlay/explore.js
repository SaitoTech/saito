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
    // Placeholder - will implement actual post loading later
    // For now, return empty array or sample data
    this.posts = [];
    
    // Sample data for testing (remove when implementing real loading)
    // this.posts = [
    //   {
    //     id: '1',
    //     title: 'Welcome to Stack',
    //     author: 'Saito Team',
    //     excerpt: 'Learn how to create and monetize your content on the decentralized web.',
    //     date: { month: 'Dec', day: '21' },
    //     tier: 'free',
    //     image: null
    //   }
    // ];
  }

  attachEvents() {
    try {
      // Filter buttons
      const filterBtns = document.querySelectorAll('.stack-explore-filter-btn');
      filterBtns.forEach(btn => {
        btn.onclick = (e) => {
          e.preventDefault();
          // Remove active class from all buttons
          filterBtns.forEach(b => b.classList.remove('active'));
          // Add active class to clicked button
          btn.classList.add('active');
          const filter = btn.getAttribute('data-filter');
          console.log('Filter clicked:', filter);
          // Will implement filtering later
        };
      });

      // Search input
      const searchInput = document.querySelector('#stack-explore-search-input');
      if (searchInput) {
        let searchTimeout;
        searchInput.oninput = (e) => {
          clearTimeout(searchTimeout);
          searchTimeout = setTimeout(() => {
            const query = e.target.value;
            console.log('Search query:', query);
            // Will implement search later
          }, 300);
        };
      }

      // Read More buttons
      const readMoreBtns = document.querySelectorAll('.stack-explore-read-more-btn');
      readMoreBtns.forEach(btn => {
        btn.onclick = (e) => {
          e.preventDefault();
          const card = btn.closest('.stack-explore-post-card');
          const postId = card?.getAttribute('data-post-id');
          console.log('Read more clicked for post:', postId);
          // Will implement post viewing later
        };
      });

      // Create Post button (in empty state)
      const createPostBtn = document.querySelector('#stack-explore-create-post-btn');
      if (createPostBtn) {
        createPostBtn.onclick = (e) => {
          e.preventDefault();
          this.overlay.hide();
          if (this.mod.create_post_ui) {
            this.mod.create_post_ui.render();
          }
        };
      }

      // Post card clicks
      const postCards = document.querySelectorAll('.stack-explore-post-card');
      postCards.forEach(card => {
        card.onclick = (e) => {
          // Don't trigger if clicking on the read more button
          if (e.target.closest('.stack-explore-read-more-btn')) {
            return;
          }
          const postId = card.getAttribute('data-post-id');
          console.log('Post card clicked:', postId);
          // Will implement post viewing later
        };
      });
    } catch (err) {
      console.error('Explore overlay attachEvents error:', err);
    }
  }
}

module.exports = ExploreOverlay;

