module.exports = () => `
<div class="rustscript-overlay rs-prompt-overlay rs-prompt-hash">
  <h2 class="rs-prompt-title">Provide Text to Hash</h2>
  <textarea class="rs-prompt-hash-input" spellcheck="false" placeholder="Enter text to hash"></textarea>
  <div class="rs-prompt-hash-output-row">
    <output class="rs-prompt-hash-output" aria-live="polite">—</output>
    <button type="button" class="rs-prompt-copy-hash" title="Copy hash" aria-label="Copy hash">
      <i class="fa-solid fa-copy rs-prompt-copy-icon" aria-hidden="true"></i>
    </button>
  </div>
  <p class="rs-prompt-validation" hidden></p>
  <div class="overlay-actions overlay-actions-apply-only">
    <button type="button" class="rs-btn rs-btn-primary rs-prompt-apply">Apply</button>
  </div>
</div>
`;
