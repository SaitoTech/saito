module.exports = (path, value) => {
  const safePath = String(path || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `
<div class="rustscript-field">
  <h2 class="rustscript-field-title">Signature</h2>
  <label class="rustscript-field-label">Field path</label>
  <p class="rustscript-field-path">${safePath}</p>
  <label class="rustscript-field-label" for="rustscript-field-signature-input">Value</label>
  <textarea
    id="rustscript-field-signature-input"
    class="rustscript-field-input"
    spellcheck="false"
    placeholder="Hex or base64 signature"
  >${String(value || '')}</textarea>
  <div class="rustscript-field-actions">
    <button type="button" class="rustscript-button">Sign message</button>
    <button type="button" class="rustscript-button rustscript-button-primary">Apply</button>
    <button type="button" class="rustscript-button">Cancel</button>
  </div>
</div>
`;
};
