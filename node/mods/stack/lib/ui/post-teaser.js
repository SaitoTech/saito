const PostTeaserTemplate = require('./post-teaser.template');

/**
 * PostTeaser UI Component
 * 
 * Standard Saito UI component for displaying blog post previews.
 * Follows the standard Saito UI pattern with constructor(app, mod, container, transaction).
 */
class PostTeaser {
  constructor(app, mod, container = '', transaction = null) {
    this.app = app;
    this.mod = mod;
    this.container = container;
    this.transaction = transaction;
  }

  /**
   * Render the post teaser into the container.
   * If container is provided, inserts HTML into DOM.
   * Returns HTML string for batch rendering scenarios.
   * 
   * @returns {string} HTML string of the rendered teaser
   */
  render() {
    if (!this.transaction) {
      console.error('PostTeaser: transaction is required');
      return '';
    }

    const html = PostTeaserTemplate(this.app, this.mod, this.transaction);

    // If container is provided, insert into DOM using Saito browser methods
    if (this.container) {
      // Use a unique selector based on transaction signature
      const signature = this.transaction.signature || '';
      const selector = signature 
        ? `${this.container} .stack-post-teaser[data-tx-signature="${signature}"]`
        : `${this.container} .stack-post-teaser:last-child`;

      if (document.querySelector(selector)) {
        // Replace existing teaser
        this.app.browser.replaceElementBySelector(html, selector);
      } else {
        // Add new teaser
        this.app.browser.addElementToSelector(html, this.container);
      }

      // Attach events after DOM insertion
      setTimeout(() => {
        this.attachEvents();
      }, 25);
    }

    // Return HTML string for batch rendering scenarios
    return html;
  }

  /**
   * Attach event handlers to the rendered teaser element.
   * Note: Click handling is managed by the parent component (ExploreOverlay),
   * so this method is intentionally minimal.
   */
  attachEvents() {
    // Event handling is managed by ExploreOverlay.attachPostClickHandlers()
    // This method exists for consistency with Saito UI component pattern
  }
}

module.exports = PostTeaser;
