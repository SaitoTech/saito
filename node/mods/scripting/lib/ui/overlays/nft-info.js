const SaitoOverlay = require('./../../../../../lib/saito/ui/saito-overlay/saito-overlay');

class NFTInfoOverlay {

  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
    this.nft = null;
    this.overlay = new SaitoOverlay(app, mod, false);
  }

  render() {
    const html = `
<div class="nft-details-panel">
  <div class="nft-details-header">NFT Details</div>

  <div class="nft-details-row">
    <span class="nft-label">ID</span>
    <span class="nft-value" id="nft-id">—</span>
  </div>

  <div class="nft-details-row">
    <span class="nft-label">Creator</span>
    <span class="nft-value" id="nft-creator">—</span>
  </div>

  <div class="nft-details-row">
    <span class="nft-label">Amount</span>
    <span class="nft-value" id="nft-amount">—</span>
  </div>

  <div class="nft-details-row">
    <span class="nft-label">Slip 1</span>
    <span class="nft-value" id="nft-slip1">—</span>
  </div>

  <div class="nft-details-row">
    <span class="nft-label">Slip 2</span>
    <span class="nft-value" id="nft-slip2">—</span>
  </div>

  <div class="nft-details-row">
    <span class="nft-label">Slip 3</span>
    <span class="nft-value" id="nft-slip3">—</span>
  </div>
</div>

    `;

    this.overlay.show(html);
    this.attachEvents();
  }

  attachEvents() {

  }

}

module.exports = NFTInfoOverlay;

