const { buildRustscriptOverlay } = require('../overlay.shell');

module.exports = (options) => {
  const { title, value, multiline, placeholder, submitLabel } = options;
  const safeValue = String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  const safeTitle = String(title ?? 'Text');
  const safePlaceholder = String(placeholder ?? '');
  const safeSubmit = String(submitLabel ?? 'Apply');

  const inputBlock = multiline
    ? `<textarea class="saito-textarea rs-prompt-value rs-prompt-generic-input" spellcheck="false" placeholder="${safePlaceholder}">${safeValue}</textarea>`
    : `<input
      type="text"
      class="saito-input rs-prompt-value rs-prompt-single-input"
      value="${safeValue.replace(/"/g, '&quot;')}"
      placeholder="${safePlaceholder}"
      autocomplete="off"
      spellcheck="false"
    />`;

  return buildRustscriptOverlay({
    className: `rs-overlay-prompt rs-prompt-generic${multiline ? ' rs-prompt-generic-multiline' : ' rs-prompt-generic-single'}`,
    title: safeTitle,
    bodyHtml: `
      ${inputBlock}
      <p class="rs-prompt-validation" hidden></p>
    `,
    actionsHtml: `<button type="button" class="rs-btn rs-btn-primary rs-prompt-apply">${safeSubmit}</button>`
  });
};
