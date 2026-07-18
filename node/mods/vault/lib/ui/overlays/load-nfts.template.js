module.exports = (app, mod) => {
  let html = `
    <div class="nft-list-container vault-nfts">

      <header class="saito-overlay-form-header">
        <h2 class="saito-overlay-form-header-title">NFT ACCESS KEYS</h2>
      </header>

      <div class="nft-list" id="nft-list">
      </div>

    </div>
  `;
  return html;
};
