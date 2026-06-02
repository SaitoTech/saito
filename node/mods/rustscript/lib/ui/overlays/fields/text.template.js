module.exports = (path, value, label = 'Text') => {
  const safePath = String(path || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const safeValue = String(value || '').replace(/"/g, '&quot;');
  const fieldId = 'rustscript-field-text-input';
  return `
<div class="rustscript-field">
  <h2 class="rustscript-field-title">${label}</h2>
  <label class="rustscript-field-label">Field path</label>
  <p class="rustscript-field-path">${safePath}</p>
  <label class="rustscript-field-label" for="${fieldId}">Value</label>
  <textarea
    id="${fieldId}"
    class="rustscript-field-input"
    spellcheck="false"
    placeholder="Enter text"
  >${String(value || '')}</textarea>
  <div class="rustscript-field-actions">
    <button type="button" class="rustscript-button rustscript-button-primary">Apply</button>
    <button type="button" class="rustscript-button">Cancel</button>
  </div>
</div>
`;
};
