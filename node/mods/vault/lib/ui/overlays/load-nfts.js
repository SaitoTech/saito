const LoadNFTsTemplate = require('./load-nfts.template');
const SaitoNFT = require('./../../../../../lib/saito/ui/saito-nft/saito-nft');
const SaitoOverlay = require('./../../../../../lib/saito/ui/saito-overlay/saito-overlay');

class LoadNFTs {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
    this.overlay = new SaitoOverlay(this.app, this.mod);

    this.nft_list = [];
    this.vault_nfts = [];
  }

  async render() {
    this.overlay.show(LoadNFTsTemplate(this.app, this.mod));

    //
    // load nfts from wallet
    //
    this.nft_list = await this.fetchNFTList();

    //
    // render into #nft-list
    //
    await this.renderNFTList();
  }

  async fetchNFTList() {
    //
    // make sure wallet cache is fresh
    //
    await this.app.wallet.updateNFTList();

    let data = this.app.options.wallet?.nfts || [];
    return data;
  }

  async renderNFTList() {
    let container = document.querySelector('#nft-list');

    if (!container) {
      console.warn('LoadNFTs: missing #nft-list container');
      return;
    }

    if (!this.nft_list || this.nft_list.length === 0) {
      let html = `
        <div class="instructions">
          You do not have any NFT keys in your wallet. 
          If you have just created or been sent one, please wait a few minutes 
          for the network to confirm for your wallet.
        </div>
      `;
      container.innerHTML = html;
      return;
    }

    //
    // reset vault_nfts list for fresh render
    //
    this.vault_nfts = [];

    //
    // wrapper for cards
    //
    container.innerHTML = `<div class="send-nft-list"></div>`;
    let wrapper = container.querySelector('.send-nft-list');

    for (let rec of this.nft_list) {
      //
      // create saito-nft object
      //
      let nft = new SaitoNFT(this.app, this.mod, null, rec, null);

      console.log('nft:', nft);

      //
      // determine nft type
      //
      let nft_type = this.app.wallet.extractNFTType(rec.slip3.utxo_key);

      console.log('-------------------------------------');
      console.log('nft type is: ', nft_type);

      if (nft_type == 'vault') {
        console.log('fetching txmsg from archive...');
        await nft.fetchTransaction();

        console.log('txmsg is: ', nft.txmsg);
        let data = nft.txmsg?.data;
        let file_id = data?.file_id;
        let filename = data?.filename;

        console.log('file_id: ', file_id);

        //
        // collect utxokeys from nft object
        //
        let slip1_utxokey = nft.slip1?.utxo_key || '';
        let slip2_utxokey = nft.slip2?.utxo_key || '';
        let slip3_utxokey = nft.slip3?.utxo_key || '';

        //
        // push into vault_nfts array
        //
        this.vault_nfts.push({
          nft_id: nft.id,
          file_id,
          slip1_utxokey,
          slip2_utxokey,
          slip3_utxokey
        });

        //
        // index in array for DOM mapping
        //
        let index = this.vault_nfts.length - 1;

        let identicon = this.app.keychain.returnIdenticon(file_id);

        let html = `
          <div class="vault-nft-item" data-vault-index="${index}">
            <img
              class="vault-nft-img"
              src="/vault/img/jade_key.png"
            />

            <div class="vault-nft-footer">
              <div class="vault-nft-hash">
                ${filename}
              </div>
              <button class="vault-nft-download-btn">Download</button>
            </div>
          </div>
        `;

        //
        // use wrapper and inject as HTML
        //
        wrapper.insertAdjacentHTML('beforeend', html);
      } else {
        console.log('not fetching txmsg');
      }

      console.log('-------------------------------------');
    }

    //
    // bind click events after DOM is ready
    //
    this.attachEvents();
  }

  attachEvents() {
    let items = document.querySelectorAll('.vault-nft-item');
    if (!items || items.length === 0) {
      return;
    }

    items.forEach((item) => {
      item.onclick = (e) => {
        e.preventDefault();

        //
        // get index from data attribute
        //
        let idx_str = item.getAttribute('data-vault-index');
        let idx = parseInt(idx_str, 10);

        if (Number.isNaN(idx) || !this.vault_nfts[idx]) {
          console.warn('LoadNFTs: vault_nft entry not found for index', idx_str);
          return;
        }

        let vault_entry = this.vault_nfts[idx];

        console.log('vault-nft clicked: ', vault_entry);

        this.mod.sendAccessFileRequest(vault_entry);

      };
    });
  }
}

module.exports = LoadNFTs;
