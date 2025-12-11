module.exports = (app, mod) => {
  let html = `
<div class="vault-upload-overlay">

      <div class="saito-overlay-form-header">
         <div class="saito-overlay-form-header-title">
            <div>
               Download Protected File
            </div>
         </div>
      </div>

      <div class="nft-creator">
        <div class="textarea-container">
          <input type="text" class="vault-file-access" />
        </div>
      </div>

      <div class="saito-button-row">
         <button class="saito-primary confirm-button disabled" id="confirm-button">Download File</button>
      </div>

</div>
`;
  return html;
};
