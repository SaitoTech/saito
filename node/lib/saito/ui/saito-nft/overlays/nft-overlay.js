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

    this.total_slips = 0;
    this.total_amount = 0;
    this.all_slips = [];
    this.can_split = false;
    this.can_merge = false;

    if (attach_events == true) {
      app.connection.on('saito-nft-details-render-request', (nft) => {
        //
        // CHANGE THIS
        ///
        //

        this.nft = nft;
        this.owner = nft.slip1.public_key;
        this.render();
      });

      app.connection.on('saito-nft-details-close-request', () => {
        this.overlay.close();
      });

      //app.connection.on('saito-disable-nft', (obj) => {
      // obj.nft_id
      // obj.nft_sig
      //});

      //app.connection.on('saito-enable-nft', (obj) => {
      // obj.nft_id
      // obj.nft_sig
      //});
    }
  }

  render() {
    //
    // examine wallet for all possibilities
    //
    let nft_list = this.app.options.wallet.nfts;
    this.all_slips = [];
    this.total_slips = 0;
    this.total_amount = 0;
    this.can_split = false;
    this.can_merge = false;

    for (let z = 0; z < nft_list.length; z++) {
      let n = nft_list[z];
      if (n.id == this.nft.id) {
        this.total_slips++;
        this.total_amount += n.slip1.amount;
        if (this.total_slips > 1) {
          this.can_merge = true;
        }
        if (n.slip1.amount > 1) {
          this.can_split = true;
        }
        this.all_slips.push(n);
      }
    }

    this.overlay.show(NFTOverlayTemplate(this.app, this.mod, this));
    setTimeout(() => {
      this.attachEvents();
    }, 25);
  }

  attachEvents() {
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
    let delete_btn = document.querySelector('.saito-nft-delete-btn');

    //
    // contextual confirm buttons
    //
    let confirm_send_btn = document.querySelector('.saito-nft-panel-send .saito-nft-confirm-btn');
    let confirm_split_btn = document.querySelector('.saito-nft-confirm-split');
    let confirm_merge_btn = document.querySelector('#saito-nft-confirm-merge');

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

    //
    //
    //
    enable_btn.style.display = can_enable ? 'flex' : 'none';
    disable_btn.style.display = can_disable ? 'flex' : 'none';

    //
    // split + merge visibility
    //
    let can_split = this.can_split;
    let can_merge = this.can_merge;
try {
    console.log('Number(this.nft.amount): ', Number(this.nft.amount));
    console.log('this.mod.publicKey: ', this.mod.publicKey);
    console.log('this.owner: ', this.owner);
    console.log('nft.slip1.public_key: ', this.nft.slip1.public_key);
    console.log('this.getSameIdCoun(): ', this.getSameIdCount());
} catch (err) {
    console.log("error in nft overlay: " + err);
}
    if (Number(this.nft.amount) > 1 && this.mod.publicKey == this.nft.slip1.public_key) {
      can_split = true;
    }

    if (this.getSameIdCount() > 1 && this.mod.publicKey == this.nft.slip1.public_key) {
      can_merge = true;
    }

    //split_btn.style.display = can_split ? 'flex' : 'none';
    //merge_btn.style.display = can_merge ? 'flex' : 'none';

    //
    // split and deposit (info panel)
    //
    for (let z = 0; z < this.all_slips.length; z++) {
      let utxoIdx = z + 1;

      // Split button (works with both old and new structure)
      let splitBtn = document.querySelector(`.utxo-split-btn[data-utxo-idx="${utxoIdx}"]`);
      if (!splitBtn) {
        // Try new structure
        splitBtn = document.querySelector(`#utxo_${utxoIdx} .utxo-split-btn`);
      }
      if (splitBtn) {
        splitBtn.onclick = async (e) => {
          let idx = parseInt(e.currentTarget.getAttribute('data-utxo-idx')) - 1;
          let split_nft = this.all_slips[idx];

          this.nft.tx_sig = split_nft.tx_sig;
          this.nft.slip1 = split_nft.slip1;
          this.nft.slip2 = split_nft.slip2;
          this.nft.slip3 = split_nft.slip3;
          this.nft.amount = split_nft.slip1.amount;
          this.nft.deposit = split_nft.slip2.amount;

          // Hide all overlays first
          document.querySelectorAll('.saito-nft-split-overlay').forEach((overlay) => {
            overlay.classList.remove('split-overlay-active');
          });

          // Remove active class from panel
          let panel = document.querySelector('.saito-nft-panel-info');
          if (panel) {
            panel.classList.remove('split-overlay-panel-active');
          }

          // Show the specific overlay for this UTXO
          let overlay = document.querySelector(`.split-container-utxo-${utxoIdx}`);
          if (overlay) {
            overlay.classList.add('split-overlay-active');
            // Add active class to panel for CSS targeting
            if (panel) {
              panel.classList.add('split-overlay-panel-active');
            }
            this_self.showSplitOverlay(utxoIdx);
          }
        };
      }

      // Return button handler
      let returnBtn = document.querySelector(`.split-return-button-utxo-${utxoIdx}`);
      if (returnBtn) {
        returnBtn.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          // Hide the overlay
          let overlay = document.querySelector(`.split-container-utxo-${utxoIdx}`);
          if (overlay) {
            overlay.classList.remove('split-overlay-active');
          }
          // Remove active class from panel
          let panel = document.querySelector('.saito-nft-panel-info');
          if (panel) {
            panel.classList.remove('split-overlay-panel-active');
          }
        };
      }

      // Deposit button (works with both old and new structure)
      let depositBtn = document.querySelector(`.utxo-deposit-btn[data-utxo-idx="${utxoIdx}"]`);
      if (!depositBtn) {
        // Try new structure
        depositBtn = document.querySelector(`#utxo_${utxoIdx} .utxo-deposit-btn`);
      }
      if (depositBtn) {
        depositBtn.onclick = async (e) => {
          e.preventDefault();
          e.stopPropagation();

          let idx = parseInt(e.currentTarget.getAttribute('data-utxo-idx')) - 1;
          let deposit_nft = this.all_slips[idx];

          // Prompt for deposit amount
          let depositAmount = await sprompt('Enter deposit amount (SAITO):');
          if (!depositAmount || isNaN(Number(depositAmount)) || Number(depositAmount) <= 0) {
            return;
          }

          try {
            // Create deposit transaction
            // Note: This may need to be implemented in the wallet module
            // For now, we'll show an alert that this feature needs implementation
            salert(
              'Deposit functionality is not yet fully implemented. Please check wallet.createDepositNFTTransaction()'
            );

            // TODO: Implement deposit transaction creation
            // let tx = await this.app.wallet.createDepositNFTTransaction(deposit_nft, depositAmount);
            // await tx.sign();
            // await this.app.network.propagateTransaction(tx);
            // siteMessage('Deposit transaction sent', 2000);
            // this.render();
          } catch (err) {
            console.error(err);
            salert('Failed to create deposit transaction: ' + (err?.message || err));
          }
        };
      }
    }

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
          let newtx = await this.app.wallet.createSendNFTTransaction(this.nft, receiver);

          let nft_type = this.nft?.nft_type;
          console.log('about to go into looking for this nft-type: ' + nft_type);

          const handlers = this.app.modules.getRespondTos('saito-nft-transfer', this.nft);

          for (const modobj of handlers) {
            if (!modobj?.class || !modobj.class.includes(nft_type) || !nft_type) {
              console.log('no class or incude type found... ');
              continue;
            }
            if (typeof modobj.onTransfer === 'function') {
              console.log('running ontransfer...');
              try {
                newtx = await modobj.onTransfer(this.nft, newtx, receiver);
              } catch (err) {
                console.error('onTransfer() failed in module...');
                salert(`NFT transfer blocked by module...`);
                return;
              }
            }
          }

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
    // header info toggle
    //
    header_btn.onclick = (e) => {
      let p = document.querySelector('.saito-nft-overlay.panels');

      if (p) {
        if (p.classList.contains('saito-nft-mode-info')) {
          p.classList.remove('saito-nft-mode-info');
        } else {
          p.classList.add('saito-nft-mode-info');
        }
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
    // DELETE button
    //
    delete_btn.onclick = async (e) => {
      let c = await sconfirm(`Delete this NFT and recover the SAITO?`);
      if (!c) {
        return;
      }

      //
      // create & send remove NFT tx
      //
      let newtx = await this.app.wallet.createRemoveNFTTransaction(this.nft);
      await newtx.sign();
      await this.app.network.propagateTransaction(newtx);

      //
      // remove any copies of NFT from local archive
      //
      this.app.storage.deleteTransaction(this.nft.tx, null, 'localhost');

      siteMessage('NFT Deletion in Process...', 2000);
      this.overlay.close();

      // Close the overlay listing your nfts
      this.app.connection.emit('saito-nft-list-close-request');

      if (document.querySelector('.nft-list-container')) {
        this.app.connection.emit('saito-nft-list-render-request');
      }
    };

    /*****
    //
    // MERGE button
    //
    merge_btn.onclick = (e) => {
      document.querySelector('.saito-nft-overlay.panels').classList.add('saito-nft-mode-merge');
    };
****/

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

      this.app.connection.emit('saito-enable-nft', {
        nft_id: this.nft.id,
        nft_sig: this.nft.tx_sig
      });

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

      this.app.connection.emit('saito-disable-nft', {
        nft_id: this.nft.id,
        nft_sig: this.nft.tx_sig
      });

      salert('NFT Disabled for Next Reload');
      this.app.storage.saveOptions();
      this.render();
    };

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
  }

  //
  // count items for merge
  //
  getSameIdCount() {
    let arr = this.app?.options?.wallet?.nfts || [];
    return arr.filter((n) => n?.id === this.nft.id).length;
  }

  //
  // Decode slip3.public_key to extract original creation block_id and tx_ordinal
  //
  decodeSlip3CreationInfo() {
    if (!this.nft?.slip3?.public_key) {
      return { block_id: null, tx_ordinal: null };
    }

    try {
      // Use the NFT's base58ToBytes method if available, otherwise use our own
      let bytes = null;
      if (this.nft.base58ToBytes) {
        bytes = this.nft.base58ToBytes(this.nft.slip3.public_key);
      } else if (this.app?.crypto?.fromBase58) {
        // Use app's crypto utility
        let hex = this.app.crypto.fromBase58(this.nft.slip3.public_key);
        bytes = this.hexToBytes(hex);
      } else {
        // Fallback: try to use hex if it's already bytes
        if (
          typeof this.nft.slip3.public_key === 'string' &&
          /^[0-9a-fA-F]{66}$/.test(this.nft.slip3.public_key)
        ) {
          bytes = this.hexToBytes(this.nft.slip3.public_key);
        } else {
          // Try our own base58 decoder
          bytes = this.base58ToBytes(this.nft.slip3.public_key);
        }
      }

      if (!bytes || bytes.length < 16) {
        return { block_id: null, tx_ordinal: null };
      }

      // Extract block_id (bytes 0-7, big-endian u64)
      let blockIdBytes = bytes.slice(0, 8);
      let block_id = 0n;
      for (let i = 0; i < 8; i++) {
        block_id = (block_id << 8n) | BigInt(blockIdBytes[i]);
      }

      // Extract tx_ordinal (bytes 8-15, big-endian u64)
      let txOrdBytes = bytes.slice(8, 16);
      let tx_ordinal = 0n;
      for (let i = 0; i < 8; i++) {
        tx_ordinal = (tx_ordinal << 8n) | BigInt(txOrdBytes[i]);
      }

      return {
        block_id: block_id.toString(),
        tx_ordinal: tx_ordinal.toString()
      };
    } catch (err) {
      console.error('Error decoding slip3 creation info:', err);
      return { block_id: null, tx_ordinal: null };
    }
  }

  //
  // Helper to convert hex string to bytes
  //
  hexToBytes(hex) {
    let clean = hex.startsWith('0x') ? hex.slice(2) : hex;
    let out = new Uint8Array(clean.length / 2);
    for (let i = 0; i < out.length; i++) {
      out[i] = parseInt(clean.substr(i * 2, 2), 16);
    }
    return out;
  }

  //
  // Base58 decoder (fallback if NFT doesn't have it)
  //
  base58ToBytes(str) {
    let B58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    let B58_MAP = (() => {
      let m = new Map();
      for (let i = 0; i < B58_ALPHABET.length; i++) m.set(B58_ALPHABET[i], i);
      return m;
    })();

    let zeros = 0;
    while (zeros < str.length && str[zeros] === '1') zeros++;

    let bytes = [];
    for (let i = zeros; i < str.length; i++) {
      let val = B58_MAP.get(str[i]);
      if (val == null) throw new Error('Invalid Base58 character');
      let carry = val;
      for (let j = 0; j < bytes.length; j++) {
        let x = bytes[j] * 58 + carry;
        bytes[j] = x & 0xff;
        carry = x >> 8;
      }
      while (carry > 0) {
        bytes.push(carry & 0xff);
        carry >>= 8;
      }
    }

    for (let k = 0; k < zeros; k++) bytes.push(0);
    bytes.reverse();
    return new Uint8Array(bytes);
  }

  //
  // Extract metadata from txmsg (excluding data subobject, title, and description)
  //
  extractMetadata() {
    if (!this.nft?.tx) {
      return {};
    }

    let txmsg = this.nft.tx.returnMessage();
    if (!txmsg) {
      return {};
    }

    let metadata = {};
    let dataKeys = txmsg.data ? Object.keys(txmsg.data) : [];
    let excludeKeys = ['title', 'description', ...dataKeys];

    for (let key in txmsg) {
      if (!excludeKeys.includes(key) && key !== 'data') {
        metadata[key] = txmsg[key];
      }
    }

    return metadata;
  }

  showSplitOverlay(utxoIdx) {
    if (!utxoIdx) {
      return;
    }

    let totalAmount = Number(this.nft.amount);
    if (!Number.isFinite(totalAmount) || totalAmount < 2) {
      salert('This NFT cannot be split (amount < 2).');
      return;
    }

    // Get the specific slider elements for this UTXO
    let slider = document.querySelector(`#split-slider-utxo-${utxoIdx}`);
    let leftDiv = document.querySelector(`#split-left-utxo-${utxoIdx}`);
    let bar = document.querySelector(`#split-bar-utxo-${utxoIdx}`);
    let rightDiv = document.querySelector(`#split-right-utxo-${utxoIdx}`);
    let leftNumberBox = document.querySelector(`#split-number-left-utxo-${utxoIdx}`);
    let rightNumberBox = document.querySelector(`#split-number-right-utxo-${utxoIdx}`);
    let confirmSplitButton = document.querySelector(`.split-button-utxo-${utxoIdx}`);

    if (
      !slider ||
      !leftDiv ||
      !bar ||
      !rightDiv ||
      !leftNumberBox ||
      !rightNumberBox ||
      !confirmSplitButton
    ) {
      console.error('Slider elements not found for UTXO', utxoIdx);
      return;
    }

    // Wait for layout to settle before calculating dimensions
    setTimeout(() => {
      //
      // GET REAL WIDTH
      //
      let parentWidth = slider.getBoundingClientRect().width;
      let barRect = bar.getBoundingClientRect();
      let barWidth = barRect.width;
      let usable = parentWidth - barWidth;

      let minW = 20;

      //
      // INITIAL VALUES
      //
      let leftCount = Math.round(totalAmount / 2);
      let rightCount = totalAmount - leftCount;

      let leftW = usable * (leftCount / totalAmount);
      let rightW = usable - leftW;

      leftDiv.style.width = leftW + 'px';
      rightDiv.style.width = rightW + 'px';

      // Update number boxes instead of split halves
      leftNumberBox.innerHTML = leftCount;
      rightNumberBox.innerHTML = rightCount;

      //
      // CONFIRM BUTTON
      //
      confirmSplitButton.onclick = async (e) => {
        e.preventDefault();

        let L = parseInt(leftNumberBox.innerText);
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

      //
      // DRAG FUNCTION
      //
      let drag = (e) => {
        let rect = slider.getBoundingClientRect();
        let x = e.clientX - rect.left;

        let newLeftW = x;
        newLeftW = Math.max(minW, Math.min(newLeftW, usable - minW));

        let newRightW = usable - newLeftW;

        leftDiv.style.width = newLeftW + 'px';
        rightDiv.style.width = newRightW + 'px';

        leftCount = Math.round((newLeftW / usable) * totalAmount);
        leftCount = Math.max(1, Math.min(leftCount, totalAmount - 1));
        rightCount = totalAmount - leftCount;

        // Update number boxes instead of split halves
        leftNumberBox.innerHTML = leftCount;
        rightNumberBox.innerHTML = rightCount;
      };

      //
      // ATTACH EVENT HANDLERS
      //
      bar.onmousedown = (e) => {
        e.preventDefault();
        e.stopPropagation();
        document.addEventListener('mousemove', drag);
        document.addEventListener(
          'mouseup',
          () => {
            document.removeEventListener('mousemove', drag);
          },
          { once: true }
        );
      };

      // Ensure bar is clickable
      bar.style.pointerEvents = 'auto';
      bar.style.position = 'relative';
      bar.style.zIndex = '11';
    }, 50);
  }
}

module.exports = NFTOverlay;
