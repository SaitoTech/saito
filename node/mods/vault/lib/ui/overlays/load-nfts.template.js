module.exports = (app, mod) => {
  let html = `
    <div class="saito-nft-list vault-nfts">

      <header class="saito-overlay-form-header">
        <button type="button" class="create-nft-btn saito-button-square" data-vault-upload aria-label="Upload File"><i class="fa-solid fa-plus" aria-hidden="true"></i></button>
        <h2 class="saito-overlay-form-header-title">VAULT ACCESS KEYS</h2>
      </header>

      <div class="nft-list" id="nft-list">
      </div>

      <div id="nft-list-instructions" class="nft-list-instructions"></div>

    </div>
  `;
  return html;
};
