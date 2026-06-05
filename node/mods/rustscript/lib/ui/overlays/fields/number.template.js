module.exports = (options) => {
  const { title, value, placeholder } = options;
  const safeValue = String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;');
  return `
<div class="rustscript-overlay rs-prompt-overlay rs-prompt-number-panel">
  <h2 class="rs-prompt-title">${title}</h2>
  <div class="rs-prompt-number-field">
    <input
      type="text"
      inputmode="numeric"
      pattern="[0-9]*"
      class="rs-prompt-value rs-prompt-number-input"
      value="${safeValue}"
      placeholder="${placeholder}"
      autocomplete="off"
      spellcheck="false"
    />
  </div>
  <p class="rs-prompt-validation" hidden></p>
  <div class="overlay-actions overlay-actions-apply-only">
    <button type="button" class="rs-prompt-apply rs-prompt-primary">Apply</button>
  </div>
</div>
`;
};
