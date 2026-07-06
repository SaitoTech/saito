module.exports = (app, mod, witness_overlay = {}) => {
  let msg = `

    <div class="create-nft-container">
   
      <div class="saito-overlay-form-header">
         <div class="saito-overlay-form-header-title">
            <div>
               PROVIDE WITNESS DATA
            </div>
         </div>
      </div>

      <div class="nft-creator">
        <div class="dropdown-cont vault-scripting-intro">
	  This file is protected by a custom access script. Edit the JSON below to
	  include any witness fields required to unlock the file, then submit.
        </div>

        <div class="witness-textarea-container">
          <label class="witness-textarea-label" for="witness-access-script-textarea">Access Script:</label>
          <textarea
            class="witness-access-script-textarea"
            id="witness-access-script-textarea"
            spellcheck="false"
          ></textarea>
        </div>
      </div>

        <div class="create-nft-btn-row">
            <div class="create-nft-help-link" id="witness-help-link">need help?</div>    
            <div class="saito-button-row">
                 <button id="download_with_witness_btn">Download File</button>
            </div>
        </div>
`;

  return msg;
};
