module.exports = (app, mod, witness_overlay = {}) => {
  return `
    <div class="create-nft-container vault-scripting-overlay">
      <div class="saito-overlay-form-header">
         <div class="saito-overlay-form-header-title">
            <div>
               PROVIDE WITNESS DATA
            </div>
         </div>
      </div>

      <div class="nft-creator vault-scripting-body">
        <div class="textarea-container vault-scripting-editor">
          <textarea
            class="saito-textarea create-nft-script-textarea witness-access-script-textarea"
            id="witness-access-script-textarea"
            spellcheck="false"
          ></textarea>
        </div>
      </div>

      <div class="vault-scripting-actions">
        <div class="saito-button-row">
          <div class="create-nft-help-link" id="witness-help-link">need help?</div>
          <button id="download_with_witness_btn" class="saito-button-primary">Download File</button>
        </div>
      </div>
    </div>
`;
};
