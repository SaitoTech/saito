module.exports = (path, value) => {
  const safePath = String(path || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const safeValue = String(value || '').replace(/"/g, '&quot;');
  return `
<div class="rustscript-field">
  <h2 class="rustscript-field-title">Hash</h2>
  <label class="rustscript-field-label">Field path</label>
  <p class="rustscript-field-path">${safePath}</p>
  <label class="rustscript-field-label" for="rustscript-field-hash-input">Value</label>
  <input
    type="text"
    id="rustscript-field-hash-input"
    class="rustscript-field-input"
    value="${safeValue}"
    placeholder="Blake3 hex digest"
    spellcheck="false"
    autocomplete="off"
  />
  <div class="rustscript-field-actions">
    <button type="button" class="rustscript-button">Hash witness input</button>
    <button type="button" class="rustscript-button rustscript-button-primary">Apply</button>
    <button type="button" class="rustscript-button">Cancel</button>
  </div>
</div>
`;
};
