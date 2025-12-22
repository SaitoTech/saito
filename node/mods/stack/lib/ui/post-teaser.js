/**
 * Post Teaser Component
 * 
 * A reusable component for displaying blog post previews.
 * This component ensures consistent rendering of post teasers
 * across different surfaces (Explore, public-key pages, etc.)
 */
const PostTeaserTemplate = require('./post-teaser.template');

class PostTeaser {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
  }

  /**
   * Render a post teaser
   * @param {Object} post - Post data object
   * @param {string} container - CSS selector or DOM element to render into
   * @returns {string} HTML string of the teaser
   */
  render(post, container = null) {
    if (!post) {
      console.error('PostTeaser: post data is required');
      return '';
    }

    const html = PostTeaserTemplate(this.app, this.mod, post);

    if (container) {
      if (typeof container === 'string') {
        const element = document.querySelector(container);
        if (element) {
          element.innerHTML = html;
          this.attachEvents(element);
        }
      } else if (container instanceof HTMLElement) {
        container.innerHTML = html;
        this.attachEvents(container);
      }
    }

    return html;
  }

  /**
   * Attach event handlers to a teaser element
   * @param {HTMLElement} element - The teaser container element
   */
  attachEvents(element) {
    const teaser = element.querySelector('.stack-post-teaser');
    if (!teaser) return;

    const postId = teaser.getAttribute('data-post-id');
    const publicKey = teaser.getAttribute('data-public-key');

    // Make entire teaser clickable
    teaser.style.cursor = 'pointer';
    teaser.onclick = (e) => {
      this.handleTeaserClick(postId, publicKey);
    };
  }

  /**
   * Handle teaser click - opens full post view
   * @param {string} postId - Post identifier
   * @param {string} publicKey - Author's public key
   */
  handleTeaserClick(postId, publicKey) {
    // TODO: Implement post viewing logic
    // This should open a full post reader view
    console.log('Post teaser clicked:', { postId, publicKey });
    
    // Placeholder: Will be implemented when post reader view is created
    // For now, this is a no-op
  }
}

module.exports = PostTeaser;

