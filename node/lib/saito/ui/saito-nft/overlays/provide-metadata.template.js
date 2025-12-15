module.exports = (app, mod, nfttx, nft) => {
  let identicon = app.keychain.returnIdenticon(nft.id);
  let description = 'Click here to provide include a text description for your NFT...';
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

  let text = '';
  if (nft.text) {
    text = nft.text;
  }
  if (nft.css) {
    text = nft.css;
  }
  if (nft.json) {
    text = nft.json;
  }
  if (nft.js) {
    icext = nft.js;
  }

  let html = `

  <div class="saito-nft-overlay-container">

    <div class="saito-nft-overlay header">
      <div class="saito-nft-header-left">
        <div class="saito-identicon-box">
          <img class="saito-identicon" src="${identicon}" data-disable="true" />
        </div>
        <div class="saito-nft-header-text">
          <div class="saito-nft-header-title editable">${nft.title || title}</div>
          <div class="saito-nft-header-sub">by ${nft.creator}</div>
        </div>
      </div>

      <div class="saito-nft-header-right">
        <div class="saito-nft-header-btn">⋯</div>
      </div>
    </div>

    <div class="saito-nft-overlay panels">
      <div class="saito-nft-panel saito-nft-panel-view active .create-nft-container">
        <div class="saito-nft-panel-body nft-creator">

  `;
  if (nft.image) {
    html += `
		<div class="nft-image-preview">
                  <img style="max-height: 100%; max-width: 100%; height: inherit; width: inherit" src="${nft.image}"/>
                  <i class="fa fa-times" id="rmv-nft"></i>
                </div>
	    `;
  } else {
    html += `
              <div class="textarea-container">
                <div class="saito-app-upload active-tab paste_event" id="nft-image-upload">
                  drag-and-drop to add image to NFT (optional)
                </div>
                <textarea class="create-nft-textarea" id="create-nft-textarea"></textarea>
              </div>
	    `;
  }

  html += `
          <div class="saito-nft-description">${nft.description}</div>
        </div>

        <div class="saito-nft-panel-footer">
          <button class="saito-nft-footer-btn edit-title">Edit Title</button>
          <button class="saito-nft-footer-btn edit-description">Edit Description</button>
          <button class="saito-nft-footer-btn send">Confirm</button>
        </div>
      </div>

      <div class="saito-nft-panel saito-nft-panel-info">
        <div class="saito-nft-panel-body">
          <h2 class="saito-nft-mode-title">NFT Information</h2>
        </div>
      </div>

    </div>
  </div>
  `;

  return html;
};
