module.exports = (app, mod) => {
  let html = `
<div class="create-nft-container">
   
      <div class="saito-overlay-form-header">
         <div class="saito-overlay-form-header-title">
            <div>
               Create NFT
            </div>
         </div>
      </div>

      <div class="nft-creator">
            <div class="dropdown-cont">

	    <div class="withdraw-info-cont">
              <div class="withdraw-info-title">NFT Type</div>
              <select class="create-nft-type-dropdown" id="create-nft-type-dropdown" style="padding: 1rem 1.5rem; font-size: 1.6rem;">
                 <option value="image">Image</option>
                 <option value="text">Text</option>
                 <option value="css">CSS</option>
                 <option value="json">JSON</option>
                 <option value="js">Javascript</option>
              </select>
            </div>

            <div class="withdraw-info-cont">
              <span class="withdraw-info-title">Quantity</span> 
            <!--
              <div class="withdraw-info-value create-nft-amount" id="create-nft-amount">1</div>
            -->

               <input
                 type="text"
                 inputmode="numeric"
                 pattern="\d*"
                 oninput="this.value = this.value.replace(/\D+/g, '')"
                 class="create-nft-amount" id="create-nft-amount" 
                 value="1"
               />

            </div>
            

            <div class="withdraw-info-cont">
              <span class="withdraw-info-title">Cost (SAITO)</span> 
               <input
                 type="text"
                 inputmode="numeric"
                 pattern="\d*"
                 placeholder="1"
                 oninput="this.value = this.value.replace(/\D+/g, '')"
                 class="create-nft-amount" id="create-nft-deposit" 
                 value="1"
               />
              
            </div>
          </div>

         <div class="textarea-container">
            <div class="saito-app-upload active-tab paste_event" id="nft-image-upload">
               drag-and-drop NFT image
            </div>
            <textarea class="create-nft-textarea" id="create-nft-textarea"></textarea>
         </div>
      </div>

        <div class="create-nft-btn-row">
            <div class="create-nft-help-link" id="create-nft-help-link">need help?</div>    
            <div class="saito-button-row">
                 <button id="create_nft">Next Step</button>
            </div>
        </div>

</div>
`;
  return html;
};
