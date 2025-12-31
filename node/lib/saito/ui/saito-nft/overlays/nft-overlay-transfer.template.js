module.exports = (app, mod, nft_overlay) => {
  return `
    <div class="saito-nft-panel saito-nft-panel-send">
      <div class="saito-nft-panel-body">
        <h2 class="saito-nft-mode-title">Send NFT</h2>
        <label class="saito-nft-input-label">Recipient Address</label>
        <input class="saito-nft-input-field" id="nft-receiver-address" placeholder="xsXq…1aZx" />
      </div>
      <div class="saito-nft-panel-footer">
        <button class="saito-nft-footer-btn saito-nft-confirm-btn">Confirm</button>
      </div>
    </div>
  `;
};
