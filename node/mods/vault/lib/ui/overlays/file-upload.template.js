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
	  <div class="spinner-helper" style="display: none;">uploading...<p></p><img src="/saito/img/spinner.svg" /></div>
          <div class="jade_key public-nft"><div class="key_level_info"><h5>DEFAULT</h5>owner of NFT controls file</div></div>
          <div class="crystal_key private-nft"><div class="key_level_info"><h5>ADVANCED</h5>set custom access restrictions</div></div>
        </div>

        <div class="textarea-container">
          <div class="saito-app-upload active-tab paste_event" id="vault-file-upload">
            <i class="fa-solid fa-file-arrow-up"></i>
            <div class="vault-file-upload-text">drag-and-drop file to upload</div>
    	  </div>
        </div>
      </div>

</div>
`;
  return html;
};
