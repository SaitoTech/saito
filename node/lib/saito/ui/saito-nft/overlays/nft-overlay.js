let NFTOverlayTemplate = require('./nft-overlay.template');
let SaitoOverlay = require('./../../saito-overlay/saito-overlay');

class NFTOverlay {
  constructor(app, mod, attach_events = true) {
    this.app = app;
    this.mod = mod;
    this.overlay = new SaitoOverlay(this.app, this.mod);

    //
    // ui helpers
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

    //
    // buttons
    //
    let header_btn = document.querySelector('.saito-nft-header-btn');
    let send_btn = document.querySelector('.saito-nft-footer-btn.send');
    let enable_btn = document.querySelector('.saito-nft-footer-btn.enable');
    let disable_btn = document.querySelector('.saito-nft-footer-btn.disable');
    let split_btn = document.querySelector('.saito-nft-footer-btn.split');
    let merge_btn = document.querySelector('.saito-nft-footer-btn.merge');

    //
    // contextual confirm buttons
    //
    let confirm_send_btn = document.querySelector('.saito-nft-panel-send .saito-nft-confirm-btn');
    let confirm_split_btn = document.querySelector('.saito-nft-confirm-split');
    let confirm_merge_btn = document.querySelector('#saito-nft-confirm-merge');

    //
    // back buttons
    //
    let back_buttons = document.querySelectorAll('.saito-nft-back-btn');

    //
    // enable / disable
    //
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

    enable_btn.style.display = can_enable ? 'flex' : 'none';
    disable_btn.style.display = can_disable ? 'flex' : 'none';

    //
    // split + merge visibility
    //
    let can_split = false;
    let can_merge = false;

    console.log('Number(this.nft.amount): ', Number(this.nft.amount));
    console.log('this.mod.publicKey: ', this.mod.publicKey);
    console.log('this.owner: ', this.owner);
    console.log('nft.slip1.public_key: ', this.nft.slip1.public_key);
    console.log('this.getSameIdCoun(): ', this.getSameIdCount());

    if (Number(this.nft.amount) > 1 && this.mod.publicKey == this.nft.slip1.public_key) {
      can_split = true;
    }

    if (this.getSameIdCount() > 1 && this.mod.publicKey == this.nft.slip1.public_key) {
      can_merge = true;
    }

    split_btn.style.display = can_split ? 'flex' : 'none';
    merge_btn.style.display = can_merge ? 'flex' : 'none';

    //
    // SEND NFT
    //
    if (confirm_send_btn) {
      confirm_send_btn.onclick = async (e) => {
        e.preventDefault();

        let rec_in = document.querySelector('#nft-receiver-address');
        let receiver = rec_in ? rec_in.value.trim() : '';

        if (!this.app.wallet.isValidPublicKey(receiver)) {
          salert('Receiver’s public key is not valid');
          return;
        }

        try {
          let newtx = await this.app.wallet.createSendNftTransaction(this.nft, receiver);

          await newtx.sign();
          await this.app.network.propagateTransaction(newtx);

          siteMessage(`NFT sent to ${receiver}`, 3000);
          this.overlay.close();

          if (document.querySelector('.nft-list-container')) {
            this.app.connection.emit('saito-nft-list-render-request');
          }
        } catch (err) {
          console.error(err);
          salert('Failed to send NFT');
        }
      };
    }

    //
    // SPLIT NFT
    //
    if (confirm_split_btn) {
      confirm_split_btn.onclick = async (e) => {
        e.preventDefault();

        let L = parseInt(document.querySelector('#saito-nft-split-left').value);
        let T = parseInt(this.nft.amount);
        let R = T - L;

        try {
          let tx = await this.app.wallet.createSplitNFTTransaction(this.nft, L, R);

          await tx.sign();
          await this.app.network.propagateTransaction(tx);

          siteMessage('Split NFT tx sent', 2000);
          this.overlay.close();

          if (document.querySelector('.nft-list-container')) {
            this.app.connection.emit('saito-nft-list-render-request');
          }
        } catch (err) {
          salert('Split failed: ' + (err?.message || err));
        }
      };
    }

    //
    // MERGE NFT
    //
    if (confirm_merge_btn) {
      confirm_merge_btn.onclick = async (e) => {
        e.preventDefault();

        try {
          let tx = await this.app.wallet.createMergeNFTTransaction(this.nft);

          await tx.sign();
          await this.app.network.propagateTransaction(tx);

          if (!this.app.options.wallet.nftMergeIntents) {
            this.app.options.wallet.nftMergeIntents = {};
          }

          this.app.options.wallet.nftMergeIntents[this.nft.id] = Date.now();
          this.app.wallet.saveWallet();

          siteMessage('Merge NFT tx sent', 2000);
          this.overlay.close();

          if (document.querySelector('.nft-list-container')) {
            this.app.connection.emit('saito-nft-list-render-request');
          }
        } catch (err) {
          salert('Merge failed: ' + (err?.message || err));
        }
      };
    }

    //
    // header info toggle
    //
    header_btn.onclick = (e) => {
      let p = document.querySelector('.saito-nft-overlay.panels');

      if (p.classList.contains('saito-nft-mode-info')) {
        p.classList.remove('saito-nft-mode-info');
      } else {
        p.classList.add('saito-nft-mode-info');
      }

      header_btn.classList.toggle('rotate');
    };

    //
    // SEND button
    //
    send_btn.onclick = (e) => {
      document.querySelector('.saito-nft-overlay.panels').classList.add('saito-nft-mode-send');
    };

    //
    // SPLIT button
    //
    split_btn.onclick = (e) => {
      let p = document.querySelector('.saito-nft-overlay.panels');
      p.classList.add('saito-nft-mode-split');
      this.initializeSplitSlider(); // keep as-is, add helper only
    };

    //
    // MERGE button
    //
    merge_btn.onclick = (e) => {
      document.querySelector('.saito-nft-overlay.panels').classList.add('saito-nft-mode-merge');
    };

    //
    // Enable button
    //
    enable_btn.onclick = (e) => {
      if (!this.app.options.permissions) this.app.options.permissions = {};
      if (!this.app.options.permissions.nfts) this.app.options.permissions.nfts = [];

      if (!this.app.options.permissions.nfts.includes(this.nft.tx_sig)) {
        this.app.options.permissions.nfts.push(this.nft.tx_sig);
        salert('NFT Activated for Next Reload');
        this.app.storage.saveOptions();
      }

      this.render();
    };

    //
    // Disable button
    //
    disable_btn.onclick = (e) => {
      if (!this.app.options.permissions) this.app.options.permissions = {};
      if (!this.app.options.permissions.nfts) this.app.options.permissions.nfts = [];

      this.app.options.permissions.nfts = this.app.options.permissions.nfts.filter(
        (v) => v !== this.nft.tx_sig
      );

      salert('NFT Disabled for Next Reload');
      this.app.storage.saveOptions();
      this.render();
    };

    //
    // BACK buttons (new)
    //
    back_buttons.forEach((btn) => {
      btn.onclick = (e) => {
        let p = document.querySelector('.saito-nft-overlay.panels');

        p.classList.remove('saito-nft-mode-send');
        p.classList.remove('saito-nft-mode-info');
        p.classList.remove('saito-nft-mode-split');
        p.classList.remove('saito-nft-mode-merge');
      };
    });
  }

  //
  // slider setup (non-destructive)
  //
  initializeSplitSlider() {
    let left = document.querySelector('#saito-nft-split-left');
    let right = document.querySelector('#saito-nft-split-right');
    let bar = document.querySelector('.saito-nft-split-grip');

    if (!left || !right || !bar) return;

    let total = parseInt(this.nft.amount);
    let L = Math.floor(total / 2);
    let R = total - L;

    left.value = L;
    right.innerText = R;

    bar.onmousedown = () => {
      document.onmousemove = (e) => {
        let box = document.querySelector('.saito-nft-split-container');
        let rect = box.getBoundingClientRect();
        let x = e.clientX - rect.left;

        x = Math.max(20, Math.min(x, rect.width - 20));

        let pct = x / rect.width;

        let newL = Math.max(1, Math.min(total - 1, Math.round(pct * total)));
        let newR = total - newL;

        left.value = newL;
        right.innerText = newR;
      };

      document.onmouseup = () => {
        document.onmousemove = null;
      };
    };
  }

  //
  // count items for merge
  //
  getSameIdCount() {
    let arr = this.app?.options?.wallet?.nfts || [];
    return arr.filter((n) => n?.id === this.nft.id).length;
  }
}

module.exports = NFTOverlay;
