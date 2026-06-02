module.exports = (path, value) => {
  const safePath = String(path || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const safeValue = String(value || '').replace(/"/g, '&quot;');
  return `
<div class="rustscript-field">
  <h2 class="rustscript-field-title">Public key</h2>
  <label class="rustscript-field-label">Field path</label>
  <p class="rustscript-field-path">${safePath}</p>
  <label class="rustscript-field-label" for="rustscript-field-publickey-input">Value</label>
  <input
    type="text"
    id="rustscript-field-publickey-input"
    class="rustscript-field-input"
    value="${safeValue}"
    placeholder="Saito public key"
    autocomplete="off"
    spellcheck="false"
  />
  <div class="rustscript-field-actions">
    <button type="button" class="rustscript-button">Use my public key</button>
    <button type="button" class="rustscript-button rustscript-button-primary">Apply</button>
    <button type="button" class="rustscript-button">Cancel</button>
  </div>
</div>
`;
};
