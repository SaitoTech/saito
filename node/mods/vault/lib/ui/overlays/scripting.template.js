module.exports = (app, mod, scripting_overlay = {}) => {
  const escapeHtml =
    typeof app?.browser?.escapeHTML === 'function'
      ? (s) => app.browser.escapeHTML(String(s ?? ''))
      : (s) =>
          String(s ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');

  const contracts = scripting_overlay.contracts || [];
  const selected_id = scripting_overlay.selected_contract_id || 'custom';
  const script_text = escapeHtml(scripting_overlay.script_text || '');

  const options = contracts
    .map((c) => {
      const selected = c.id === selected_id ? ' selected' : '';
      return `<option value="${escapeHtml(c.id)}"${selected}>${escapeHtml(c.label)}</option>`;
    })
    .join('');

  return `
    <div class="create-nft-container vault-scripting-overlay">
      <div class="saito-overlay-form-header">
         <div class="saito-overlay-form-header-title">
            <div>
               CUSTOM ACCESS KEY
            </div>
         </div>
      </div>

      <div class="nft-creator vault-scripting-body">
        <div class="vault-scripting-type-row">
          <label class="vault-scripting-type-label" for="vault-script-type">Script type</label>
          <select class="saito-form-select vault-scripting-type-select" id="vault-script-type" aria-label="Access script type">
            ${options}
          </select>
        </div>

        <div class="textarea-container vault-scripting-editor">
          <textarea class="saito-textarea create-nft-textarea create-nft-script-textarea" id="create-nft-textarea">${script_text}</textarea>
        </div>
      </div>

      <div class="vault-scripting-actions">
        <div class="saito-button-row">
          <div class="saito-anchor" data-action="use-default-key"><span>use default key...</span></div>
          <button id="mint_scripting_key_btn" class="saito-button-primary">Create Key</button>
        </div>
      </div>
    </div>
`;
};
