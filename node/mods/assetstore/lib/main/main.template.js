module.exports = (app, mod, this_self) => {
  let html = `
    <div class="saito-container" id="saito-container">

      <div class="saito-sidebar left">
        <div class="saito-button-primary list-asset">list asset</div>
        <div class='saito-store-explorer-title'>
          <span>Stores</span>
          <div class='add-store store-absolute-icon'><i class="fa-solid fa-magnifying-glass-plus"></i></div>
        </div>
        <div class="saito-store-explorer saito-menu-select-heavy">
          <div class='saito-store-page-tab' data-pkey='${mod.SAITO_OFFICIAL_PUBLICKEY}'>
            <i class="fas fa-house"></i>
            <span>SaitoOfficial</span>
          </div>
          <div class='saito-store-page-tab' data-pkey='${mod.publicKey}'>
            <i class="fa-solid fa-store"></i>
            <span>My Listings</span>
            <div class="store-link store-absolute-icon"><i class="fa-solid fa-link"></i></div>
          </div>
        </div>
        <select class="saito-form-select saito-store-explorer-mobile">
          <option value="${mod.SAITO_OFFICIAL_PUBLICKEY}">home</option>
          <option value="${mod.publicKey}">my store</option>
        </select>
        <div class="saito-store-mobile-header-icon">
          <div class='my-store'>
            <div class='store-link store-absolute-icon'><i class="fa-solid fa-link"></i></div>
          </div>
          <div class='other-store'></div>
          <div class='home-store'><div class='add-store store-absolute-icon'><i class="fa-solid fa-magnifying-glass-plus"></i></div></div>
        </div>
      </div>

      <div class="saito-main">
        <div id="assetstore-empty">No items for auction yet</div>
        <div class="assetstore-table">
          <div class="assetstore-table-list"></div>
        </div>
      </div>`;

  if (app.browser.returnURLParameter('seller') || app.browser.returnURLParameter('listing')) {
  } else {
    html += `
      <div class="asset-store-splash saito-cta">
        <div class='store-img-flip'>
          <div class='store-img-front'>
            <img src="/store/img/splash.png">
          </div>
          <div class='store-img-back'>
            <div class='store-img-back-content'>
              <h3>How it works</h3>
              <div class='store-features-list'>
                <div>Select an asset from your wallet</div>
                <div>Set a desired sell price</div>
                <div>Transfer ownership to the store</div>
                <div>Receive payment when someone buys asset</div>
                <div>Revoke listing at any time</div>
              </div>
            </div>
          </div>
        </div>
        <div class="store-splash-content">
          <h2>Commerce without Limits</h2>
          <p>Web3 powered platform for buying and selling <span class='mobile-hide'>NFTs, which are more than just jpegs of cartoon monkeys. SaitoNFTs can be</span> limited collectibles, <span class='mobile-hide'>but they can also be</span> mini-programs, new css themes, access keys to Vault or Stack subscriptions, or even your own meme-coin</p>
          <div class='saito-button-row auto-size'>
            <button id="my-store-btn" class="saito-button-secondary">My Store</button>
            <button id="home-store-btn" class="saito-button-primary">Browse Assets</button>
          </div>
        </div>
      </div>
    `;
  }

  html += '</div>';

  return html;
};
