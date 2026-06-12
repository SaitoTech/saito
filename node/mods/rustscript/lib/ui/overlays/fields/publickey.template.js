module.exports = (value) => {
  const safeValue = String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;');
  return `
<div class="rustscript-overlay rs-prompt-overlay rs-prompt-publickey-panel">
  <h2 class="rs-prompt-title">Public Key</h2>
  <div class="rs-prompt-publickey-field">
    <input
      type="text"
      class="rs-prompt-value rs-prompt-publickey-input"
      value="${safeValue}"
      placeholder="Saito public key"
      autocomplete="off"
      spellcheck="false"
    />
  </div>
  <p class="rs-prompt-validation" hidden></p>
  <div class="overlay-actions overlay-actions-split">
    <button type="button" class="rs-btn rs-btn-secondary rs-prompt-use-mine">Use My Public Key</button>
    <button type="button" class="rs-btn rs-btn-primary rs-prompt-apply">Apply</button>
  </div>
</div>
`;
};
