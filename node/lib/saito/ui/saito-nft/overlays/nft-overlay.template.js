module.exports = (app, mod, nft) => {
  let identicon = app.keychain.returnIdenticon(nft.id);
  let deposit = nft.getDeposit();

  console.log('^');
  console.log('^');
  console.log('^');
  console.log('^');
  console.log('^');
  console.log('description--->' + nft.description + '<---');

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
    text = nft.js;
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

  html += `

          <div class="saito-nft-description">${nft.description}</div>
        </div>

        <div class="saito-nft-panel-footer">
          <button class="saito-nft-footer-btn enable">Enable</button>
          <button class="saito-nft-footer-btn disable">Disable</button>
          <button class="saito-nft-footer-btn split">Split</button>
          <button class="saito-nft-footer-btn merge">Merge</button>
          <button class="saito-nft-footer-btn send">Send</button>
        </div>
      </div>

      <div class="saito-nft-panel saito-nft-panel-send">
        <div class="saito-nft-panel-body">
          <h2 class="saito-nft-mode-title">Send NFT</h2>
          <label class="saito-nft-input-label">Recipient Address</label>
          <input class="saito-nft-input-field" id="nft-receiver-address" placeholder="xsXq…1aZx" />
          <label class="saito-nft-input-label">Quantity</label>
          <input class="saito-nft-input-field" value="1" />
        </div>

        <div class="saito-nft-panel-footer">
          <button class="saito-nft-footer-btn saito-nft-back-btn">Back</button>
          <button class="saito-nft-footer-btn saito-nft-confirm-btn">Confirm</button>
        </div>
      </div>

      <div class="saito-nft-panel saito-nft-panel-info">
        <div class="saito-nft-panel-body">
          <h2 class="saito-nft-mode-title">NFT Information</h2>
        </div>
        <div class="saito-nft-panel-footer">
          <button class="saito-nft-footer-btn saito-nft-delete-btn">Delete</button>
        </div>
      </div>

      <!-- UPDATED: Add data-skip-split -->
      <div class="saito-nft-panel saito-nft-panel-split" data-skip-split="true">
        <div class="saito-nft-panel-body">
          <h2 class="saito-nft-mode-title">Split NFT</h2>
          <p class="saito-nft-mode-desc">
            This NFT has multiple units. Drag the slider to determine how many
            units will remain in the original NFT (left) and how many will form
            the new NFT (right).
          </p>

          <div class="saito-nft-split-container">
             <div id="nft-details-split-bar"></div>
          </div>
        </div>

        <div class="saito-nft-panel-footer">
          <button class="saito-nft-footer-btn saito-nft-back-btn">Back</button>
          <button class="saito-nft-footer-btn saito-nft-confirm-btn saito-nft-confirm-split">Confirm</button>
        </div>
      </div>

      <div class="saito-nft-panel saito-nft-panel-merge" data-skip-merge="true">
        <div class="saito-nft-panel-body">
          <h2 class="saito-nft-mode-title">Merge NFT</h2>
          <p class="saito-nft-mode-desc">
            If you own multiple NFTs of the same type, you can combine them into a single, larger NFT.
          </p>
        </div>

        <div class="saito-nft-panel-footer">
          <button class="saito-nft-footer-btn saito-nft-back-btn">Back</button>

          <button id="saito-nft-confirm-merge" class="saito-nft-footer-btn saito-nft-confirm-btn">
            Confirm
          </button>
        </div>
      </div>

    </div>
  </div>
  `;

  return html;
};
