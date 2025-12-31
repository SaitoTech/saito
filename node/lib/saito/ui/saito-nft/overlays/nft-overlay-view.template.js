module.exports = (app, mod, nft_overlay) => {
  let nft = nft_overlay.nft;
  
  let title = 'Vintage Saito NFT';
  let saitoItems = [
    'Vintage Collectible',
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

  let text = '';
  if (nft.text) {
    text = nft.text;
  }
  if (nft.css) {
    text = nft.css;
  }
  if (nft.js) {
    text = nft.js;
  }
  if (nft.json) {
    text = nft.json;
  }

  let imageHtml = '';
  if (text == '') {
    imageHtml = `<div class="saito-nft-image" style="background-image:url('${nft?.image || '/saito/img/dreamscape.png'}')" ></div>`;
  } else {
    imageHtml = `<div class="saito-nft-image" style="background-image:url('${nft?.image || '/saito/img/dreamscape.png'}')" ><div class="saito-nft-text">${text}</div></div>`;
  }

  let descriptionHtml = '';
  if (nft.description && nft.description.trim()) {
    descriptionHtml = `
      <div class="saito-nft-description-box-overlay">
        <div class="saito-nft-description-text-overlay">${nft.description}</div>
      </div>
    `;
  }

  return `
    <div class="saito-nft-panel saito-nft-panel-view active">
      <div class="saito-nft-panel-body saito-nft-panel-body-view">
        <div class="saito-nft-image-wrapper">
          ${imageHtml}
          ${descriptionHtml}
        </div>
      </div>
      <div class="saito-nft-panel-footer">
        <button class="saito-nft-footer-btn enable">Enable</button>
        <button class="saito-nft-footer-btn disable">Disable</button>
        <button class="saito-nft-footer-btn send">Transfer</button>
      </div>
    </div>
  `;
};

