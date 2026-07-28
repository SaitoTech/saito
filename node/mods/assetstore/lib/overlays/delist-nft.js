let Transaction = require('./../../../../lib/saito/transaction').default;
let NFTDetailsOverlay = require('./../../../../lib/saito/ui/saito-nft/overlays/nft-overlay');
const SaitoInvitationLink = require('./../../../../lib/saito/ui/modals/saito-link/saito-link');

class DelistNFTOverlay extends NFTDetailsOverlay {
  constructor(app, mod) {
    super(app, mod, false);
  }

  render(nft) {
    super.render(nft); // Will call attachEvents

    Array.from(document.querySelectorAll('.saito-nft-panel-view .saito-nft-capability')).forEach(
      (el) => (el.style.display = 'none')
    );

    if (document.querySelector('.saito-nft-capability.send-nft')) {
      const delist = document.querySelector('.saito-nft-capability.send-nft');
      delist.style.display = 'inline-flex';
      delist.setAttribute('aria-label', 'Remove Listing');
      delist.setAttribute('data-description', 'Remove this NFT from the Saito Store.');
      const label = delist.querySelector('.saito-nft-capability-label');
      if (label) {
        label.textContent = 'Remove Listing';
      }
    }

    if (document.querySelector('.saito-nft-capability.enable-nft')) {
      const share = document.querySelector('.saito-nft-capability.enable-nft');
      share.style.display = 'inline-flex';
      share.innerHTML = `<i class="fa-solid fa-link" aria-hidden="true"></i><span class="saito-nft-capability-label">Share</span>`;
      share.setAttribute('aria-label', 'Share');
      share.setAttribute('data-description', 'Share a link to this listing.');
    } else {
      const toolbar = document.querySelector('.saito-nft-capabilities');
      toolbar?.insertAdjacentHTML(
        'beforeend',
        `<button type="button" class="saito-nft-capability enable-nft" data-capability="share" data-description="Share a link to this listing." aria-label="Share" aria-pressed="false"><i class="fa-solid fa-link" aria-hidden="true"></i><span class="saito-nft-capability-label">Share</span></button>`
      );
    }
  }

  attachEvents() {
    super.attachEvents();

    let delist_btn = document.querySelector('.saito-nft-capability.send-nft');
    if (delist_btn) {
      delist_btn.onclick = async (e) => {
        e.preventDefault();
        try {
          //
          // fetch thedelisting transaction
          //
          let nfttx_sig = this.nft?.tx_sig;

          //nft_tx: nfttx.serialize_to_web(this.app),
          //nfttx_sig: nft_sig,
          //delisting_sig: nfttx.signature
          let delist_tx_serialized;

          for (let t of this.mod.drafts) {
            if (t.nfttx_sig == nfttx_sig) {
              delist_tx_serialized = t.nft_tx;
            }
          }

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

    let share_btn = document.querySelector('.saito-nft-capability.enable-nft');
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
