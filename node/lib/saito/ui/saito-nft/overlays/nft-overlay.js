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
    let this_self = this;
    let send_button = document.querySelector('.saito-nft-footer-btn.send');
    let enable_button = document.querySelector('.saito-nft-footer-btn.enable');
    let disable_button = document.querySelector('.saito-nft-footer-btn.disable');
    let split_button = document.querySelector('.saito-nft-footer-btn.split');
    let merge_button = document.querySelector('.saito-nft-footer-btn.merge');

    let confirm_send_btn = document.querySelector('.saito-nft-confirm-btn');

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

    if (confirm_send_btn) {
      confirm_send_btn.onclick = async (e) => {
        e.preventDefault();
        let receiver_input = document.querySelector('#nft-receiver-address');

        // validate receiver's public_key
        let receiver = receiver_input ? receiver_input.value.trim() : '';

        console.log('receiver:', receiver);
        console.log('is valid:', this_self.app.wallet.isValidPublicKey(receiver));

        if (!this_self.app.wallet.isValidPublicKey(receiver)) {
          salert('Receiver’s public key is not valid');
          return;
        }

        try {
          let newtx = await this_self.app.wallet.createSendNFTTransaction(this_self.nft, receiver);

          await newtx.sign();
          await this_self.app.network.propagateTransaction(newtx);

          console.log('Create nft tx: ', newtx);

          siteMessage('NFT sent to ' + receiver, 3000);

          this_self.overlay.close();

          if (document.querySelector('.nft-list-container')) {
            this_self.app.connection.emit('saito-nft-list-render-request');
          }
        } catch (err) {
          console.error(err);
          salert('Failed to send NFT: ');
        }
      };
    }

    /////////////////////////
    // button click events //
    /////////////////////////
    send_button.onclick = (e) => {
      document.querySelector('.saito-nft-overlay.panels').classList.add('saito-nft-mode-send');
    };

    split_button.onclick = (e) => {
      alert('split!');
      document.querySelector('.saito-nft-overlay.panels').classList.add('saito-nft-mode-split');
      //      actionBar.dataset.show = 'split';
      //      this.showSplitOverlay(splitBar, confirmSplit);
    };

    merge_button.onclick = (e) => {
      alert('merge!');
      document.querySelector('.saito-nft-overlay.panels').classList.add('saito-nft-mode-merge');
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
