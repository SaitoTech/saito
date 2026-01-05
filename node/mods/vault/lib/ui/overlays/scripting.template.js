module.exports = (app, mod, scripting_overlay={}) => {

  let msg = `

    <div class="create-nft-container">
   
      <div class="saito-overlay-form-header">
         <div class="saito-overlay-form-header-title">
            <div>
               PROVIDE ACCESS SCRIPT
            </div>
         </div>
      </div>

      <div class="nft-creator">
        <div class="dropdown-cont vault-scripting-intro">
	  Advanced users may compose custom access-scripts to regulate vault
	  access. If you are not sure how to use this functionality, you
	  almost certainly want to create a public key.
        </div>

        <div class="textarea-container">
<textarea class="create-nft-textarea create-nft-script-textarea" id="create-nft-textarea" style="display: flex;">{
  "op": "CHECKHASH",
  "hash": "5fbf08af2b116ab8f7f3c14b8ec01a46ce23d290e2ebc7a752d0982d54c054f2"
}
</textarea>
        </div>
      </div>

        <div class="create-nft-btn-row">
            <div class="create-nft-help-link" id="create-nft-help-link">need help?</div>    
            <div class="saito-button-row">
                 <button id="mint_scripting_key_btn">Create NFT Key!</button>
            </div>
        </div>
`;

  return msg;

};
