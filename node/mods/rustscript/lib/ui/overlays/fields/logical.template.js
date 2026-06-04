module.exports = (currentOp, optionsHtml, explain) => `
<div class="rustscript-overlay rs-prompt-overlay rs-prompt-logical">
  <h2 class="rs-prompt-title">${currentOp}</h2>
  <label class="rs-prompt-label" for="rs-prompt-logical-select">Operator</label>
  <select id="rs-prompt-logical-select" class="rs-prompt-logical-select">${optionsHtml}</select>
  <p class="rs-prompt-logical-explain">${explain}</p>
  <p class="rs-prompt-validation" hidden></p>
  <div class="overlay-actions overlay-actions-apply-only">
    <button type="button" class="rs-prompt-apply rs-prompt-primary">Submit</button>
  </div>
</div>
`;
