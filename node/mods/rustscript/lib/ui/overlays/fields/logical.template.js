module.exports = (path, value) => {
  const safePath = String(path || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const safeValue = String(value || '').replace(/"/g, '&quot;');
  return `
<div class="rustscript-field">
  <h2 class="rustscript-field-title">Logical combinator</h2>
  <label class="rustscript-field-label">Field path</label>
  <p class="rustscript-field-path">${safePath}</p>
  <p class="rustscript-field-hint">Reserved — combine scripts with AND / OR / NOT in a later stage.</p>
  <label class="rustscript-field-label" for="rustscript-field-logical-input">Current value</label>
  <input
    type="text"
    id="rustscript-field-logical-input"
    class="rustscript-field-input"
    value="${safeValue}"
    readonly
    spellcheck="false"
  />
  <div class="rustscript-field-actions">
    <button type="button" class="rustscript-button rustscript-button-primary">Close</button>
  </div>
</div>
`;
};
