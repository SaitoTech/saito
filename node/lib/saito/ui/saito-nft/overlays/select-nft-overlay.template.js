module.exports = (ui) => {
  let html = `
    <div class="saito-nft-list">

      <header class="saito-overlay-form-header">
         <button type="button" id="create-nft" class="create-nft-btn saito-button-square" aria-label="Create NFT"><i class="fa-solid fa-plus" aria-hidden="true"></i></button>
         <h2 class="saito-overlay-form-header-title">${ui?.title ? ui.title : 'MY NFTs'}</h2>
      </header>

      <div class="nft-list" id="nft-list">
        <!-- renderNft() will fill this -->
      </div>

      <div id="nft-list-instructions" class="nft-list-instructions"></div>

    </div>
  `;
  return html;
};
