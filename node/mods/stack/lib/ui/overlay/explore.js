const ExploreTemplate = require('./explore.template');
const SaitoOverlay = require('../../../../../lib/saito/ui/saito-overlay/saito-overlay');
const ViewPost = require('../view-post');
const SaitoUser = require('../../../../../lib/saito/ui/saito-user/saito-user');

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
      this.updateHelpNoteVisibility();
    }, 25);
  }

  updateHelpNoteVisibility() {
    // Count subscription items
    const subscriptionItems = document.querySelectorAll('.stack-explore-subscription-item');
    const helpNote = document.querySelector('.stack-explore-help-note');
    
    if (helpNote && subscriptionItems.length > 2) {
      // Hide help note if more than 2 subscriptions
      helpNote.classList.add('hide-help');
    } else if (helpNote) {
      // Show help note if 2 or fewer subscriptions
      helpNote.classList.remove('hide-help');
    }
  }

  updateAuthorHeader() {
    const authorHeader = document.querySelector('#stack-explore-author-header');
    if (!authorHeader) return;

    // Clear existing content
    authorHeader.innerHTML = '';

    // Find the currently active subscription item
    const activeItem = document.querySelector('.stack-explore-subscription-item.active');
    if (!activeItem) return;

    const filter = activeItem.getAttribute('data-filter');
    const itemText = activeItem.querySelector('span')?.textContent || '';

    let publicKey = '';
    let description = '';

    // Handle different subscription types
    if (filter === 'all' || itemText === 'Saito Official') {
      // For Saito Official, use a default public key or special handling
      // In a real implementation, this would use the actual Saito Official public key
      publicKey = this.mod.publicKey || ''; // Placeholder - would be actual Saito Official key
      description = 'Posts by this author';
      
      if (!publicKey) {
        // If no key available, hide the header
        return;
      }
    } else if (filter === 'my-posts') {
      // For "My Posts", show the current user's identity
      publicKey = this.app.wallet?.returnPublicKey() || this.mod.publicKey || '';
      description = 'Your posts';
      
      if (!publicKey) {
        // If no user key available, hide the header
        return;
      }
    } else {
      // For other subscriptions, would use the subscription's public key
      // For now, hide if not a recognized filter
      return;
    }

    // Use SaitoUser component to render identity
    const saitoUser = new SaitoUser(
      this.app,
      this.mod,
      '#stack-explore-author-header',
      publicKey,
      description, // Use notice parameter for description
      '' // fourthelem
    );
    saitoUser.render();
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
      // Update author header on initial load
      this.updateAuthorHeader();
      
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
          // Update author header based on selection
          this.updateAuthorHeader();
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
          e.preventDefault();
          e.stopPropagation();
          
          // Close the explore overlay
          this.overlay.hide();
          
          // Smooth transition to ViewPost
          const container = document.querySelector('.saito-container');
          if (!container) return;
          
          // Reset scroll position immediately (before any transition)
          window.scrollTo({ top: 0, behavior: 'instant' });
          if (container.scrollTop !== undefined) {
            container.scrollTop = 0;
          }
          
          // Store current opacity if already set
          const currentOpacity = container.style.opacity || '1';
          
          // Fade out existing content
          container.style.transition = 'opacity 200ms ease-out';
          container.style.opacity = '0';
          
          // After fade out, replace content and fade in
          setTimeout(() => {
            // Clear container
            container.innerHTML = '';
            
            // Create and render ViewPost
            const viewPost = new ViewPost(this.app, this.mod, '.saito-container', null);
            viewPost.render();
            
            // Fade in new content using requestAnimationFrame for smooth transition
            requestAnimationFrame(() => {
              container.style.transition = 'opacity 200ms ease-in';
              container.style.opacity = '0';
              
              // Trigger reflow, then fade in
              void container.offsetHeight;
              
              requestAnimationFrame(() => {
                container.style.opacity = '1';
                
                // Reset scroll position after content is visible
                setTimeout(() => {
                  window.scrollTo({ top: 0, behavior: 'instant' });
                  if (container.scrollTop !== undefined) {
                    container.scrollTop = 0;
                  }
                  // Clean up inline styles after transition completes
                  setTimeout(() => {
                    container.style.transition = '';
                    container.style.opacity = '';
                  }, 200);
                }, 50);
              });
            });
          }, 200);
        };
      });
    } catch (err) {
      console.error('Explore overlay attachEvents error:', err);
    }
  }
}

module.exports = ExploreOverlay;

