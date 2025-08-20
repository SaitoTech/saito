const SendNftTemplate = require('./send-overlay.template');
const Nft = require('./nft');
const SaitoOverlay = require('./../saito-overlay/saito-overlay');
const SaitoUser = require('./../saito-user/saito-user');

class SendNft {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
    this.overlay = new SaitoOverlay(this.app, this.mod);
    this.nft_selected = null;
    this.nft_list = [];
    this.nft_cards = [];
    this.app.connection.on('saito-send-nft-render-request', () => {
      this.overlay.close();
      this.render();
    });
  }

  async render() {
    this.overlay.show(SendNftTemplate(this.app, this.mod));
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

    // setup click event for nft component
    this.setupRowClicks();
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
    this.nextBtn = document.querySelector('#nft-next');
    this.mergeBtn = document.querySelector('#send-nft-merge');
    this.splitBtn = document.querySelector('#send-nft-split');
    this.cancelSplitBtn = document.querySelector('#send-nft-cancel-split');
    this.confirmSplitBtn = document.querySelector('#send-nft-confirm-split');
    this.page1Nav = document.querySelector('.page-navigation.page1');
    this.page2Nav = document.querySelector('.page-navigation.page2');
    this.sendNftTitle = document.querySelector('#send-nft-title');
    this.backBtn = document.querySelector('#nft-back');
    this.sendBtn = document.querySelector('#send_nft');

    this.initializeNavButtons();
    this.setupCreateLink();
    this.setupMergeButton();
    this.setupSplitButton();
    this.setupCancelSplitButton();
    this.setupConfirmSplitButton();
    //this.setupRowClicks();
    this.setupNextButton();
    this.setupBackButton();
    this.setupSendButton();
  }

  // initializeNavButtons: show buttons but disabled; keep cancel/confirm hidden
  initializeNavButtons() {
    if (this.nextBtn) this.nextBtn.classList.add('disabled');

    // show merge/split/send but disabled
    [this.mergeBtn, this.splitBtn, this.sendBtn].forEach((btn) => {
      if (!btn) return;
      btn.style.display = 'inline-block';
      btn.classList.add('disabled');
    });

    // keep cancel/confirm hidden
    [this.cancelSplitBtn, this.confirmSplitBtn].forEach((btn) => {
      if (btn) btn.style.display = 'none';
    });
  }

  setupCreateLink() {
    if (!this.createLink) return;
    this.createLink.onclick = (e) => {
      e.preventDefault();
      this.overlay.close();
      this.app.connection.emit('saito-create-nft-render-request', {});
    };
  }

  // setupMergeButton: ignore clicks if disabled
  setupMergeButton() {
    if (!this.mergeBtn) return;

    this.mergeBtn.onclick = async (e) => {
      e.preventDefault();
      if (this.mergeBtn.classList.contains('disabled')) return; // <—

      const nftCardElem = document.querySelector('.nft-card.nft-selected');

      if (this.nft_selected === null) {
        alert('Please select an NFT to merge.');
        return;
      }
      const nftItem = this.nft_list[this.nft_selected];
      if (!nftItem || !nftItem.id) {
        alert('Unable to find selected NFT.');
        return;
      }
      const nftId = nftItem.id;

      const confirmMerge = confirm(`Merge all nfts with id: ${nftId}?`);
      if (!confirmMerge) return;

      // console.log("this.nft_list: ", this.nft_list);
      // console.log("this.nft_cards: ", this.nft_cards);
      // console.log("this.nft_selected: ", this.nft_selected);

      const slip1UtxoKey = this.nft_list[this.nft_selected].slip1.utxo_key;

      try {
        let obj = {};
        if (this.nft_cards[slip1UtxoKey].image != '')
          obj.image = this.nft_cards[slip1UtxoKey].image;
        if (this.nft_cards[slip1UtxoKey].text != '') obj.text = this.nft_cards[slip1UtxoKey].text;

        let tx_msg = { data: obj, module: 'NFT', request: 'merge nft' };
        const mergeTx = await this.app.wallet.mergeNft(nftId, tx_msg);

        salert(`Merge NFT tx sent`);
        this.overlay.close();
      } catch (err) {
        alert('Merge failed: ' + err.message);
      }
    };
  }

  // setupSplitButton: ignore clicks if disabled (rest unchanged)
  setupSplitButton() {
    if (!this.splitBtn) return;
    this.splitBtn.onclick = (e) => {
      e.preventDefault();
      if (this.splitBtn.classList.contains('disabled')) return; // <—

      if (this.nft_selected === null) {
        alert('Please select an NFT to split.');
        return;
      }
      [this.mergeBtn, this.splitBtn, this.nextBtn].forEach((btn) => {
        if (btn) btn.style.display = 'none';
      });
      if (this.cancelSplitBtn) this.cancelSplitBtn.style.display = 'inline-block';
      if (this.confirmSplitBtn) this.confirmSplitBtn.style.display = 'inline-block';
      const nftItem = this.nft_list[this.nft_selected];
      const selectedRow = document.querySelector('.nft-card.nft-selected .nft-card-info');
      if (!selectedRow) return;
      this.showSplitOverlay(nftItem, selectedRow);
    };
  }

  // 4) setupCancelSplitButton: restore buttons visible, and toggle disabled instead of hide/show
  setupCancelSplitButton() {
    if (!this.cancelSplitBtn) return;
    this.cancelSplitBtn.onclick = (e) => {
      e.preventDefault();
      this.cancelSplitBtn.style.display = 'none';
      if (this.confirmSplitBtn) this.confirmSplitBtn.style.display = 'none';

      const nftItem = this.nft_list[this.nft_selected];
      const matchingCount = nftItem ? this.nft_list.filter((n) => n.id === nftItem.id).length : 0;

      if (this.mergeBtn) {
        this.mergeBtn.style.display = 'inline-block';
        this.mergeBtn.classList.toggle(
          'disabled',
          !(this.nft_selected !== null && matchingCount >= 2)
        );
      }
      if (this.splitBtn) {
        this.splitBtn.style.display = 'inline-block';
        this.splitBtn.classList.toggle(
          'disabled',
          !(this.nft_selected !== null && nftItem && nftItem.slip1.amount > 1)
        );
      }
      if (this.nextBtn) this.nextBtn.style.display = 'inline-block';

      const selectedRow = document.querySelector('.nft-card.nft-selected .nft-card-info');
      if (selectedRow) {
        const overlay = selectedRow.querySelector('.split-overlay');
        if (overlay) selectedRow.removeChild(overlay);
        selectedRow.click();
      }
    };
  }

  setupConfirmSplitButton() {
    let nft_self = this;
    if (!this.confirmSplitBtn) return;
    this.confirmSplitBtn.onclick = async (e) => {
      e.preventDefault();
      const nftCardElem = document.querySelector('.nft-card.nft-selected');

      const selectedRow = document.querySelector('.nft-card.nft-selected .nft-card-info');
      if (!selectedRow) return;
      const overlay = selectedRow.querySelector('.split-overlay');
      if (!overlay) return;
      const leftCount = parseInt(overlay.querySelector('.split-left').innerText, 10);
      const rightCount = parseInt(overlay.querySelector('.split-right').innerText, 10);

      const slip1UtxoKey = this.nft_list[this.nft_selected].slip1.utxo_key;
      const slip2UtxoKey = this.nft_list[this.nft_selected].slip2.utxo_key;
      const slip3UtxoKey = this.nft_list[this.nft_selected].slip3.utxo_key;

      let obj = {};
      if (this.nft_cards[slip1UtxoKey].image != '') {
        obj.image = this.nft_cards[slip1UtxoKey].image;
      }

      if (this.nft_cards[slip1UtxoKey].text != '') {
        obj.text = this.nft_cards[slip1UtxoKey].text;
      }

      let tx_msg = {
        data: obj,
        module: 'NFT',
        request: 'split nft'
      };

      let newtx = await this.app.wallet.splitNft(
        slip1UtxoKey,
        slip2UtxoKey,
        slip3UtxoKey,
        leftCount,
        rightCount,
        tx_msg
      );

      console.log('split tx:', newtx);

      salert(`Split NFT tx sent`);

      this.overlay.close();
    };
  }

  setupRowClicks() {
    document.querySelectorAll('.nft-card').forEach((row) => {
      row.onclick = (e) => {
        //console.log("clicked on .nft-card");
        if (this.cancelSplitBtn && this.cancelSplitBtn.style.display !== 'none') return;
        document.querySelectorAll('.nft-card').forEach((r) => {
          r.classList.remove('nft-selected');
          const rRadio = r.querySelector('input[type="radio"].hidden-nft-radio');
          if (rRadio) rRadio.checked = false;
        });
        row.classList.add('nft-selected');
        const hiddenRadio = row.querySelector('input[type="radio"].hidden-nft-radio');
        if (hiddenRadio) {
          hiddenRadio.checked = true;

          let slip1_utxokey = hiddenRadio.value;
          //console.log("slip1_utxokey: ", slip1_utxokey);

          this.nft_selected = this.getNftIndexFromUtxoKey(slip1_utxokey);
          //console.log("this.nft_selected: ", this.nft_selected);
        }
        this.updateNavAfterRowSelect();
      };
    });
  }

  getNftIndexFromUtxoKey(slip1_utxokey) {
    return this.nft_list.findIndex((nft) => nft.slip1.utxo_key === slip1_utxokey);
  }

  // updateNavAfterRowSelect: compute eligibility, then toggle disabled; ensure send enabled & visible
  updateNavAfterRowSelect() {
    const nftItem = this.nft_list[this.nft_selected];
    if (!nftItem) return;

    const matchingCount = this.nft_list.filter((n) => n.id === nftItem.id).length;

    if (this.mergeBtn) {
      this.mergeBtn.style.display = 'inline-block';
      this.mergeBtn.classList.toggle('disabled', !(matchingCount >= 2));
    }

    if (this.splitBtn) {
      this.splitBtn.style.display = 'inline-block';
      this.splitBtn.classList.toggle('disabled', !(nftItem.slip1.amount > 1));
    }

    if (this.nextBtn) {
      this.nextBtn.classList.remove('disabled');
      this.nextBtn.style.display = 'inline-block';
    }

    if (this.sendBtn) {
      this.sendBtn.style.display = 'inline-block';
      this.sendBtn.classList.remove('disabled'); // <— always enabled when a row is selected
    }

    if (this.cancelSplitBtn) this.cancelSplitBtn.style.display = 'none';
    if (this.confirmSplitBtn) this.confirmSplitBtn.style.display = 'none';
  }

  setupNextButton() {
    if (!this.nextBtn) return;
    this.nextBtn.onclick = (e) => {
      e.preventDefault();
      if (this.nextBtn.classList.contains('disabled')) return;
      const page1 = document.querySelector('#page1');
      const page2 = document.querySelector('#page2');
      if (page1 && page2) {
        page1.style.display = 'none';
        page2.style.display = 'flex';
        this.page1Nav.style.display = 'none';
        this.sendNftTitle.innerText = 'SEND NFT';
        this.page2Nav.style.display = 'flex';
      }
    };
  }

  //  setupBackButton: keep buttons shown but reset to disabled on return to page1
  setupBackButton() {
    if (!this.backBtn) return;
    this.backBtn.onclick = (e) => {
      e.preventDefault();
      const page1 = document.querySelector('#page1');
      const page2 = document.querySelector('#page2');

      if (page1 && page2) {
        page2.style.display = 'none';
        page1.style.display = 'block';
        this.page1Nav.style.display = 'flex';
        this.sendNftTitle.innerText = 'SELECT NFT';
        this.page2Nav.style.display = 'block';

        document.querySelectorAll('.send-nft-row').forEach((r) => {
          r.classList.remove('nft-selected');
          const rRadio = r.querySelector('input[type="radio"].hidden-nft-radio');
          if (rRadio) rRadio.checked = false;
        });

        this.nft_selected = null;

        [this.mergeBtn, this.splitBtn, this.sendBtn].forEach((btn) => {
          if (!btn) return;
          btn.style.display = 'inline-block';
          btn.classList.add('disabled');
        });

        if (this.nextBtn) {
          this.nextBtn.classList.add('disabled');
          this.nextBtn.style.display = 'none';
        }
      }
    };
  }

  setupSendButton() {
    if (!this.sendBtn) return;
    this.sendBtn.onclick = async (e) => {
      e.preventDefault();
      if (this.nft_selected === null) {
        alert('Please select an NFT first.');
        return;
      }

      const nftCardElem = document.querySelector('.nft-card.nft-selected');
      let nftCardIdx = nftCardElem ? parseInt(nftCardElem.getAttribute('nft-index'), 10) : null;

      const receiverInput = document.querySelector('#nfts-receiver');
      const receiver = receiverInput ? receiverInput.value.trim() : '';
      if (!receiver) {
        alert('Please enter the receiver’s public key.');
        return;
      }
      this.sendBtn.classList.add('disabled');
      this.sendBtn.innerText = 'Submitting...';
      try {
        const nftItem = this.nft_list[this.nft_selected];
        if (!nftItem) throw new Error('Selected NFT not found.');
        const slip1Key = nftItem.slip1.utxo_key;
        const slip2Key = nftItem.slip2.utxo_key;
        const slip3Key = nftItem.slip3.utxo_key;
        const amt = BigInt(1);

        const slip1UtxoKey = this.nft_list[this.nft_selected].slip1.utxo_key;
        let obj = {};
        if (this.nft_cards[slip1UtxoKey].image != '')
          obj.image = this.nft_cards[slip1UtxoKey].image;
        if (this.nft_cards[slip1UtxoKey].text != '') obj.text = this.nft_cards[slip1UtxoKey].text;

        let tx_msg = {
          data: obj,
          module: 'NFT',
          request: 'merge nft'
        };

        const newtx = await this.app.wallet.createSendBoundTransaction(
          amt,
          slip1Key,
          slip2Key,
          slip3Key,
          receiver,
          tx_msg
        );

        salert(`Send NFT tx sent`);

        this.overlay.close();
      } catch (err) {
        alert('Failed to send NFT: ' + err.message);
        this.sendBtn.classList.remove('disabled');
        this.sendBtn.innerText = 'Send NFT';
      }
    };
  }

  showSplitOverlay(nftItem, rowElement) {
    const totalAmount = parseInt(nftItem.slip1.amount, 10);
    const overlay = document.createElement('div');
    overlay.classList.add('split-overlay');
    Object.assign(overlay.style, {
      position: 'absolute',
      top: '0',
      left: '0',
      width: '100%',
      height: '100%',
      backgroundColor: 'var(--saito-background-color)',
      display: 'flex',
      zIndex: '10',
      padding: '1rem 0rem'
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

    // measure dimensions
    const rowRect = rowElement.getBoundingClientRect();
    const rowWidth = rowRect.width;
    // make sure this matches your CSS width
    const barWidth = parseInt(getComputedStyle(bar).width, 10);

    // initial split in half
    const halfWidth = (rowWidth - barWidth) / 2;
    leftDiv.style.width = `${halfWidth}px`;
    rightDiv.style.width = `${rowWidth - barWidth - halfWidth}px`;

    let leftCount = Math.round((halfWidth / rowWidth) * totalAmount);
    let rightCount = totalAmount - leftCount;
    leftDiv.innerText = leftCount;
    rightDiv.innerText = rightCount;

    // compute draggable bounds so that neither side can round to zero
    const minLeftW = (0.5 / totalAmount) * rowWidth;
    const maxLeftW = rowWidth - barWidth - minLeftW;

    const dragSplit = (e) => {
      const rect = rowElement.getBoundingClientRect();
      const x = e.clientX - rect.left;
      // raw new left width
      let newLeftW = x - barWidth / 2;

      // clamp so leftCount >= 1 and rightCount >= 1
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

  async fetchNFT() {
    await this.app.wallet.updateNftList();

    const data = this.app.options.wallet.nfts || [];

    //console.log('SEND-WALLET: nfts - ', data);
    return data;
  }
}

module.exports = SendNft;
