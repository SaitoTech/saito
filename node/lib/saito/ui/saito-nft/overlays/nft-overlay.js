let NFTOverlayTemplate = require('./nft-overlay.template');
let SaitoOverlay = require('./../../saito-overlay/saito-overlay');

class NFTDetailsOverlay {
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
    let actionBar = document.querySelector('.nft-details-actions');
    let enableBtn = document.querySelector('#action-buttons #enable');
    let disableBtn = document.querySelector('#action-buttons #disable');
    let mergeBtn = document.querySelector('#action-buttons #merge');
    let splitBtn = document.querySelector('#action-buttons #split');
    let confirmSend = document.getElementById('confirm_send');
    let receiver_input = document.querySelector('#nft-receiver-address');
    let confirmSplit = document.getElementById('send-nft-confirm-split');
    let splitBar = null;

    /////////////////////////////////
    // Do we show Enable / Disable?
    //////////////////////////////////
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
      enableBtn.style.display = 'flex';
    } else {
      enableBtn.style.display = 'none';
    }
    if (can_disable) {
      disableBtn.style.display = 'flex';
    } else {
      disableBtn.style.display = 'none';
    }

    //////////////////////////////
    // Do we show split or not?
    //////////////////////////////
    if (this.nft.amount > 1 && this.mod.publicKey == this.owner) {
      splitBtn.style.display = 'flex';
      splitBar = document.querySelector('#nft-details-split-bar');
    } else {
      splitBtn.style.display = 'none';
    }

    /////////////////////////////
    // Do we show merge or not
    /////////////////////////////
    if (this.getSameIdCount() > 1 && this.mod.publicKey == this.owner) {
      mergeBtn.style.display = 'flex';
    } else {
      mergeBtn.style.display = 'none';
    }

    ////////////////////////////////////
    // launch / hide action panel
    /////////////////////////////////////
    document.querySelector('#action-buttons #send').onclick = (e) => {
      //alert("send clicked... udpating actionBar...");
      actionBar.dataset.show = 'send';
      //alert("send clicked actionBar updated...");
    };

    splitBtn.onclick = (e) => {
      actionBar.dataset.show = 'split';
      this.showSplitOverlay(splitBar, confirmSplit);
    };

    mergeBtn.onclick = (e) => {
      actionBar.dataset.show = 'merge';
    };

    enableBtn.onclick = (e) => {
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

    disableBtn.onclick = (e) => {
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

    setTimeout(() => {
      Array.from(document.querySelectorAll('.cancel-action')).forEach(
        (el) =>
          (el.onclick = (e) => {
            actionBar.dataset.show = 'none';
          })
      );
    }, 1000);

    //////////////////////
    /// Send NFT
    //////////////////////
    if (receiver_input) {
      receiver_input.oninput = (e) => {
        if (this.app.wallet.isValidPublicKey(receiver_input.value.trim())) {
          confirmSend.classList.remove('disabled');
        } else {
          confirmSend.classList.add('disabled');
        }
      };
    }

    if (confirmSend) {
      confirmSend.onclick = async (e) => {
        e.preventDefault();

        // validate receiver's public_key
        let receiver = receiver_input ? receiver_input.value.trim() : '';

        if (!this.app.wallet.isValidPublicKey(receiver)) {
          salert('Receiver’s public key is not valid');
          return;
        }

        try {
          let newtx = await this.app.wallet.createSendNFTTransaction(this.nft, receiver);

          await newtx.sign();
          await this.app.network.propagateTransaction(newtx);

          console.log('Create nft tx: ', newtx);

          siteMessage('NFT sent to ' + receiver, 3000);

          this.overlay.close();

          if (document.querySelector('.nft-list-container')) {
            this.app.connection.emit('saito-nft-list-render-request');
          }
        } catch (err) {
          console.error(err);
          salert('Failed to send NFT: ');
        }
      };
    }

    //////////////////////
    // Dynamic split
    //////////////////////
    if (splitBar) {
      confirmSplit.onclick = async (e) => {
        if (confirmSplit.classList.contains('disabled')) {
          return;
        }
        e.preventDefault();

        let totalAmount = Number(this.nft.amount);
        let leftCount = parseInt(document.querySelector('#split-left').value);
        let rightCount = totalAmount - leftCount;

        try {
          let newtx = await this.app.wallet.createSplitNFTTransaction(
            this.nft,
            leftCount,
            rightCount
          );

          await newtx.sign();
          await this.app.network.propagateTransaction(newtx);

          console.log('split tx:', newtx);
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

    /////////////////////////////////
    //// Merge Confirmation
    /////////////////////////////////
    document.getElementById('send-nft-merge').onclick = async (e) => {
      e.preventDefault();

      try {
        let newtx = await this.app.wallet.createMergeNFTTransaction(this.nft);

        await newtx.sign();
        await this.app.network.propagateTransaction(newtx);

        if (typeof this.app.options.wallet.nftMergeIntents !== 'object') {
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

  getSameIdCount() {
    let nft_list = this.app?.options?.wallet?.nfts || [];

    return nft_list.filter((nft) => nft?.id === this.nft.id).length;
  }

  showSplitOverlay(rowElement, confirmSplit) {
    if (document.querySelector('.fancy-slider-bar')) {
      return;
    }

    let totalAmount = Number(this.nft.amount);
    if (!Number.isFinite(totalAmount) || totalAmount < 2) {
      salert('This NFT cannot be split (amount < 2).');
      return;
    }

    let overlay = document.createElement('div');
    overlay.classList.add('fancy-slider-bar');

    let leftCount = Math.round(totalAmount / 2);
    let rightCount = totalAmount - leftCount;

    let leftDiv = document.createElement('input');
    leftDiv.id = 'split-left';
    leftDiv.classList.add('split-half');
    leftDiv.inputmode = 'numeric';
    leftDiv.type = 'text';
    leftDiv.pattern = 'd*';
    leftDiv.value = leftCount;

    leftDiv.onfocus = (e) => {
      confirmSplit.classList.add('disabled');
    };

    leftDiv.onblur = (e) => {
      leftCount = Math.min(totalAmount - 1, Math.max(parseInt(leftDiv.value), 1));
      let rect = rowElement.getBoundingClientRect();
      let newLeftW = rowWidth * (leftCount / totalAmount);
      newLeftW = Math.max(minLeftW, Math.min(newLeftW, maxLeftW));
      leftDiv.style.width = `${newLeftW}px`;
      let newRightW = rect.width - barWidth - newLeftW;
      rightDiv.style.width = `${newRightW}px`;
      rightCount = totalAmount - leftCount;
      leftDiv.value = leftCount;
      rightDiv.innerText = rightCount;
      confirmSplit.classList.remove('disabled');
    };

    let bar = document.createElement('div');
    bar.classList.add('split-bar');
    bar.innerHTML = `<div class="resize-icon horizontal"></div>`;

    let dragIcon = bar.querySelector('.resize-icon.horizontal');
    Object.assign(dragIcon.style, {
      position: 'absolute',
      left: '50%',
      top: '50%',
      transform: 'translate(-45%, -50%)'
    });

    let rightDiv = document.createElement('div');
    rightDiv.id = 'split-right';
    rightDiv.classList.add('split-half');

    overlay.append(leftDiv, bar, rightDiv);
    rowElement.appendChild(overlay);

    let rowRect = rowElement.getBoundingClientRect();

    let rowWidth = rowRect.width || 0;
    let barWidth = parseInt(getComputedStyle(bar).width) || 5;

    let halfWidth = Math.max(0, (rowWidth - barWidth) / 2);
    leftDiv.style.width = `${halfWidth}px`;
    rightDiv.style.width = `${Math.max(0, rowWidth - barWidth - halfWidth)}px`;

    rightDiv.innerText = rightCount;

    let minLeftW = Math.max(20, rowWidth / (2 * totalAmount));
    let maxLeftW = rowWidth - barWidth - minLeftW;

    let dragSplit = (e) => {
      let rect = rowElement.getBoundingClientRect();
      let x = e.clientX - rect.left;
      let newLeftW = x - barWidth / 2;

      newLeftW = Math.max(minLeftW, Math.min(newLeftW, maxLeftW));

      leftDiv.style.width = `${newLeftW}px`;
      let newRightW = rect.width - barWidth - newLeftW;
      rightDiv.style.width = `${newRightW}px`;

      leftCount = Math.min(
        totalAmount - 1,
        Math.max(Math.round((newLeftW / rect.width) * totalAmount), 1)
      );
      rightCount = totalAmount - leftCount;
      leftDiv.value = leftCount;
      rightDiv.innerText = rightCount;
    };

    bar.addEventListener('mousedown', () => {
      confirmSplit.classList.add('disabled');
      document.addEventListener('mousemove', dragSplit);
      document.addEventListener(
        'mouseup',
        () => {
          document.removeEventListener('mousemove', dragSplit);
          confirmSplit.classList.remove('disabled');
        },
        { once: true }
      );
    });
  }
}

module.exports = NFTDetailsOverlay;
