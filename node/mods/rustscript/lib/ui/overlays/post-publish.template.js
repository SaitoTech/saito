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
          <h2 class="rs-overlay-title rs-overlay-title-hero">Script Published</h2>
        </div>
      `,
      bodyHtml: `
        <p class="rs-overlay-lead rs-post-publish-lead">
          Your script has been committed to the blockchain. You now hold a transaction that
          represents ownership of this script. Keep it — you can import it later to spend the script.
        </p>

        <section class="rs-post-publish-section">
          <h3 class="rs-overlay-label">Published Transaction</h3>
          <p class="rs-post-publish-note">
            Save this transaction if you intend to spend the script later. It can be imported using
            Import Transaction from the main menu.
          </p>
          <button type="button" class="rs-btn rs-btn-secondary rs-post-publish-download" data-action="post-publish-download">
            Download Transaction
          </button>
        </section>

        <section class="rs-post-publish-section">
          <h3 class="rs-overlay-label">Pay-to-Script-Hash Link</h3>
          <div class="rs-publish-input-copy-row">
            <input type="text" class="saito-input rs-publish-input rs-post-publish-link" readonly value="${p2shLink}" spellcheck="false" />
            <button type="button" class="rs-copy-btn rs-publish-copy-btn" data-action="post-publish-copy-link" title="Copy P2SH link" aria-label="Copy P2SH link">
              <i class="fa-solid fa-copy" aria-hidden="true"></i>
            </button>
          </div>
          <div class="rs-post-publish-guide">
            <p>To spend this script later you have two options:</p>
            <ul>
              <li>Import the downloaded transaction using <strong>Import Transaction</strong></li>
              <li>Import this Pay-to-Script-Hash link using <strong>Import Existing Script</strong></li>
            </ul>
          </div>
        </section>
      `,
      actionsHtml: `
        <button type="button" class="rs-btn rs-btn-primary rs-post-publish-done" data-action="post-publish-done">
          Return to Main
        </button>
      `,
      actionsClass: 'rs-overlay-actions-end rs-post-publish-actions'
    });
  }
};
