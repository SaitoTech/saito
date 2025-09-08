const ListNftTemplate = require('./list-overlay.template');
const Nft = require('./nft');
const SaitoOverlay = require('./../saito-overlay/saito-overlay');
const SaitoUser = require('./../saito-user/saito-user');

class ListNft {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
    this.overlay = new SaitoOverlay(this.app, this.mod);
    this.nft_selected = null;
    this.nft_list = [];
    this.nft_cards = [];
    this.app.connection.on('saito-list-nft-render-request', () => {
      this.overlay.close();
      this.render();
    });
  }

  async render() {
    this.overlay.show(ListNftTemplate(this.app, this.mod));
    await this.renderNftList();
    setTimeout(() => this.attachEvents(), 0);
  }

  async renderNftList() {
    this.nft_list = await this.fetchNFT();
    this.sendMsg = document.querySelector('#send-nft-wait-msg');

    let html = '<div class="send-nft-list">';

    if (!Array.isArray(this.nft_list) || this.nft_list.length === 0) {
      // if nft-list is empty

      this.sendMsg.style.display = 'none';

      html += `
        <div class="send-nft-row empty-send-nft-row">
          <div class="send-nft-row-item">
            You do not have any NFTs in your wallet. 
            If you have just created or been sent one, please wait a few minutes 
            for the network to confirm for your wallet.
          </div>
        </div>
      `;
      const page2 = document.querySelector('#page2');
      if (page2) page2.style.display = 'none';
    } else {
      // if nft-list contains nft
      this.sendMsg.style.display = 'block';
    }

    html += '</div>';

    const container = document.querySelector('#nft-list');
    if (container) container.innerHTML = html;

    //
    // build nft component from nft id
    //
    await this.buildNftComponents();
  }

  async buildNftComponents() {
    // Map of UTXO-key -> component (one component may render multiple cards)
    this.nft_cards = this.nft_cards || {};

    if (Array.isArray(this.nft_list) && this.nft_list.length > 0) {
      const seenIds = new Set(); // avoid spinning up multiple components for same id

      for (const rec of this.nft_list) {
        const id = rec?.id;
        if (!id || seenIds.has(id)) continue;
        seenIds.add(id);

        const comp = new Nft(this.app, this.mod, '.send-nft-list');

        try {
          // Populate all matches (comp.items will be filled for same-id duplicates)
          await comp.createFromId(id);

          // Render: comp will render 1 or many cards depending on comp.items
          await comp.render();

          // Index by each rendered item's utxo_key so UI can address individual cards
          const items =
            Array.isArray(comp.items) && comp.items.length > 0
              ? comp.items
              : [{ slip1: comp.slip1, slip2: comp.slip2, slip3: comp.slip3 }];

          for (const it of items) {
            const key = it?.slip1?.utxo_key || it?.slip2?.utxo_key || it?.slip3?.utxo_key;

            if (key) this.nft_cards[key] = comp;
          }
        } catch (e) {
          console.warn('NFT failed to init/render id:', id, e);
        }
      }
    }
  }

  attachEvents() {
    this.createLink = document.querySelector('#nft-link');
    this.sendNftTitle = document.querySelector('#send-nft-title');
    this.setupCreateLink();
  }

  setupCreateLink() {
    if (!this.createLink) return;
    this.createLink.onclick = (e) => {
      e.preventDefault();
      this.overlay.close();
      this.app.connection.emit('saito-create-nft-render-request', {});
    };
  }

  getNftIndexFromUtxoKey(slip1_utxokey) {
    return this.nft_list.findIndex((nft) => nft.slip1.utxo_key === slip1_utxokey);
  }

  async fetchNFT() {
    await this.app.wallet.updateNftList();

    const data = this.app.options.wallet.nfts || [];

    //console.log('SEND-WALLET: nfts - ', data);
    return data;
  }
}

module.exports = ListNft;
