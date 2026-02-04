module.exports = (app, mod, nft) => {
  let identicon = '';
  if (nft.id == null || nft.id == '') {
    identicon = app.keychain.returnIdenticon('');
  } else {
    identicon = app.keychain.returnIdenticon(nft.id);
  }

  let price = nft.getBuyPriceSaito();
  let title = 'Vintage Saito NFT';

  let saitoItems = [
    'Vintage Collectable',
    'Classic Saito NFT',
    'Genesis Collectable',
    'Saito Heritage Item',
    'Unique Item',
    'Historical Saito Mint',
    'Provenance Edition',
    'Founders Edition',
    'NFT Collectable',
    'Unique Item',
    'Saito Legacy',
    'Rare Saito Artifact',
    'Limited Saito Release',
    'Archival Series',
    'Original Chain Relic',
    'Timeless Collectable',
    'Retro Blockchain Piece',
    'Immutable Classic',
    'Chain Memory Artifact',
    'Saito Vault Item',
    'Eternal Collectable'
  ];
  title = saitoItems[Math.floor(Math.random() * saitoItems.length)];
  if (nft.title) {
    title = nft.title;
  }
  if (nft.description) {
    description = nft.description;
  }

  let html = `

<div class="store-card nft-card nfttxsig${nft.tx_sig}" id="nft-card-${nft.uuid}">
  <div class="store-card-image nft-card-img">
    <div class="store-card-overlay">
      <button class="store-buy-now-btn">Buy Now</button>
      <img class="store-nft-identicon nft-identicon" src="${identicon}" alt="NFT Identicon">
    </div>
  </div>
  <div class="store-card-info">
    <div class="store-card-price">${app.browser.formatDecimals(price, true)} SAITO</div>
    <div class="store-card-title">${title}</div>
    <div class="store-card-seller">seller: <span style="font-style:italic">${app.keychain.returnUsername(nft.seller).toLowerCase()}</span></div>
  </div>
</div>

  `;

  return html;
};
