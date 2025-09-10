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
            <select class="create-nft-type-dropdown" id="create-nft-type-dropdown">
               <option value="image">Image NFT</option>
               <option value="text">Text NFT</option>
            </select>

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
              <span class="withdraw-info-title">Deposit (in SAITO)</span> 
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
            <textarea class="create-nft-textarea" id="create-nft-textarea">
            </textarea>
         </div>
      </div>

      <div class="saito-button-row">
         <button id="create_nft">Create NFT</button>
      </div>
</div>
`;
  return html;
};
