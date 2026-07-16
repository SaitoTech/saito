let ProvideMetaDataOverlayTemplate = require('./create-overlay-metadata.template');

module.exports = (app, mod) => {
  let html = `
<div class="create-nft-container">
   
      <div class="saito-overlay-form-header">
         <div class="saito-overlay-form-header-title">
            <div>
               Create Saito NFT
            </div>
         </div>
      </div>

      <div class="nft-creator-overlay panels">
          <div class="nft-creator saito-nft-panel">
                <div class="dropdown-cont">

            <div class="withdraw-info-cont">
                  <div class="withdraw-info-title">NFT Type</div>
                  <select class="create-nft-type-dropdown" id="create-nft-type-dropdown" style="padding: 1rem 2.2rem 1rem 1.5rem; font-size: 1.6rem;">
                     <option value="image">Image</option>
                     <option value="token">Token</option>
                     <option value="text">Text</option>
                     <option value="css">CSS</option>
                     <option value="json">JSON</option>
                     <option value="js">Javascript</option>
                  </select>
                </div>

                <div class="withdraw-info-cont">
                  <span class="withdraw-info-title">Quantity</span> 
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
                  <span class="withdraw-info-title">Deposit</span> 
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
                   <i class="fa-solid fa-file-image"></i>
                   <div class="nft-upload-text">drag-and-drop image to upload</div>
                </div>
                <textarea class="create-nft-textarea" id="create-nft-textarea"></textarea>
             </div>

            <div class="saito-button-row">
                <div class="saito-anchor" id="create-nft-help-link"><span>need help?</span></div>    
                 <div class="get-saito-tokens"></div>
                 <button id="next-step">Next Step</button>
            </div>
          </div>

          ${ProvideMetaDataOverlayTemplate()}
      </div>

</div>
`;
  return html;
};
