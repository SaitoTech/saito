const ListNftTemplate = require('./list-overlay.template');
const NftCard = require('./../nft-card');
const SaitoOverlay = require('./../../saito-overlay/saito-overlay');
const SaitoUser = require('./../../saito-user/saito-user');

class ListNft {
  constructor(app, mod, attach_events = true) {
    this.app = app;
    this.mod = mod;
    this.overlay = new SaitoOverlay(this.app, this.mod);

    this.nft_list = null;
    this.card_list = [];

    this.callback = null;

    if (attach_events) {
      this.app.connection.on('saito-nft-list-render-request', (callback = null) => {
        this.callback = callback;
        this.render();
      });

      this.app.connection.on('saito-nft-list-close-request', () => {
        this.overlay.close();
      });

      app.connection.on('wallet-updated', async () => {
        const { updated, rebroadcast, persisted } = await this.app.wallet.updateNftList();

        if (persisted) {
          siteMessage(`NFT updated in wallet`, 3000);
        }

        // re-render send-nft overlay if its open
        if (this.overlay.visible) {
          //	this doesn't seem to trigger when NFT is just newly created by wallet
          //	if (this.overlay.visible && (updated.length > 0 || persisted)) {
          this.render();
        }
      });
    }
  }

  async render() {
    this.overlay.show(ListNftTemplate(this.app, this.mod));
    this.nft_list = await this.fetchNFT();
    await this.renderNftList();
    this.attachEvents();
  }

  async renderNftList() {
    const container = document.querySelector('#nft-list');

    if (!container) {
      console.warn('Missing Nft-list container!');
      return;
    }

    if (!this.nft_list?.length > 0) {
      let html = `
        <div class="instructions">
            You do not have any NFTs in your wallet. 
            If you have just created or been sent one, please wait a few minutes 
            for the network to confirm for your wallet.
        </div>
      `;
      container.innerHTML = html;
      return;
    } else {
      let newArray = [];
      for (const rec of this.nft_list) {
        let already_rendered = false;
        for (let i = 0; i < this.card_list.length; i++) {
          if (rec.id == this.card_list[i].nft.id && rec.tx_sig == this.card_list[i].nft.tx_sig) {
            this.card_list[i].callback = this.callback;
            newArray.push(this.card_list[i]);
            already_rendered = true;
            break;
          }
        }
        if (!already_rendered) {
          newArray.push(
            new NftCard(this.app, this.mod, '.send-nft-list', null, rec, this.callback)
          );
        }
      }

      this.card_list = newArray;

      // if nft-list contains nft
      let html = '<div class="send-nft-list"></div>';
      container.innerHTML = html;

      for (const card of this.card_list) {
        await card.render();
      }
    }
  }

  attachEvents() {
    let newNftButton = document.getElementById('create-nft');
    if (newNftButton) {
      newNftButton.onclick = (e) => {
        this.app.connection.emit('saito-nft-create-render-request');
      };
    }
  }

  async fetchNFT() {
    await this.app.wallet.updateNftList();

    const data = this.app.options.wallet.nfts || [];

    return data;
  }
}

module.exports = ListNft;
