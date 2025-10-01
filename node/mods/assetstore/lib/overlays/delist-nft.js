const NftDetailsOverlay = require('./../../../../lib/saito/ui/saito-nft/overlays/nft-overlay');

class DelistNftOverlay extends NftDetailsOverlay {

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

    const price = (nft?.price != null ? nft.price : '');
    const html = `
      <div class="nft-details-action" id="nft-details-send">
        <div class="nft-details-buy" style="display:none">
          <div class="nft-buy-row">
            <div class="nft-details-confirm-msg">Confirm buy this asset for ${await nft.getPrice()} SAITO?</div>
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

    const delist = mount.getElementById('confirm_delist');
    if (delist) {
      delist.onclick = async (e) => {
        e.preventDefault();
        try {
          let nft_txsig = this.nft.tx_sig
          let delist_drafts = this.app.options?.assetstore?.delist_drafts;

          if (delist_drafts[nft_txsig]) {
            let delist_tx = new Transaction();
            delist_tx.deserialize_from_web(this.app, delist_drafts[nft_txsig]);
            this_self.app.network.propagateTransaction(delist_tx);
	    this_self.overlay.close();
            siteMessage('Delist request submitted. Waiting for network confirmation…', 3000);
          } else {
            siteMessage('Unable to find delist transaction', 3000);
          }
        } catch (err) {
          salert('Failed to delist: ' + (err?.message || err));
        }
      };
    }

  }
}

module.exports = DelistNftOverlay;
