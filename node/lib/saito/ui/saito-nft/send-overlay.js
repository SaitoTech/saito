const sendOverlayTemplate = require('./send-overlay.template');
const SaitoOverlay = require('./../saito-overlay/saito-overlay');

class SendNft {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
    this.overlay = new SaitoOverlay(this.app, this.mod);

    //
    // UI helpers
    //
    this.nft = null;
    this.idx = null;
    this.nft_list = [];
  }

  async render(nft) {
    this.nft = nft;
    this.nft_list = this.app?.options?.wallet?.nfts || [];

    this.overlay.show(sendOverlayTemplate(this.app, this.mod, nft));

    // ensure DOM is in place
    setTimeout(async () => await this.attachEvents(), 0);
  }

  async attachEvents() {
    // Scope to the most recently rendered overlay instance
    const overlays = document.querySelectorAll('.nft-details-container');
    this._overlayRoot = overlays.length ? overlays[overlays.length - 1] : document;

    this.mergeBtn = this._overlayRoot.querySelector('#send-nft-merge');
    this.splitBtn = this._overlayRoot.querySelector('#send-nft-split');
    this.cancelSplitBtn = this._overlayRoot.querySelector('#send-nft-cancel-split');
    this.confirmSplitBtn = this._overlayRoot.querySelector('#send-nft-confirm-split');
    this.sendBtn = this._overlayRoot.querySelector('#send_nft');
    this.receiver_input = this._overlayRoot.querySelector('#nft-receiver-address');
    this.splitBar = this._overlayRoot.querySelector('#nft-details-split-bar');
    this.mergeSplitCont = this._overlayRoot.querySelector('#nft-merge-split');
    this.mergeCont = this._overlayRoot.querySelector('#nft-details-merge');
    this.splitCont = this._overlayRoot.querySelector('#nft-details-split');

    this.showMergeSplitContainer();
    this.setupValidateAddress();
    this.setupSendButton();
    this.setupMergeButton();
    this.setupSplitButton();
    this.setupCancelSplitButton();
    this.setupConfirmSplitButton();
  }

  showMergeSplitContainer() {
    const sameIdCount = this.getSameIdCount();

    //
    // show merge-split container if:
    // more than 1 nft with this.id exists in wallet
    // or
    // the amount of nfts are greater than 1 and is eligible for split
    //
    if (sameIdCount > 1 || this.nft.amount > 1) {
      this.mergeSplitCont.style.display = 'flex';
    } else {
      this.mergeSplitCont.style.display = 'none';
    }
  }

  setupValidateAddress() {
    if (!this.receiver_input || !this.sendBtn) {
      console.warn('setupValidateAddress: receiver_input or sendBtn not found');
      return;
    }

    const syncBtn = (e) => {
      // Always read from the event target if present; fall back to the current node
      const val = (e?.currentTarget?.value ?? this.receiver_input.value ?? '').trim();
      const empty = val.length === 0;

      this.sendBtn.classList.toggle('disabled', empty);
      this.sendBtn.toggleAttribute('disabled', empty);

      // console.log('syncBtn:', { empty, val, node: this.receiver_input, sameNode: e?.currentTarget === this.receiver_input });
    };

    // Avoid stacking listeners if overlay opens multiple times
    if (this._syncBtnListener) {
      this.receiver_input.removeEventListener('input', this._syncBtnListener);
      this.receiver_input.removeEventListener('change', this._syncBtnListener);
    }
    this._syncBtnListener = syncBtn;

    this.receiver_input.addEventListener('input', this._syncBtnListener);
    this.receiver_input.addEventListener('change', this._syncBtnListener);

    // Initialize once right away
    syncBtn();
  }

  setupSendButton() {
    if (!this.sendBtn) return;

    this.sendBtn.onclick = async (e) => {
      e.preventDefault();

      // validate receiver's public_key
      const receiver = this.receiver_input ? this.receiver_input.value.trim() : '';
      let pc = this.app.wallet.returnPreferredCrypto();
      let valid = pc.validateAddress(receiver);

      if (!valid) {
        salert('Receiver’s public key is not valid');
        return;
      }

      const prevLabel = this.sendBtn.innerText;
      this.sendBtn.classList.add('disabled');
      this.sendBtn.setAttribute('disabled', 'disabled');
      this.sendBtn.innerText = 'Submitting...';

      try {
        const nftItem = this.getNftItem(this.nft.slip1?.utxo_key);
        if (!nftItem) throw new Error('Selected NFT not found.');

        const slip1Key = nftItem?.slip1?.utxo_key;
        const slip2Key = nftItem?.slip2?.utxo_key;
        const slip3Key = nftItem?.slip3?.utxo_key;
        if (!slip1Key || !slip2Key || !slip3Key) {
          throw new Error('Missing required UTXO keys for NFT.');
        }

        const amt = BigInt(1);

        const obj = {};
        if (this.nft.image) obj.image = this.nft.image;
        if (this.nft.text) obj.text = this.nft.text;

        const tx_msg = {
          data: obj,
          module: 'NFT',
          request: 'send nft'
        };

        await this.app.wallet.createSendBoundTransaction(
          amt,
          slip1Key,
          slip2Key,
          slip3Key,
          receiver,
          tx_msg
        );

        salert('Send NFT tx sent');
        this.overlay.close();
        if (document.querySelector('.send-nft-container')) {
          this.app.connection.emit('saito-list-nft-render-request', {});
        }
      } catch (err) {
        salert('Failed to send NFT: ' + (err?.message || err));
      } finally {
        this.sendBtn.classList.remove('disabled');
        this.sendBtn.removeAttribute('disabled');
        this.sendBtn.innerText = prevLabel;
      }
    };
  }

  setupMergeButton() {
    if (!this.mergeBtn) return;

    const sameIdCount = this.getSameIdCount();
    if (sameIdCount > 1) {
      this.mergeBtn.classList.remove('disabled');
      this.mergeCont.style.display = 'block';
    } else {
      this.mergeBtn.classList.add('disabled');
      this.mergeCont.style.display = 'none';
    }

    this.mergeBtn.onclick = async (e) => {
      e.preventDefault();
      if (this.mergeBtn.classList.contains('disabled')) return;

      const confirmMerge = confirm(`Merge all NFTs with id: ${this.nft.id}?`);
      if (!confirmMerge) return;

      try {
        const obj = {};
        if (this.nft.image) obj.image = this.nft.image;
        if (this.nft.text) obj.text = this.nft.text;

        const tx_msg = { data: obj, module: 'NFT', request: 'merge nft' };

        await this.app.wallet.mergeNft(this.nft.id, tx_msg);

        if (typeof this.app.options.wallet.nftMergeIntents !== 'object') {
          this.app.options.wallet.nftMergeIntents = {};
        }
        this.app.options.wallet.nftMergeIntents[this.nft.id] = Date.now();

        this.app.wallet.saveWallet();

        salert('Merge NFT tx sent');
        this.overlay.close();
        if (document.querySelector('.send-nft-container')) {
          this.app.connection.emit('saito-list-nft-render-request', {});
        }
      } catch (err) {
        salert('Merge failed: ' + (err?.message || err));
      }
    };
  }

  // Returns the NFT item object instead of an index
  getNftItem(slip1_utxokey) {
    if (!slip1_utxokey) return null;
    return this.nft_list.find((nft) => nft?.slip1?.utxo_key === slip1_utxokey) || null;
  }

  // If you still want the index variant, keep this:
  getNftIndex(slip1_utxokey) {
    return this.nft_list.findIndex((nft) => nft?.slip1?.utxo_key === slip1_utxokey);
  }

  getSameIdCount() {
    return this.nft_list.filter((nft) => nft?.id === this.nft.id).length;
  }

  setupSplitButton() {
    if (!this.splitBtn) return;

    this.splitBar.style.display = 'none';

    if (this.nft.amount > 1) {
      this.splitBtn.classList.remove('disabled');
      this.splitCont.style.display = 'block';
    } else {
      this.splitBtn.classList.add('disabled');
      this.splitCont.style.display = 'none';
    }

    this.splitBtn.onclick = (e) => {
      e.preventDefault();
      if (this.splitBtn.classList.contains('disabled')) return;
      let splitText = document.querySelector('.nft-details-split p');

      this.cancelSplitBtn.style.display = 'block';
      this.confirmSplitBtn.style.display = 'block';
      this.splitBtn.style.display = 'none';
      this.splitBar.style.display = 'block';
      splitText.style.display = 'none';

      if (!this.splitBar) return;
      this.showSplitOverlay(this.splitBar);
    };
  }

  setupCancelSplitButton() {
    if (!this.cancelSplitBtn) return;

    this.cancelSplitBtn.onclick = (e) => {
      e.preventDefault();
      let splitText = document.querySelector('.nft-details-split p');

      // Hide confirm/cancel
      this.cancelSplitBtn.style.display = 'none';
      this.confirmSplitBtn.style.display = 'none';
      this.splitBtn.style.display = 'block';
      splitText.style.display = 'block';
      this.splitBar.style.display = 'none';
      this.splitBar.innerHTML = ``;
    };
  }

  setupConfirmSplitButton() {
    if (!this.confirmSplitBtn) return;

    this.confirmSplitBtn.onclick = async (e) => {
      e.preventDefault();

      if (!this.splitBar) return;

      const leftCount = parseInt(this.splitBar.querySelector('.split-left')?.innerText || '0', 10);
      const rightCount = parseInt(
        this.splitBar.querySelector('.split-right')?.innerText || '0',
        10
      );

      const slip1UtxoKey = this.nft.slip1?.utxo_key;
      const slip2UtxoKey = this.nft.slip2?.utxo_key;
      const slip3UtxoKey = this.nft.slip3?.utxo_key;
      if (!slip1UtxoKey || !slip2UtxoKey || !slip3UtxoKey) {
        salert('Missing required UTXO keys for NFT.');
        return;
      }

      const obj = {};
      if (this.nft.image) obj.image = this.nft.image;
      if (this.nft.text) obj.text = this.nft.text;

      const tx_msg = {
        data: obj,
        module: 'NFT',
        request: 'split nft'
      };

      try {
        const newtx = await this.app.wallet.splitNft(
          slip1UtxoKey,
          slip2UtxoKey,
          slip3UtxoKey,
          leftCount,
          rightCount,
          tx_msg
        );
        console.log('split tx:', newtx);
        salert('Split NFT tx sent');
        this.overlay.close();
        if (document.querySelector('.send-nft-container')) {
          this.app.connection.emit('saito-list-nft-render-request', {});
        }
      } catch (err) {
        salert('Split failed: ' + (err?.message || err));
      }
    };
  }

  returnId() {
    if (this.tx.to.length < 3) {
      return '';
    }
    return this.tx.to[0].publicKey + this.tx.to[2].publicKey;
  }

  showSplitOverlay(rowElement) {
    let totalAmount = Number(this.nft.amount);
    console.log('amount: ', totalAmount);
    if (!Number.isFinite(totalAmount) || totalAmount < 2) {
      salert('This NFT cannot be split (amount < 2).');
      return;
    }

    const overlay = document.createElement('div');
    overlay.classList.add('split-overlay');
    Object.assign(overlay.style, {
      position: 'relative',
      width: '100%',
      backgroundColor: 'var(--saito-background-color)',
      display: 'flex',
      zIndex: '10',
      padding: '1rem 0rem',
      border: '1px solid var(--saito-border-color-dark)'
    });

    const leftDiv = document.createElement('div');
    leftDiv.classList.add('split-left');
    Object.assign(leftDiv.style, {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
      fontSize: '1.4rem'
    });

    const bar = document.createElement('div');
    bar.classList.add('split-bar');
    Object.assign(bar.style, {
      width: '2px',
      backgroundColor: 'var(--saito-primary)',
      cursor: 'col-resize',
      position: 'relative'
    });
    bar.innerHTML = `<div class="resize-icon horizontal"></div>`;

    const dragIcon = bar.querySelector('.resize-icon.horizontal');
    Object.assign(dragIcon.style, {
      position: 'absolute',
      left: '50%',
      top: '50%',
      transform: 'translate(-45%, -50%)',
      pointerEvents: 'none'
    });

    const rightDiv = document.createElement('div');
    rightDiv.classList.add('split-right');
    Object.assign(rightDiv.style, {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
      fontSize: '1.4rem'
    });

    overlay.append(leftDiv, bar, rightDiv);
    rowElement.appendChild(overlay);

    const rowRect = rowElement.getBoundingClientRect();
    const rowWidth = rowRect.width || 0;
    const barWidth = parseInt(getComputedStyle(bar).width, 10) || 2;

    const halfWidth = Math.max(0, (rowWidth - barWidth) / 2);
    leftDiv.style.width = `${halfWidth}px`;
    rightDiv.style.width = `${Math.max(0, rowWidth - barWidth - halfWidth)}px`;

    let leftCount = Math.round((halfWidth / rowWidth) * totalAmount);
    let rightCount = totalAmount - leftCount;
    leftDiv.innerText = leftCount;
    rightDiv.innerText = rightCount;

    const minLeftW = (0.5 / totalAmount) * rowWidth;
    const maxLeftW = rowWidth - barWidth - minLeftW;

    const dragSplit = (e) => {
      const rect = rowElement.getBoundingClientRect();
      const x = e.clientX - rect.left;
      let newLeftW = x - barWidth / 2;

      newLeftW = Math.max(minLeftW, Math.min(newLeftW, maxLeftW));

      leftDiv.style.width = `${newLeftW}px`;
      const newRightW = rect.width - barWidth - newLeftW;
      rightDiv.style.width = `${newRightW}px`;

      leftCount = Math.round((newLeftW / rect.width) * totalAmount);
      rightCount = totalAmount - leftCount;
      leftDiv.innerText = leftCount;
      rightDiv.innerText = rightCount;
    };

    bar.addEventListener('mousedown', () => {
      document.addEventListener('mousemove', dragSplit);
      document.addEventListener(
        'mouseup',
        () => document.removeEventListener('mousemove', dragSplit),
        { once: true }
      );
    });
  }
}

module.exports = SendNft;
