module.exports = (app, mod) => {
  let html = `
    <div class="nft-list-container">

      <div class="saito-overlay-form-header">
         <div class="saito-overlay-form-header-title">MY NFTs</div>
         <div id="create-nft" class="create-nft-btn"><i class="fa-solid fa-plus"></i></div>
      </div>

      <div id="page1" class="nft-page">
          <div class="nft-list" id="nft-list">
            <!-- renderNft() in send-nft.js will fill this -->
          </div>
      </div>


    </div>
  `;
  return html;
};
