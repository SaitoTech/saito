let Transaction = require('./../../../../lib/saito/transaction').default;
let NFTDetailsOverlay = require('./../../../../lib/saito/ui/saito-nft/overlays/nft-overlay');
const SaitoInvitationLink = require('./../../../../lib/saito/ui/modals/saito-link/saito-link');

class DelistNFTOverlay extends NFTDetailsOverlay {
  constructor(app, mod) {
    super(app, mod, false);
  }

  render(nft) {
    super.render(nft); // Will call attachEvents

    Array.from(document.querySelectorAll('.saito-nft-footer-btn')).forEach(
      (el) => (el.style.display = 'none')
    );

    if (document.querySelector('.saito-nft-footer-btn.send-nft')) {
      document.querySelector('.saito-nft-footer-btn.send-nft').style.display = 'flex';
      document.querySelector('.saito-nft-footer-btn.send-nft').innerHTML = 'Remove Listing';
    }

    if (document.querySelector('.saito-nft-footer-btn.enable-nft')) {
      document.querySelector('.saito-nft-footer-btn.enable-nft').style.display = 'flex';
      document.querySelector('.saito-nft-footer-btn.enable-nft').innerHTML =
        `<i class="fa-solid fa-link"></i><span>Share</span>`;
    }
  }

  attachEvents() {
    let delist_btn = document.querySelector('.saito-nft-footer-btn.send-nft');
    if (delist_btn) {
      delist_btn.onclick = async (e) => {
        e.preventDefault();
        try {
          //
          // fetch thedelisting transaction
          //
          let nfttx_sig = this.nft?.tx_sig;
          let delist_tx_serialized = this.mod.drafts[nfttx_sig];
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
              nft_tx: delist_tx_serialized,
              nfttx_sig: nfttx_sig
            },
            () => {},
            this.mod.assetStore.publicKey
          );

          this.overlay.close();
          siteMessage('Delist request submitted. Waiting for network confirmation…', 3000);
        } catch (err) {
          console.error(err);
        }
      };
    }

    let share_btn = document.querySelector('.saito-nft-footer-btn.enable-nft');
    if (share_btn) {
      share_btn.onclick = (e) => {
        if (!this.link) {
          this.link = new SaitoInvitationLink(this.app, this.mod, {
            name: 'Item',
            path: '/store',
            seller: this.mod.publicKey,
            listing: this.nft.tx_sig
          });
        }

        this.overlay.close();
        this.link.render();
      };
    }
  }
}

module.exports = DelistNFTOverlay;
