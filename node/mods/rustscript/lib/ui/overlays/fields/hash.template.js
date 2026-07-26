const { buildRustscriptOverlay } = require('../overlay.shell');

module.exports = () =>
  buildRustscriptOverlay({
    className: 'rs-overlay-prompt rs-prompt-hash',
    title: 'Provide Text to Hash',
    bodyHtml: `
      <textarea class="saito-textarea rs-prompt-hash-input" spellcheck="false" placeholder="Enter text to hash"></textarea>
      <div class="rs-prompt-hash-output-row">
        <output class="rs-prompt-hash-output" aria-live="polite">—</output>
        <button type="button" class="rs-copy-btn rs-prompt-copy-hash" title="Copy hash" aria-label="Copy hash">
          <i class="fa-solid fa-copy" aria-hidden="true"></i>
        </button>
      </div>
      <p class="rs-prompt-validation" hidden></p>
    `,
    actionsHtml: `<button type="button" class="rs-btn rs-btn-primary rs-prompt-apply">Apply</button>`
  });
