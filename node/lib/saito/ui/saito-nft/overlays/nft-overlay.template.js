module.exports = (app, mod, nft_overlay) => {

  let nft = nft_overlay.nft;
  let can_merge = nft_overlay.can_merge;
  let can_split = nft_overlay.can_split;
  let identicon = app.keychain.returnIdenticon(nft.id);
  let deposit = nft.getDeposit();

  let description = '';
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
  if (nft.description) {
    description = nft.description;
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

  let html = `

  <div class="saito-nft-overlay-container">

    <div class="saito-nft-overlay header">
      <div class="saito-nft-header-left">
        <div class="saito-identicon-box">
          <img class="saito-identicon" src="${identicon}" data-disable="true" />
        </div>
        <div class="saito-nft-header-text">
          <div class="saito-nft-header-title">${nft.title || title}</div>
          <div class="saito-nft-header-sub">by ${nft.creator}</div>
        </div>
      </div>

      <div class="saito-nft-header-right">
        <div class="saito-nft-header-btn">⋯</div>
      </div>
    </div>

    <div class="saito-nft-overlay panels">
      <div class="saito-nft-panel saito-nft-panel-view active">
        <div class="saito-nft-panel-body">`;

  if (text == '') {
    html += `<div class="saito-nft-image" style="background-image:url('${nft?.image || '/saito/img/dreamscape.png'}')" ></div>`;
  } else {
    html += `<div class="saito-nft-image" style="background-image:url('${nft?.image || '/saito/img/dreamscape.png'}')" ><div class="saito-nft-text">${text}</div></div>`;
  }

  if (nft.description) {
    html += `
      <div class="saito-nft-description">${nft.description}</div>
    `;
  }

  html += `
        </div>
        <div class="saito-nft-panel-footer">
          <button class="saito-nft-footer-btn enable">Enable</button>
          <button class="saito-nft-footer-btn disable">Disable</button>
          <button class="saito-nft-footer-btn send">Transfer</button>
        </div>
      </div>

      <div class="saito-nft-panel saito-nft-panel-send">
        <div class="saito-nft-panel-body">
          <h2 class="saito-nft-mode-title">Send NFT</h2>
          <label class="saito-nft-input-label">Recipient Address</label>
          <input class="saito-nft-input-field" id="nft-receiver-address" placeholder="xsXq…1aZx" />
        </div>

        <div class="saito-nft-panel-footer">
          <button class="saito-nft-footer-btn saito-nft-back-btn">Back</button>
          <button class="saito-nft-footer-btn saito-nft-confirm-btn">Confirm</button>
        </div>
      </div>

      <div class="saito-nft-panel saito-nft-panel-info">
        <div class="saito-nft-panel-body">
          <h2 class="saito-nft-mode-title">NFT Information</h2>

	  <div class="saito-nft-table saito-table">
`;
	  if (can_merge) {
            html += `<button class="saito-nft-footer-btn merge">Merge</button>`;
	  }
	  if (can_split) {
	    for (let z = 0; z < nft_overlay.all_slips.length; z++) {
              html += `
                <div class="nft-details-split-utxo utxo-${z+1}" id="utxo_${z+1}">
                  <div class="utxo-idx">${z+1}</div>
                  <div class="utxo-amount">${nft_overlay.all_slips[z].slip1.amount}</div>
                  <div class="utxo-deposit">${nft_overlay.all_slips[z].slip2.amount}</div>
                  <div class="utxo-split-btn" id="${z+1}">[ split ]</div>
                </div>
              `;
	    }
	  }

html += `
	  </div>
`;
	if (can_split) {
	  html += `
            <div class="saito-nft-split-container">
              <div id="nft-details-split-bar">
                <!-- JS will insert the slider here -->
              </div>
            </div>
	  `;
	}
html += `
        </div>
          <div class="saito-nft-split-utxo">
	  </div>

        <div class="saito-nft-panel-footer">
          <button class="saito-nft-footer-btn saito-nft-delete-btn">Delete</button>
        </div>
      </div>

    </div>
  </div>
  `;

  return html;
};
