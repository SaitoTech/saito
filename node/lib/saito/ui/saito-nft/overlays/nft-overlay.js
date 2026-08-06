let NFTOverlayTemplate = require('./nft-overlay.template');
let SaitoOverlay = require('./../../saito-overlay/saito-overlay');
let NFTAtomize = require('./nft-atomize');
let NFTCapabilities = require('./nft-capabilities');

class NFTOverlay {
  constructor(app, mod, attach_events = true) {
    this.app = app;
    this.mod = mod;
    if (app?.browser?.addStylesheet) {
      app.browser.addStylesheet('/saito/css-imports/ui/saito-nft.css');
    }
    this.overlay = new SaitoOverlay(this.app, this.mod);
    this.capabilities = new NFTCapabilities(this.app, this.mod, this);

    this.overlay.callback_on_close = () => {
      if (this.atomizer) {
        this.atomizer.shutdown();
      }
    };

    //
    // ui helpers
    //
    this.nft = null;

    if (attach_events == true) {
      app.connection.on('saito-nft-details-render-request', (nft) => {
        this.render(nft);
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

  render(nft = null) {
    if (nft) {
      this.nft = nft;
    }

    this.overlay.show(NFTOverlayTemplate(this.app, this.mod, this));

    if (!this.nft.tx_fetched) {
      this.nft.fetchTransaction(() => {
        console.log('Rerendering nft overlay after fetching data');
        this.render();
      });
      return;
    }

    // We need to kick this off, so that any child class can finish
    // rendering it's changes to the base class
    setTimeout(() => {
      this.attachBaseEvent();
      this.attachEvents();
    }, 25);
  }

  attachBaseEvent() {
    let info_back_btn = document.querySelector('.saito-nft-info-back');
    if (info_back_btn) {
      info_back_btn.onclick = (e) => {
        e.preventDefault();
        document.querySelector('.saito-nft-overlay.panels')?.classList.remove('saito-nft-mode-info');
        this.capabilities?.setActive('');
      };
    }

    let merge_btn = document.querySelector('.saito-nft-footer-btn.merge');
    //
    // MERGE button
    //
    if (merge_btn) {
      merge_btn.onclick = async (e) => {
        let c = await sconfirm('Merge all copies of NFT into a single one?');
        if (c) {
          this.mergeNFT();
        }
        // no interstitial
        //document.querySelector('.saito-nft-overlay.panels').classList.add('saito-nft-mode-merge');
      };
    }

    let delete_info_btn = document.querySelector('.nft-info-delete-nft');
    if (delete_info_btn) {
      delete_info_btn.onclick = async () => {
        let idx = -1;
        for (let z = 0; z < this.all_slips.length; z++) {
          if (this.mod.publicKey == this.all_slips[z].slip2?.public_key) {
            idx = z;
            break;
          }
        }
        if (idx < 0) {
          return;
        }
        this.nft.resetNFT(this.all_slips[idx]);
        let c = await sconfirm(
          `Delete this NFT and recover ${this.app.wallet.convertNolanToSaito(this.nft.deposit)} SAITO?`
        );
        if (!c) {
          return;
        }
        let newtx = await this.app.wallet.createRemoveNFTTransaction(this.nft);
        await newtx.sign();
        await this.app.network.propagateTransaction(newtx);
        this.app.storage.deleteTransaction(this.nft.tx, null, 'localhost');
        siteMessage('NFT Deletion in Process...', 2000);
        this.overlay.close();
        this.app.connection.emit('saito-nft-list-close-request');
        if (document.querySelector('.saito-nft-list')) {
          this.app.connection.emit('saito-nft-list-render-request');
        }
      };
    }

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
          this.nft.resetNFT(this.all_slips[idx]);

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
            this.showSplitOverlay(utxoIdx);
          }
        };
      }

      //
      // DELETE button
      //
      let delete_btn = document.querySelector(`.utxo-delete-btn[data-utxo-idx="${utxoIdx}"]`);

      if (delete_btn) {
        delete_btn.onclick = async (e) => {
          let idx = parseInt(e.currentTarget.getAttribute('data-utxo-idx')) - 1;
          this.nft.resetNFT(this.all_slips[idx]);
          let c = await sconfirm(
            `Delete this NFT and recover ${this.app.wallet.convertNolanToSaito(this.nft.deposit)} SAITO?`
          );
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

          if (document.querySelector('.saito-nft-list')) {
            this.app.connection.emit('saito-nft-list-render-request');
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

          salert(
            'Deposit functionality is not yet fully implemented. Please check wallet.createDepositNFTTransaction()'
          );

          return;

          let idx = parseInt(e.currentTarget.getAttribute('data-utxo-idx')) - 1;
          //let deposit_nft = this.all_slips[idx];

          // Prompt for deposit amount
          let depositAmount = await sprompt('Enter deposit amount (SAITO):');
          if (!depositAmount || isNaN(Number(depositAmount)) || Number(depositAmount) <= 0) {
            return;
          }

          try {
            // Create deposit transaction
            // Note: This may need to be implemented in the wallet module
            // For now, we'll show an alert that this feature needs implementation
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
  }

  attachEvents() {
    this.capabilities?.attachEvents();

    //
    // Capability action hooks (icons on artwork)
    //
    let send_btn = document.querySelector('.saito-nft-capability.send-nft');
    let enable_btn = document.querySelector('.saito-nft-capability.enable-nft');
    let disable_btn = document.querySelector('.saito-nft-capability.disable-nft');
    let sell_btn = document.querySelector('.saito-nft-capability.sell-nft');

    //
    // contextual confirm buttons
    //
    let cancel_send_btn = document.querySelector('.saito-nft-panel-send .saito-nft-send-back');
    let confirm_send_btn = document.querySelector('.saito-nft-panel-send .saito-nft-confirm-btn');
    let max_amount_btn = document.querySelector('.saito-nft-panel-send .nft-send-max-btn');
    let amount_input = document.querySelector('.saito-nft-panel-send #nft-send-amount');
    let advanced_toggle = document.querySelector('.saito-nft-panel-send .nft-advanced-toggle');
    let advanced_container = document.querySelector('.saito-nft-panel-send .nft-advanced-options');

    const shardMode = () =>
      !!(advanced_container && !advanced_container.classList.contains('collapsed'));
    const syncAmountToSelectedShard = () => {
      const sel = document.querySelector('.saito-nft-panel-send .selected-shard');
      if (!sel || !amount_input || !this.all_slips?.length) {
        return;
      }
      const i = parseInt(sel.getAttribute('data-utxo-idx'), 10) - 1;
      const a = this.all_slips[i]?.slip1?.amount;
      amount_input.value = a == null ? '0' : typeof a === 'bigint' ? a.toString() : String(a);
    };

    // enable / disable visibility is owned by NFTCapabilities.list()

    if (advanced_toggle && advanced_container) {
      advanced_toggle.onclick = (e) => {
        e.preventDefault();
        advanced_container.classList.toggle('collapsed');
        advanced_toggle.setAttribute(
          'aria-expanded',
          advanced_container.classList.contains('collapsed') ? 'false' : 'true'
        );
        if (amount_input && max_amount_btn) {
          const sm = shardMode();
          amount_input.readOnly = sm;
          max_amount_btn.disabled = sm;
          if (sm) {
            syncAmountToSelectedShard();
          }
        }
      };
    }

    if (max_amount_btn && amount_input) {
      max_amount_btn.onclick = (e) => {
        e.preventDefault();
        if (shardMode()) {
          salert(
            'Disable Advanced Options to use MAX or set a custom amount. Shard mode sends the full selected shard.'
          );
          return;
        }
        amount_input.value = String(this.nft.getTotalAmount() || 0);
      };
    }

    //
    // SEND NFT
    //
    if (confirm_send_btn) {
      // Select a shard
      Array.from(document.querySelectorAll('.saito-nft-panel-send .nft-slip-box')).forEach(
        (box) => {
          box.onclick = (e) => {
            if (!e.currentTarget.classList.contains('selected-shard')) {
              document.querySelector('.selected-shard').classList.remove('selected-shard');
              e.currentTarget.classList.add('selected-shard');
            }
            if (shardMode()) {
              syncAmountToSelectedShard();
            }
          };
        }
      );

      // Click to send
      confirm_send_btn.onclick = async (e) => {
        e.preventDefault();

        let rec_in = document.querySelector('#nft-receiver-address');
        let receiver = rec_in ? rec_in.value.trim() : '';
        let is_advanced_open =
          advanced_container && !advanced_container.classList.contains('collapsed');

        if (!this.app.crypto.isPublicKey(receiver)) {
          salert('Receiver’s public key is not valid');
          return;
        }

        try {
          let newtx = null;

          if (is_advanced_open) {
            let selected_shard = document.querySelector('.saito-nft-panel-send .selected-shard');
            if (!selected_shard) {
              salert('Please select which shard you want to send');
              return;
            } else {
              let idx = parseInt(selected_shard.getAttribute('data-utxo-idx')) - 1;
              this.nft.resetNFT(this.all_slips[idx]);
            }
            if (amount_input) {
              syncAmountToSelectedShard();
            }
            newtx = await this.app.wallet.createNFTShardTransaction(this.nft, receiver);
          } else {
            let amount_in = document.querySelector('#nft-send-amount');
            let amount_raw = amount_in ? amount_in.value.trim() : '';
            if (!amount_raw) {
              salert('Please enter NFT amount');
              return;
            }
            let amount = parseInt(amount_raw);
            if (!Number.isInteger(amount) || amount <= 0) {
              salert('Please enter a valid NFT amount');
              return;
            }
            let tx_msg = JSON.parse(JSON.stringify(this.nft.txmsg || {}));
            newtx = await this.app.wallet.createNFTTransaction(
              this.nft,
              receiver,
              amount,
              BigInt(0),
              BigInt(0),
              tx_msg
            );
          }

          //
          // having created the NFT, we now modify its TX_MSG if there are
          // any handlers that want to process the transaction
          //
          newtx = await this.nft.modifyBeforeSend(newtx, receiver);
          if (!newtx) {
            return;
          }

          await newtx.sign();
          await this.app.network.propagateTransaction(newtx);

          siteMessage(`NFT sent to ${receiver}`, 3000);
          this.overlay.close();

          if (document.querySelector('.saito-nft-list')) {
            this.app.connection.emit('saito-nft-list-render-request');
          }
        } catch (err) {
          console.error(err);
          salert('Failed to send NFT');
        }
      };
    }

    //
    // SEND button
    //
    if (send_btn) {
      send_btn.onclick = (e) => {
        document.querySelector('.saito-nft-overlay.panels')?.classList.add('saito-nft-mode-send');
        document.querySelector('.saito-nft-overlay.panels')?.classList.remove('saito-nft-mode-info');
        this.capabilities?.setActive('transfer');
      };
    }

    if (cancel_send_btn) {
      cancel_send_btn.onclick = (e) => {
        document.querySelector('.saito-nft-overlay.panels')?.classList.remove('saito-nft-mode-send');
        this.capabilities?.setActive('');
      };
    }

    //
    // Enable button
    //
    if (enable_btn) {
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
    }

    //
    // Disable button
    //
    if (disable_btn) {
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
    }

    //
    // Sell on Store
    //
    const seller = this.app.modules.returnFirstRespondTo('saito-sell-nft');
    if (sell_btn && seller) {
      sell_btn.onclick = (e) => {
        seller.render({
          nft: this.nft,
          callback: (obj) => {
            if (obj.status === 'listed') {
              this.overlay.close();
              if (document.querySelector('.saito-nft-list')) {
                this.app.connection.emit('saito-nft-list-render-request');
              }
            }
          }
        });
      };
    }
  }

  async mergeNFT() {
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

      if (document.querySelector('.saito-nft-list')) {
        this.app.connection.emit('saito-nft-list-render-request');
      }
    } catch (err) {
      console.error(err);
    }
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
    let atomizeButton = document.querySelector(`.atomize-button-utxo-${utxoIdx}`);

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

          if (document.querySelector('.saito-nft-list')) {
            this.app.connection.emit('saito-nft-list-render-request');
          }
        } catch (err) {
          console.error(err);
          this.app.browser.safeConsole('NFT: ', this.nft, 'debug');
        }
      };

      if (atomizeButton) {
        atomizeButton.onclick = async (e) => {
          this.atomize_in_progress = true;
          const this_nft = this.all_slips[utxoIdx - 1];
          if (!this_nft) {
            return;
          }
          this.atomizer_ui = new NFTAtomize(
            this.app,
            this.mod,
            '.split-container-utxo-' + utxoIdx,
            this_nft,
            utxoIdx
          );
          this.atomizer_ui.render();
        };
      }

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
