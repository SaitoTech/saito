const LoadNFTsTemplate = require('./load-nfts.template');
const SaitoNFT = require('./../../../../../lib/saito/ui/saito-nft/saito-nft');
const SaitoOverlay = require('./../../../../../lib/saito/ui/saito-overlay/saito-overlay');
const FileUploadOverlay = require('./file-upload');
const WitnessOverlay = require('./witness');

class LoadNFTs {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
    this.overlay = new SaitoOverlay(this.app, this.mod);
    this.file_upload_overlay = new FileUploadOverlay(this.app, this.mod);
    this.witness_overlay = new WitnessOverlay(this.app, this.mod);

    this.nft_list = [];
    this.vault_nfts = [];

    app.connection.on('vault-file-access-render', () => {
      this.render();
    });

    app.connection.on('wallet-updated', async () => {
      // Wallet owns updateNFTList; refresh UI from options when this overlay is open.
      if (this.overlay.visible) {
        this.nft_list = this.app.options.wallet?.nfts || [];
        await this.filterNFTList();
        await this.renderNFTList();
      }
    });
  }

  async render() {
    this.overlay.show(LoadNFTsTemplate(this.app, this.mod));

    //
    // load nfts from wallet
    //
    this.nft_list = await this.fetchNFTList();

    await this.filterNFTList();

    //
    // render into #nft-list
    //
    await this.renderNFTList();
  }

  async fetchNFTList() {
    //
    // make sure wallet cache is fresh (explicit open / user action)
    //
    await this.app.wallet.updateNFTList();

    let data = this.app.options.wallet?.nfts || [];
    return data;
  }

  async filterNFTList() {
    //
    // reset vault_nfts list for fresh render
    //
    this.vault_nfts = [];

    this.count = this.nft_list.length;

    for (let rec of this.nft_list) {
      //
      // create saito-nft object
      //
      let nft = new SaitoNFT(this.app, this.mod, null, rec);

      //
      // determine nft type
      //
      // Canonical types: vault-nft-key (jade/crystal) and vault-nft-rental.
      // Also accept legacy "vault" mints.
      const nft_type = nft.returnType();
      if (
        nft_type === 'vault-nft-key' ||
        nft_type === 'vault-nft-rental' ||
        nft_type === 'vault'
      ) {
        // Put everything in the callback to make sure we can fetch the orig transaction if user transfered ownership!
        await nft.fetchTransaction(() => {
          console.log('fetched the nft...');

          let nfttxmsg = nft.tx.returnMessage();
          let data = nfttxmsg?.data;
          let file_id = data?.file_id;
          let file_name = data?.filename;
          let file_access_script = data?.file_access_script;

          console.log(data);

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
            file_access_script: file_access_script || null,
            file_name,
            slip1_utxokey,
            slip2_utxokey,
            slip3_utxokey
          });

          this.count--;
        });

        this.renderNFTList();
      } else {
        this.count--;
      }
    }
  }

  async renderNFTList() {
    let container = document.querySelector('#nft-list');

    if (!container) {
      console.warn('LoadNFTs: missing #nft-list container');
      return;
    }

    if (this.count > 0) {
      let html = `<div class="loader"></div>`;
      container.innerHTML = html;
    } else if (!this.vault_nfts || this.vault_nfts.length === 0) {
      let html = `
        <div class="vault-empty-state">
          <div class="instructions">
            You do not have any NFT keys in your wallet.
            If you have just created or been sent one, please wait a few minutes
            for the network to confirm for your wallet.
          </div>
          <button type="button" class="saito-button-primary" data-vault-upload>
            add item to vault
          </button>
        </div>
      `;
      container.innerHTML = html;
    } else {
      //
      // wrapper for cards
      //
      container.innerHTML = `<div class="send-nft-list"></div>`;
      let wrapper = container.querySelector('.send-nft-list');

      for (let i = 0; i < this.vault_nfts.length; i++) {
        //
        // determine which key image to display
        // crystal key = custom/advanced (has file_access_script)
        // jade key = public/standard (no file_access_script)
        //
        let keyImage = this.vault_nfts[i].file_access_script ? 'crystal_key.png' : 'jade_key.png';

        let html = `
          <div class="vault-nft-item" data-vault-index="${i}">
            <img
              class="vault-nft-img"
              src="/vault/img/${keyImage}"
            />

            <div class="vault-nft-footer">
              <div class="vault-nft-hash">
                ${this.vault_nfts[i].file_name}
              </div>
              <button class="vault-nft-download-btn">Download</button>
            </div>
          </div>
        `;

        //
        // use wrapper and inject as HTML
        //
        wrapper.insertAdjacentHTML('beforeend', html);
      }
    }
    //
    // bind click events after DOM is ready
    //
    this.attachEvents();
  }

  attachEvents() {
    const uploadButtons = document.querySelectorAll('.vault-nfts [data-vault-upload]');
    uploadButtons.forEach((uploadButton) => {
      uploadButton.onclick = () => {
        this.overlay.close();
        this.file_upload_overlay.render();
      };
    });

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

        console.log('CLICKED: ' + JSON.stringify(vault_entry));

        //
        // Check if this is a custom/advanced key (has file_access_script)
        //
        if (vault_entry.file_access_script) {
          //
          // Show witness overlay for custom keys
          //
          this.overlay.hide();
          this.witness_overlay.access_script = vault_entry.file_access_script;
          this.witness_overlay.vault_entry = vault_entry;
          this.witness_overlay.render();

          this.witness_overlay.callback = (result) => {
            this.mod.sendAccessFileRequest(vault_entry, result.access_script);
          };
        } else {
          //
          // Public key - direct file request (no witness needed)
          //
          this.mod.sendAccessFileRequest(vault_entry);
        }
      };
    });
  }
}

module.exports = LoadNFTs;
