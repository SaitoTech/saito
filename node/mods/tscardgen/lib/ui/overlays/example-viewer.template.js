function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

module.exports = (example = {}) => `
  <div class="tscardgen-example-viewer saito-overlay-form retain-surface">
    <div class="saito-overlay-form-header">
      <div class="saito-overlay-form-header-title">${escapeHtml(example.label || 'Example')}</div>
    </div>
    <p class="tscardgen-example-summary">${escapeHtml(example.summary || '')}</p>
    <pre class="tscardgen-example-code" tabindex="0"><code>${escapeHtml(example.code || '')}</code></pre>
    <div class="tscardgen-example-actions">
      <button type="button" class="saito-button-secondary" data-action="close">Close</button>
      <button type="button" class="saito-button-primary" data-action="copy">Copy</button>
    </div>
  </div>
`;
