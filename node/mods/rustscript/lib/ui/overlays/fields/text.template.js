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

  return `
<div class="rustscript-overlay rs-prompt-overlay rs-prompt-generic${multiline ? ' rs-prompt-generic-multiline' : ' rs-prompt-generic-single'}">
  <h2 class="rs-prompt-title">${safeTitle}</h2>
  ${inputBlock}
  <p class="rs-prompt-validation" hidden></p>
  <div class="overlay-actions overlay-actions-apply-only">
    <button type="button" class="rs-btn rs-btn-primary rs-prompt-apply">${safeSubmit}</button>
  </div>
</div>
`;
};
