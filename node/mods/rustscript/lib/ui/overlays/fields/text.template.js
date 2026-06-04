module.exports = (value) => {
  const safeValue = String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return `
<div class="rustscript-overlay rs-prompt-overlay rs-prompt-generic">
  <h2 class="rs-prompt-title">Provide Text</h2>
  <textarea class="rs-prompt-value rs-prompt-generic-input" spellcheck="false">${safeValue}</textarea>
  <p class="rs-prompt-validation" hidden></p>
  <div class="overlay-actions overlay-actions-apply-only">
    <button type="button" class="rs-prompt-apply rs-prompt-primary">Submit</button>
  </div>
</div>
`;
};
