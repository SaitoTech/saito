module.exports = (app, mod) => {
  let html = `
    <div class="nft-list-container">

      <!-- HEADER -->
      <div class="saito-overlay-form-header">
         <div class="saito-overlay-form-header-title">MY NFTs</div>
         <div id="create-nft" class="create-nft-btn"><i class="fa-solid fa-plus"></i></div>
      </div>

      <!-- PAGE 1: NFT LIST -->
      <div id="page1" class="nft-page">
          <div class="nft-list" id="nft-list">
            <!-- renderNft() in send-nft.js will fill this -->
          </div>
      </div>


    </div>
  `;
  return html;
};
