module.exports = (app, mod, nft) => {
  let identicon = '';
  if (nft.id == null || nft.id == '') {
    identicon = app.keychain.returnIdenticon('');
  } else {
    identicon = app.keychain.returnIdenticon(nft.id);
  }

  let price = nft.getBuyPriceSaito();

  if (nft.description) {
    description = nft.description;
  }

  let html = `

<div class="store-card ${nft.metadata?.active == 0 ? 'pending' : ''}" id="nft-listing-${nft.tx_sig}">
  <div class="store-card-image">
    <div class="store-card-overlay">
      <button class="store-buy-now-btn">Buy Now</button>
      <img class="store-nft-identicon nft-identicon" src="${identicon}" alt="NFT Identicon">
    </div>
  </div>
  <div class="store-card-info">
    <div class="store-card-title">${nft?.title || 'Vintage Saito NFT'}</div>
    <div><span class="store-card-type">${nft.returnType()}</span></div>
    <div class="store-card-details">by ${app.keychain.returnUsername(nft.creator).toLowerCase()}</div>
    <div class="store-card-details">${app.browser.formatTimeDifference(nft.metadata.created_at)}</div>
    <!--div>Units: ${nft.getTotalAmount()}</div-->
    <div class="store-card-description">${nft.description}</div>    
    <div class="store-card-price">${app.browser.formatDecimals(price, true)} SAITO</div>
  </div>
</div>

  `;

  return html;
};
