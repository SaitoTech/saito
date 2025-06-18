module.exports = (app, mod) => {
  let html = `
<div class="container create-nft-container">
   
      <div class="saito-overlay-form-header nft-title">
         <div class="saito-overlay-form-header-title">
            <div>
               Create NFT
            </div>
            <div class="nft-link" id="nft-link">
               <span>send nft</span> 
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
              <span class="withdraw-info-title">num of nfts</span> 
              <div class="withdraw-info-value create-nft-amount" id="create-nft-amount">1</div>
            </div>


            <div class="withdraw-info-cont">
              <span class="withdraw-info-title">network fee</span> 
              <div class="withdraw-info-value fee">0 SAITO</div>
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

      <div class="create-button nft-inactive">
         <button id="create_nft">Create NFT</button>
      </div>
</div>
`;
  return html;
};
