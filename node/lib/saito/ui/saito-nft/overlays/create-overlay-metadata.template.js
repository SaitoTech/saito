module.exports = (app, mod) => {
  let defaultTitle = 'Click to provide title (optional)';
  let defaultDescription = 'Click to provide description (optional)';

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
  let title = saitoItems[Math.floor(Math.random() * saitoItems.length)];

  let html = `

      <div class="saito-nft-panel nft-metadata">
        <div class="saito-nft-panel-body">
          <div class="nft-creator-content-wrapper">
  `;

  html += `
            <h3>Provide Metadata</h3>

            <div class="saito-nft-input-label">Title</div>
            <input type="text" class="saito-nft-metadata-box title" placeholder="${title}"></input>

            <div class="saito-nft-input-label">Description</div>
            <textarea class="saito-nft-metadata-box description" rows="4" placeholder="${'description (optional)'}"></textarea>
          </div>
        </div>

        <div class="saito-nft-panel-footer">
          <button id="back-btn" class='saito-button-secondary'>Back</button>
          <button id="create_nft" class="saito-nft-footer-btn">Confirm</button>
        </div>
      </div>


  `;

  return html;
};
