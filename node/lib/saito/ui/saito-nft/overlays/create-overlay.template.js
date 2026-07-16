module.exports = (app, mod) => {
  const saitoItems = [
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
  const title = saitoItems[Math.floor(Math.random() * saitoItems.length)];

  return `
<div class="create-nft-overlay">
  <div class="header">
    <div class="title">Create Saito NFT</div>
  </div>

  <div class="body">
    <div class="primary">
      <div>
        <div>
          <div class="label">NFT Type</div>
          <select id="create-nft-type-dropdown" style="padding: 1rem 2.2rem 1rem 1.5rem; font-size: 1.6rem;">
            <option value="image">Image</option>
            <option value="token">Token</option>
            <option value="text">Text</option>
            <option value="css">CSS</option>
            <option value="json">JSON</option>
            <option value="js">Javascript</option>
          </select>
        </div>
        <div>
          <span class="label">Quantity</span>
          <input
            type="text"
            inputmode="numeric"
            pattern="\\d*"
            oninput="this.value = this.value.replace(/\\D+/g, '')"
            id="create-nft-amount"
            value="1"
          />
        </div>
        <div>
          <span class="label">Deposit</span>
          <input
            type="text"
            inputmode="numeric"
            pattern="\\d*"
            placeholder="1"
            oninput="this.value = this.value.replace(/\\D+/g, '')"
            id="create-nft-deposit"
            value="1"
          />
        </div>
      </div>

      <div class="upload">
        <div class="saito-app-upload active-tab paste_event" id="nft-image-upload">
          <i class="fa-solid fa-file-image"></i>
          <div>drag-and-drop image to upload</div>
        </div>
        <textarea id="create-nft-textarea"></textarea>
      </div>

      <div class="footer">
        <div class="saito-anchor" id="create-nft-help-link"><span>need help?</span></div>
        <div class="get-saito-tokens"></div>
        <button id="next-step">Next Step</button>
      </div>
    </div>

    <div class="secondary">
      <div>
        <div class="label">Title</div>
        <input type="text" class="title" placeholder="${title}" />

        <div class="label ticker">Ticker</div>
        <input type="text" class="ticker" placeholder="optional" />

        <div class="label">Description</div>
        <textarea class="description" rows="4" placeholder="description (optional)"></textarea>
      </div>

      <div class="footer">
        <button id="back-btn" class="saito-button-secondary">Back</button>
        <button id="create_nft" class="saito-nft-footer-btn">Confirm</button>
      </div>
    </div>
  </div>
</div>
`;
};
