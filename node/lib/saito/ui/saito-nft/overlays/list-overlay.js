const ListNFTTemplate = require('./list-overlay.template');
const NFTCard = require('./../saito-nft-card');
const SaitoOverlay = require('./../../saito-overlay/saito-overlay');
const SaitoUser = require('./../../saito-user/saito-user');
const CreateNFT = require('./create-overlay');
const NFTOverlay = require('./nft-overlay');

class ListNFT {
  constructor(app, mod, attach_events = true) {
    this.app = app;
    this.mod = mod;
    this.overlay = new SaitoOverlay(this.app, this.mod);
    this.create_nft_overlay = new CreateNFT(this.app, this.mod);
    this.nft_overlay = new NFTOverlay(this.app, this.mod);

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
        const { updated, rebroadcast, persisted } = await this.app.wallet.updateNFTList();

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
    this.overlay.show(ListNFTTemplate(this.app, this.mod));
    this.nft_list = await this.fetchNFT();
    await this.renderNFTList();
    setTimeout(() => {
      this.attachEvents();
    }, 25);
  }

  async renderNFTOverlay(nft) {
    this.nft_overlay.nft = nft;
    this.nft_overlay.render();
  }

  async renderNFTList() {

    const container = document.querySelector('#nft-list');

    if (!container) {
      console.warn('Missing NFT-list container!');
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
console.log("examining: " + rec.id);
        for (let i = 0; i < newArray.length; i++) {
          if (rec.id == newArray[i].nft.id) {
            newArray[i].callback = this.callback;
            already_rendered = true;
            break;
          }
        }
        if (!already_rendered) {
console.log("adding! " + rec.id);
          newArray.push(
            new NFTCard(this.app, this.mod, '.send-nft-list', null, rec, this.callback)
          );
        }
      }

      this.card_list = newArray;

      // if nft-list contains nft
      let html = '<div class="send-nft-list"></div>';
      container.innerHTML = html;

      for (const card of this.card_list) {
        card.callback = (nft) => {
          this.renderNFTOverlay(nft);
        };
        await card.render();
      }
    }
  }

  attachEvents() {
    let newNFTButton = document.getElementById('create-nft');
    if (newNFTButton) {
      newNFTButton.onclick = (e) => {
        this.overlay.close();
        this.create_nft_overlay.render();
      };
    }
  }

  async fetchNFT() {
    await this.app.wallet.updateNFTList();
    const data = this.app.options.wallet.nfts || [];
    return data;
  }
}

module.exports = ListNFT;
