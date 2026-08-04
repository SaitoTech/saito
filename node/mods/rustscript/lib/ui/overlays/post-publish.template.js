const { buildRustscriptOverlay } = require('./overlay.shell');

module.exports = {
  overlay({ p2shLink = '' } = {}) {
    return buildRustscriptOverlay({
      className: 'rs-overlay-modal rs-post-publish',
      headHtml: `
        <div class="rs-post-publish-head">
          <div class="rs-post-publish-success" aria-hidden="true">
            <i class="fas fa-check"></i>
          </div>
          <h2 class="rs-overlay-title rs-overlay-title-hero">Transaction Published</h2>
        </div>
      `,
      bodyHtml: `
        <p class="rs-overlay-lead rs-post-publish-lead">
          To spend the assets protected by this script in the future, you will need a copy of the transaction. Download the transaction or save the P2SH link so you can unlock and spend these assets later.
        </p>

        <div class="rs-post-publish-primary">
          <button type="button" class="rs-btn rs-btn-primary rs-post-publish-download" data-action="post-publish-download">
            DOWNLOAD TRANSACTION
          </button>
        </div>

        <div class="rs-post-publish-divider" aria-hidden="true"><span>OR</span></div>

        <section class="rs-post-publish-secondary">
          <p class="rs-overlay-lead rs-post-publish-secondary-lead">save the P2SH link instead</p>
          <div class="rs-publish-input-copy-row">
            <input type="text" class="saito-input rs-publish-input rs-post-publish-link" readonly value="${p2shLink}" spellcheck="false" />
            <button type="button" class="rs-copy-btn rs-publish-copy-btn" data-action="post-publish-copy-link" title="Copy P2SH link" aria-label="Copy P2SH link">
              <i class="fa-solid fa-copy rs-copy-btn-icon" aria-hidden="true"></i>
            </button>
          </div>
        </section>
      `
    });
  }
};
