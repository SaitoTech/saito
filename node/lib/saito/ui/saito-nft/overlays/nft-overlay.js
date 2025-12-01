let NFTOverlayTemplate = require('./nft-overlay.template');
let SaitoOverlay = require('./../../saito-overlay/saito-overlay');

class NFTOverlay {
  constructor(app, mod, attach_events = true) {

    this.app = app;
    this.mod = mod;
    this.overlay = new SaitoOverlay(this.app, this.mod);

    //
    // UI helpers
    //
    this.nft = null;

    if (attach_events == true) {
      app.connection.on('saito-nft-details-render-request', (nft) => {
        this.nft = nft;
        this.owner = nft.slip1.public_key;
        this.render();
      });

      app.connection.on('saito-nft-details-close-request', () => {
        this.overlay.close();
      });
    }
  }

  render() {
    this.overlay.show(NFTOverlayTemplate(this.app, this.mod, this.nft));
    this.attachEvents();
  }

  async attachEvents() {

    let send_button = document.querySelector('.saito-nft-footer-btn.send');
    let enable_button = document.querySelector('.saito-nft-footer-btn.enable');
    let disable_button = document.querySelector('.saito-nft-footer-btn.disable');
    let split_button = document.querySelector('.saito-nft-footer-btn.split');
    let merge_button = document.querySelector('.saito-nft-footer-btn.merge');

    ///////////////////////
    // Enable / Disable? //
    ///////////////////////
    let can_enable = false;
    let can_disable = false;

    if (this.nft.css || this.nft.js) {
      can_enable = true;
    }

    if (this.app.options?.permissions?.nfts) {
      if (this.app.options.permissions.nfts.includes(this.nft.tx_sig)) {
        can_enable = false;
        can_disable = true;
      }
    }

    if (can_enable) {
      enable_button.style.display = 'flex';
    } else {
      enable_button.style.display = 'none';
    }

    if (can_disable) {
      disable_button.style.display = 'flex';
    } else {
      disable_button.style.display = 'none';
    }

    ////////////////////
    // Split / Merge? //
    ////////////////////
    let can_split = false;
    let can_merge = false;

    if (this.nft.amount > 1 && this.mod.publicKey == this.owner) {
      can_split = true;
    }
    if (this.getSameIdCount() > 1 && this.mod.publicKey == this.owner) {
      can_merge = true; 
    }

    if (can_split) {
      split_button.style.display = 'flex';
    } else {
      split_button.style.display = 'none';
    }
    if (can_merge) {
      merge_button.style.display = 'flex';
    } else {
      merge_button.style.display = 'none';
    }


    /////////////////////////
    // button click events //
    /////////////////////////
    send_button.onclick = (e) => {
      document.querySelector(".saito-nft-overlay.panels").classList.add("saito-nft-mode-send");
    };

    split_button.onclick = (e) => {
      alert("split!");
      document.querySelector(".saito-nft-overlay.panels").classList.add("saito-nft-mode-split");
//      actionBar.dataset.show = 'split';
//      this.showSplitOverlay(splitBar, confirmSplit);
    };

    merge_button.onclick = (e) => {
      alert("merge!");
      document.querySelector(".saito-nft-overlay.panels").classList.add("saito-nft-mode-merge");
      //actionBar.dataset.show = 'merge';
    };

    enable_button.onclick = (e) => {
      if (!this.app.options.permissions) {
        this.app.options.permissions = {};
      }
      if (!this.app.options.permissions.nfts) {
        this.app.options.permissions.nfts = [];
      }
      if (!this.app.options.permissions.nfts.includes(this.nft.tx_sig)) {
        this.app.options.permissions.nfts.push(this.nft.tx_sig);
        salert('NFT Activated for Next Reload');
        this.app.storage.saveOptions();
      }
      this.render();
    };

    disable_button.onclick = (e) => {
      if (!this.app.options.permissions) {
        this.app.options.permissions = {};
      }
      if (!this.app.options.permissions.nfts) {
        this.app.options.permissions.nfts = [];
      }
      if (this.app.options.permissions.nfts.includes(this.nft.tx_sig)) {
        this.app.options.permissions.nfts = this.app.options.permissions.nfts.filter(
          (item) => item !== this.nft.tx_sig
        );
        salert('NFT Disabled for Next Reload');
        this.app.storage.saveOptions();
      }
      this.render();
    };

  }

  getSameIdCount() {
    let nft_list = this.app?.options?.wallet?.nfts || [];
    return nft_list.filter((nft) => nft?.id === this.nft.id).length;
  }


}

module.exports = NFTOverlay;
