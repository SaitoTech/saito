const { buildRustscriptOverlay } = require('../overlay.shell');

module.exports = (value) => {
  const safeValue = String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;');

  return buildRustscriptOverlay({
    className: 'rs-overlay-prompt rs-prompt-publickey-panel',
    title: 'Public Key',
    bodyHtml: `
      <input
        type="text"
        class="saito-input rs-prompt-value rs-prompt-publickey-input"
        value="${safeValue}"
        placeholder="Saito public key"
        autocomplete="off"
        spellcheck="false"
      />
      <p class="rs-prompt-validation" hidden></p>
    `,
    actionsHtml: `
      <button type="button" class="rs-btn rs-btn-secondary rs-prompt-use-mine">Use My Public Key</button>
      <button type="button" class="rs-btn rs-btn-primary rs-prompt-apply">Apply</button>
    `,
    actionsClass: 'rs-overlay-actions-split'
  });
};
