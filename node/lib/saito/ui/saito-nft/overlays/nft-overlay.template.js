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
    <div class="saito-nft-overlay header">
      <div class="saito-nft-header-left">
        <div class="saito-identicon-box">
          <img class="saito-identicon" src="${identicon}" data-disable="true" />
        </div>
        <div class="saito-nft-header-text">
          <div class="saito-nft-header-title">${title}</div>
          <div class="saito-nft-header-sub">by ${nft.creator}</div>
        </div>
      </div>
      <div class="saito-nft-header-right">
        <div class="saito-nft-header-btn"><i class="fa-solid fa-bars"></i></div>
      </div>
    </div>
    <div class="saito-nft-overlay panels">
      ${viewPanel}
      ${transferPanel}
      ${infoPanel}
    </div>
  </div>
  `;
};
