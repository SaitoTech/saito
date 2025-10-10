let Transaction = require('./../../../../lib/saito/transaction').default;
let NftDetailsOverlay = require('./../../../../lib/saito/ui/saito-nft/overlays/nft-overlay');

class DelistNftOverlay extends NftDetailsOverlay {
  constructor(app, mod) {
    super(app, mod, false);
  }

  async render() {
    await super.render();

    let root  = this.overlay?.el || document;

    let panel = root.getElementById('nft-details-send');
    if (!panel) return;

    panel.innerHTML = `
      <div class="nft-details-delist" style="display:none">
        <div class="nft-buy-row">
          <div class="nft-details-confirm-msg">
            Confirm delist this asset from assetstore?
          </div>
        </div>
        <div class="saito-button-row auto-fit">
          <button id="cancel2" class="saito-button-secondary cancel-action">Close</button>
          <button id="confirm_delist" class="saito-button-primary">Delist</button>
        </div>
      </div>
    `;

    let header_send_btn = root.getElementById('send');
    if (header_send_btn) header_send_btn.textContent = 'Delist';

    let cancel2 = root.getElementById('cancel2');
    if (cancel2) cancel2.onclick = () => this.overlay.close();

    let delist = root.getElementById('confirm_delist');
    if (delist) {
      delist.onclick = async (e) => {
        e.preventDefault();
        try {
          let nfttx_sig = this.nft?.tx_sig;
          let drafts = this.app.options?.assetstore?.delist_drafts || {};
          let delist_tx_serialized = drafts[nfttx_sig];
          if (!delist_tx_serialized) return siteMessage('Unable to find delist transaction', 3000);

          this.app.network.sendRequestAsTransaction(
            'request delist complete',
            { nft_tx : delist_tx_serialized },
            () => {},
            this.mod.assetStore.peerIndex
          );



          this.overlay.close();
          siteMessage('Delist request submitted. Waiting for network confirmation…', 3000);
        } catch (err) {
          salert('Failed to delist: ' + (err?.message || err));
        }
      };
    }

    this.showDelist();
  }

  showDelist() {

    let root = this.overlay?.el || document;
    let buy_section    = root.querySelector('.nft-details-buy');
    let delist_section = root.querySelector('.nft-details-delist');
    let header_send_btn = root.getElementById('send');

    if (buy_section)    	{ buy_section.style.display = 'none'; }
    if (delist_section) 	{ delist_section.style.display = ''; }
    if (header_send_btn)	{ header_send_btn.textContent = 'Delist'; }
  }
}


module.exports = DelistNftOverlay;
