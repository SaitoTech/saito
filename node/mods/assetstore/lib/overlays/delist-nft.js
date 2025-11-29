let Transaction = require('./../../../../lib/saito/transaction').default;
let NFTDetailsOverlay = require('./../../../../lib/saito/ui/saito-nft/overlays/nft-overlay');

class DelistNFTOverlay extends NFTDetailsOverlay {
  constructor(app, mod) {
    super(app, mod, false);
  }

  async render() {

    await super.render();

    let root  = this.overlay?.el || document;

    let panel = root.getElementById('nft-details-send');
    if (!panel) { return; }

    panel.innerHTML = `
      <div class="nft-details-delist" style="display:none">
        <div class="nft-buy-row">
          <div class="nft-details-confirm-msg">
            Are you sure you want to delist this from the Store and transfer the item back to your wallet?
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

    let delist = root.getElementById('confirm_delist');
    if (delist) {
      delist.onclick = async (e) => {
        e.preventDefault();
        try {

	  //
	  // fetch thedelisting transaction
	  //
          let nfttx_sig = this.nft?.tx_sig;
          let drafts = this.app.options?.assetstore?.delist_drafts || {};
          let delist_tx_serialized = drafts[nfttx_sig];
          if (!delist_tx_serialized) { 

	    //
	    // we can be in this situation (unable to find delist) if the server
	    // has not processed the listing completely and has not yet returned
	    // the listing to us. In this case, we run the Force-Delist process
	    //
	    siteMessage('Listing in Progress: please wait until listing complete...', 3000);

	    //
	    // we preserve this option for forcing stores to delist and send us back our item
	    //
	    //
	    //let delist_nfttx = await this.mod.createForceDelistAssetTransaction(nfttx_sig);
	    //this.app.network.propagateTransaction(delist_nfttx);
	    this.overlay.close();
	    return;

	  }


          //
          // remove item from browser record
          //
          for (let z = 0; z < this.mod.listings.length; z++) {
            if (this.mod.listings[z].nfttx_sig === nfttx_sig) {
              this.mod.listings.splice(z, 1); // remove the matched item
              break;                      
            }
          }

          //
          // send request to server to propogate send nft tx
          // also update db records
          //
          this.app.network.sendRequestAsTransaction(
            'request delist complete',
            { 
              nft_tx : delist_tx_serialized,
              nfttx_sig: nfttx_sig
            },
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


module.exports = DelistNFTOverlay;
