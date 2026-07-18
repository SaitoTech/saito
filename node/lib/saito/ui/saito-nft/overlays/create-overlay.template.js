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
<div class="saito-nft-create">
  <header class="header">
    <h2 class="title">Create Saito NFT</h2>
  </header>

  <div class="body">
    <section class="primary">
      <div class="create-nft-field-row">
        <div class="create-nft-field create-nft-field-start">
          <label class="label" for="create-nft-type-dropdown">NFT Type</label>
          <select id="create-nft-type-dropdown" class="saito-form-select">
            <option value="image">Image</option>
            <option value="token">Token</option>
            <option value="text">Text</option>
            <option value="css">CSS</option>
            <option value="json">JSON</option>
            <option value="js">Javascript</option>
          </select>
        </div>
        <div class="create-nft-field">
          <label class="label" for="create-nft-amount">Quantity</label>
          <input class="saito-input"
            type="text"
            inputmode="numeric"
            pattern="\\d*"
            oninput="this.value = this.value.replace(/\\D+/g, '')"
            id="create-nft-amount"
            value="1"
          />
        </div>
        <div class="create-nft-field">
          <label class="label" for="create-nft-deposit">Deposit</label>
          <input class="saito-input"
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
        <textarea id="create-nft-textarea" class="saito-textarea"></textarea>
      </div>

      <footer class="footer">
        <div class="saito-anchor" id="create-nft-help-link"><span>need help?</span></div>
        <div class="get-saito-tokens"></div>
        <button id="next-step" class="saito-button-primary">Next Step</button>
      </footer>
    </section>

    <section class="secondary">
      <div class="create-nft-fields">
        <label class="label" for="create-nft-title">Title</label>
        <input type="text" id="create-nft-title" class="title saito-input" placeholder="${title}" />

        <label class="label ticker" for="create-nft-ticker">Ticker</label>
        <input type="text" id="create-nft-ticker" class="ticker saito-input" placeholder="optional" />

        <label class="label" for="create-nft-description">Description</label>
        <textarea id="create-nft-description" class="description saito-textarea" rows="4" placeholder="description (optional)"></textarea>
      </div>

      <footer class="footer">
        <button id="back-btn" class="saito-button-secondary">Back</button>
        <button id="create_nft" class="saito-nft-footer-btn">Confirm</button>
      </footer>
    </section>
  </div>
</div>
`;
};
