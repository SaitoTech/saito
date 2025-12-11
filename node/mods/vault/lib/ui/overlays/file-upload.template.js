module.exports = (app, mod) => {
  let html = `
<div class="vault-upload-overlay">

      <div class="saito-overlay-form-header">
         <div class="saito-overlay-form-header-title">
            <div>
               Select File
            </div>
         </div>
      </div>

      <div class="nft-creator">

        <div class="button-container">
	  <div class="spinner-helper">uploading...<p></p><img src="/saito/img/spinner.svg" /></div>
          <div class="jade_key public-nft"><div class="key_level_info"><h5>PUBLIC KEY</h5>create new NFT with recovery info</div></div>
          <!--
          <div class="crystal_key private-nft"><div class="key_level_info"><h5>STEALTH KEY</h5>secretly bind file to existing NFT</div></div>
          -->
        </div>

        <div class="textarea-container">
          <div class="saito-app-upload active-tab paste_event" id="vault-file-upload">
            <span class="vault-file-upload-text">drag-and-drop file</span>
    	  </div>
        </div>
      </div>

</div>
`;
  return html;
};
