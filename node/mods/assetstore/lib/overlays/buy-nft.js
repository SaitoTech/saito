const NftDetailsOverlay = require('./../../../../lib/saito/ui/saito-nft/overlays/nft-overlay');

class BuyNftOverlay extends NftDetailsOverlay {

  constructor(app, mod) {

    super(app, mod, false);

  }

  async render() {

    super.render();

    let this_self = this;

    const root = this._overlayRoot || document;
    const mount = root.getElementById ? root : document;
    const target = mount.getElementById('nft-details-send');
    if (!target) { return; }

    const price = (this.nft?.price != null ? this.nft.price : '');
    const html = `
      <div class="nft-details-action" id="nft-details-send">
        <div class="nft-details-buy" style="display:none">
          <div class="nft-buy-row">
            <div class="nft-details-confirm-msg">Confirm buy this asset for ${await this.nft.getPrice()} SAITO?</div>
          </div>
          <div class="saito-button-row auto-fit">
            <button id="cancel" class="saito-button-secondary cancel-action">Close</button>
            <button id="confirm_buy" class="saito-button-primary">Buy Now</button>
          </div>
        </div>
        <div class="nft-details-send" style="display:none">
          <div class="nft-buy-row">
            <div class="nft-details-confirm-msg">Confirm delist this asset from assetstore?</div>
          </div>
          <div class="saito-button-row auto-fit">
            <button id="cancel2" class="saito-button-secondary cancel-action">Close</button>
            <button id="confirm_delist" class="saito-button-primary">Delist</button>
          </div>
        </div>
      </div>
    `;
    this.app.browser.replaceElementById(html, 'nft-details-send');

    const sendBtnLabel = mount.getElementById('send');
    if (sendBtnLabel) sendBtnLabel.textContent = 'Buy';

    const cancel = mount.getElementById('cancel');
    if (cancel) {
      cancel.onclick = () => {
        this.overlay.close();
      }
    }
    const cancel2 = mount.getElementById('cancel2');
    if (cancel2) { 
      cancel2.onclick = () => {
        this.overlay.close();
      }
    }

    const buy = mount.getElementById('confirm_buy');
    if (buy) {
      buy.onclick = async (e) => {
        e.preventDefault();
        try {
          const buyTx = await this.mod.createPurchaseAssetTransaction(this.nft);
          await this.app.network.propagateTransaction(buyTx);
          this.overlay.hide();
          siteMessage('Purchase submitted. Waiting for network confirmation...', 3000);
        } catch (err) {
          salert('Failed to buy: ' + (err));
        }
      };
    }

  }
}

module.exports = BuyNftOverlay;
