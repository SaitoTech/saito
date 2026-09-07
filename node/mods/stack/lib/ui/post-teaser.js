const PostTeaserTemplate = require('./post-teaser.template');

/**
 * PostTeaser UI Component
 *
 * Root namespace: .post-teaser
 * options.compact — denser layout when parent arranges teaser in a tight slot
 */
class PostTeaser {
  constructor(app, mod, container = '', transaction = null, options = {}) {
    this.app = app;
    this.mod = mod;
    this.container = container;
    this.transaction = transaction;
    this.options = options || {};
  }

  render() {
    if (!this.transaction) {
      console.error('PostTeaser: transaction is required');
      return '';
    }

    const html = PostTeaserTemplate(this.app, this.mod, this.transaction, this.options);

    if (this.container) {
      const signature = this.transaction.signature || '';
      const selector = signature
        ? `${this.container} .post-teaser[data-tx-signature="${signature}"]`
        : `${this.container} .post-teaser:last-child`;

      if (document.querySelector(selector)) {
        this.app.browser.replaceElementBySelector(html, selector);
      } else {
        this.app.browser.addElementToSelector(html, this.container);
      }

      setTimeout(() => {
        this.attachEvents();
      }, 25);
    }

    return html;
  }

  attachEvents() {
    // Click handling is managed by parent (ExploreOverlay / ViewPost)
  }
}

module.exports = PostTeaser;
