const { buildRustscriptOverlay } = require('../overlay.shell');

module.exports = (options) => {
  const { title, value, placeholder } = options;
  const safeValue = String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;');

  return buildRustscriptOverlay({
    className: 'rs-overlay-prompt rs-prompt-number-panel',
    title,
    bodyHtml: `
      <input
        type="text"
        inputmode="numeric"
        pattern="[0-9]*"
        class="saito-input rs-prompt-value rs-prompt-number-input"
        value="${safeValue}"
        placeholder="${placeholder}"
        autocomplete="off"
        spellcheck="false"
      />
      <p class="rs-prompt-validation" hidden></p>
    `,
    actionsHtml: `<button type="button" class="rs-btn rs-btn-primary rs-prompt-apply">Apply</button>`
  });
};
