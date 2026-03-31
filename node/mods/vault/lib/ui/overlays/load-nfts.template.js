module.exports = (app, mod) => {
  let html = `
    <div class="nft-list-container vault-nfts">

      <div class="saito-overlay-form-header">
        <div class="saito-overlay-form-header-title">NFT ACCESS KEYS</div>
        <div id="create-access-nft" class="create-nft-btn"><i class="fa-solid fa-upload"></i></div>
      </div>

      <div class="nft-page">
        <div class="nft-list" id="nft-list">
        </div>
      </div>

    </div>
  `;
  return html;
};
