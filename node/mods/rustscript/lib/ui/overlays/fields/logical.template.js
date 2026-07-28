const { buildRustscriptOverlay } = require('../overlay.shell');

module.exports = (currentOp, optionsHtml, explain) =>
  buildRustscriptOverlay({
    className: 'rs-overlay-prompt rs-prompt-logical',
    title: currentOp,
    bodyHtml: `
      <label class="rs-overlay-label" for="rs-prompt-logical-select">Operator</label>
      <select id="rs-prompt-logical-select" class="saito-form-select rs-prompt-logical-select">${optionsHtml}</select>
      <p class="rs-overlay-lead rs-prompt-logical-explain">${explain}</p>
      <p class="rs-prompt-validation" hidden></p>
    `,
    actionsHtml: `<button type="button" class="rs-btn rs-btn-primary rs-prompt-apply">Apply</button>`
  });
