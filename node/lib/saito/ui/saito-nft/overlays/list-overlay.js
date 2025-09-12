const ListNftTemplate = require('./list-overlay.template');
const Nft = require('./../nft-card');
const SaitoOverlay = require('./../../saito-overlay/saito-overlay');
const SaitoUser = require('./../../saito-user/saito-user');

class ListNft {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
    this.overlay = new SaitoOverlay(this.app, this.mod);

    this.app.connection.on('saito-nft-list-render-request', (list, callback = null) => {
      console.log(list, callback);

      this.callback = callback;
      this.render(list);
    });

    app.connection.on('wallet-updated', async () => {
      // check if new nft added / removed
      const { updated, rebroadcast, persisted } = await this.app.wallet.updateNftList();

      if (persisted) {
        siteMessage(`NFT updated in wallet`, 3000);
      }

      // re-render send-nft overlay if its open
      if (this.overlay.visible && (updated.length > 0 || persisted)) {
        console.log('NFT changes in wallet-updated!');
        this.render();
      }
    });
  }

  async render(list = null) {
    this.overlay.show(ListNftTemplate(this.app, this.mod));

    if (!list) {
      list = await this.fetchNFT();
    }

    await this.renderNftList(list);

    this.attachEvents();
  }

  async renderNftList(nft_list) {
    const container = document.querySelector('#nft-list');

    if (!container) {
      console.warn('Missing Nft-list container!');
      return;
    }

    if (!nft_list?.length) {
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
      // if nft-list contains nft
      let html = '<div class="send-nft-list"></div>';
      container.innerHTML = html;

      for (const rec of nft_list) {
        try {
          const comp = new Nft(this.app, this.mod, '.send-nft-list', null, rec, this.callback);
          comp.render();
        } catch (e) {
          console.error('NFT failed to init/render id:', e);
          console.error(rec);
        }
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

    //console.log('SEND-WALLET: nfts - ', data);
    return data;
  }
}

module.exports = ListNft;
