module.exports = (ui) => {
  let html = `
    <div class="nft-list-container">

      <header class="saito-overlay-form-header">
         <h2 class="saito-overlay-form-header-title">${ui?.title ? ui.title : 'MY NFTs'}</h2>
         <div id="create-nft" class="create-nft-btn"><i class="fa-solid fa-plus"></i></div>
      </header>

      <div class="nft-list" id="nft-list">
        <!-- renderNft() will fill this -->
      </div>

      <div id="nft-list-instructions" class="nft-list-instructions"></div>

    </div>
  `;
  return html;
};
