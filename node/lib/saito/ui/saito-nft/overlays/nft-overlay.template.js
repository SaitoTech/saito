let NFTOverlayViewTemplate = require('./nft-overlay-view.template');
let NFTOverlayTransferTemplate = require('./nft-overlay-transfer.template');
let NFTOverlayInfoTemplate = require('./nft-overlay-info.template');

module.exports = (app, mod, nft_overlay) => {
  let nft = nft_overlay.nft;
  let identicon = app.keychain.returnIdenticon(nft.id);

  let title = nft?.title || 'Vintage Saito NFT';

  // Compose all panels together - they must be siblings for CSS transitions
  let viewPanel = NFTOverlayViewTemplate(app, mod, nft_overlay);
  let transferPanel = NFTOverlayTransferTemplate(app, mod, nft_overlay);
  let infoPanel = NFTOverlayInfoTemplate(app, mod, nft_overlay);

  return `
  <div class="saito-nft-overlay-container">
    <header class="saito-nft-overlay header">
      <div class="saito-nft-header-left">
        <div class="saito-identicon-box">
          <img class="saito-identicon" src="${identicon}" data-disable="true" />
        </div>
        <div class="saito-nft-header-text">
          <h2 class="saito-nft-header-title">${title}</h2>
          <div class="saito-nft-header-sub">by ${nft.creator}</div>
        </div>
      </div>
      <button type="button" class="saito-nft-header-btn" aria-label="Menu"><i class="fa-solid fa-bars"></i></button>
    </header>
    <div class="saito-nft-overlay panels">
      ${viewPanel}
      ${transferPanel}
      ${infoPanel}
    </div>
  </div>
  `;
};
