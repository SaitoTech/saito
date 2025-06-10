const NftTemplate  = require('./send-nft.template');
const SaitoOverlay = require('./../saito-overlay/saito-overlay');
const SaitoUser    = require('./../saito-user/saito-user');

class Nft {
  constructor(app, mod) {
    this.app          = app;
    this.mod          = mod;
    this.overlay      = new SaitoOverlay(this.app, this.mod);
    this.nft_selected = null;
    this.nft_list     = [];
    this.app.connection.on('saito-send-nft-render-request', () => this.render());
  }

  async render() {
    this.overlay.show(NftTemplate(this.app, this.mod));
    await this.updateBalance();
    await this.renderNftList();
    setTimeout(() => this.attachEvents(), 0);
  }

  async updateBalance() {
    const balanceStr = await this.mod.getBalanceString();
    const balEl = document.querySelector('.slip-info .metric.balance h3 .metric-amount');
    if (balEl) balEl.innerHTML = balanceStr;
  }

  async renderNftList() {
    this.nft_list = await this.fetchNFT();
    let html = '<div class="send-nft-list">';
    if (!Array.isArray(this.nft_list) || this.nft_list.length === 0) {
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
      let idx = 0;
      for (const nft of this.nft_list) {
        const slip1        = nft.slip1;
        const slip2        = nft.slip2;
        const amount       = BigInt(slip1.amount);
        const depositNolan = BigInt(slip2.amount);
        const nftValue     = this.app.wallet.convertNolanToSaito(depositNolan);
        const nftCreator   = slip1.public_key;
        const identicon    = this.app.keychain.returnIdenticon(nft.id);
        html += `
          <div class="send-nft-row" nft-index="${idx}">
            <input
              type="radio"
              name="hidden-nft-radio"
              class="hidden-nft-radio"
              value="${idx}"
              style="display: none;"
            />
            <img class="nft-identicon" src="${identicon}" />
            <div class="send-nft-row-right">
              <div class="send-nft-id">${nft.id}</div>
              <div class="send-nft-details">
                <div class="send-nft-left-row">
                  <div class="send-nft-amount">
                    <span>amount:</span>
                    <span>${amount}</span>
                  </div>
                  <div class="send-nft-deposit">
                    <span>deposit:</span>
                    <span>${nftValue} SAITO</span>
                  </div>
                </div>
                <div class="send-nft-right-row">
                  <div class="send-nft-create-by saito-user-${nftCreator}-${idx}"></div>
                </div>
              </div>
            </div>
          </div>
        `;
        idx += 1;
      }
    }
    html += '</div>';
    const container = document.querySelector('#nft-list');
    if (container) container.innerHTML = html;
    document.querySelectorAll('.send-nft-row').forEach((row, i) => {
      const nft = this.nft_list[i];
      if (!nft || !nft.slip1) return;
      const slip1        = nft.slip1;
      const nftCreator   = slip1.public_key;
      const placeholder  = `.saito-user-${nftCreator}-${i}`;
      const su = new SaitoUser(this.app, this.mod, placeholder, nftCreator);
      su.render();
      su.updateUserline(nftCreator);
    });
  }

  attachEvents() {
    this.createLink      = document.querySelector('#nft-link');
    this.nextBtn         = document.querySelector('#nft-next');
    this.mergeBtn        = document.querySelector('#send-nft-merge');
    this.splitBtn        = document.querySelector('#send-nft-split');
    this.cancelSplitBtn  = document.querySelector('#send-nft-cancel-split');
    this.confirmSplitBtn = document.querySelector('#send-nft-confirm-split');
    this.page1Nav    = document.querySelector('.page-navigation.page1');
    this.page2Nav    = document.querySelector('.page-navigation.page2');
    this.sendNftTitle    = document.querySelector('#send-nft-title');
    this.backBtn         = document.querySelector('#nft-back');
    this.sendBtn         = document.querySelector('#send_nft');

    this.initializeNavButtons();
    this.setupCreateLink();
    this.setupMergeButton();
    this.setupSplitButton();
    this.setupCancelSplitButton();
    this.setupConfirmSplitButton();
    this.setupRowClicks();
    this.setupNextButton();
    this.setupBackButton();
    this.setupSendButton();
  }

  initializeNavButtons() {
    if (this.nextBtn) this.nextBtn.classList.add('disabled');
    [this.mergeBtn, this.splitBtn, this.cancelSplitBtn, this.confirmSplitBtn].forEach(btn => {
      if (btn) btn.style.display = 'none';
    });
  }

  setupCreateLink() {
    if (!this.createLink) return;
    this.createLink.onclick = e => {
      e.preventDefault();
      this.overlay.close();
      this.app.connection.emit('saito-create-nft-render-request', {});
    };
  }

  setupMergeButton() {
      if (!this.mergeBtn) return;

      this.mergeBtn.onclick = async e => {
        e.preventDefault();

        // Ensure an NFT is selected
        if (this.nft_selected === null) {
          alert('Please select an NFT to merge.');
          return;
        }

        // Grab the NFT ID from the selected entry in nft_list
        const nftItem = this.nft_list[this.nft_selected];
        if (!nftItem || !nftItem.id) {
          alert('Unable to find selected NFT.');
          return;
        }
        const nftId = nftItem.id;

        // Prompt for confirmation
        const confirmMerge = confirm(`Merge all nfts with id: ${nftId}?`);
        if (!confirmMerge) {
          return;
        }

        try {
          // Build the merge transaction
          const mergeTx = await this.app.wallet.mergeNft(nftId);

          // Sign and broadcast
          await mergeTx.sign();
          await this.app.network.propagateTransaction(mergeTx);

          // Wait a moment, then refresh local NFT list
          setTimeout(async () => {
            try {
              const rawList = await this.app.wallet.getNftList();
              const parsed  = JSON.parse(rawList);
              await this.app.wallet.saveNftList(parsed);
              alert('NFT merge completed successfully!');
            } catch {
              alert('NFT was merged, but failed to refresh local list.');
            }
          }, 2000);

          // Close the overlay
          this.overlay.close();

        } catch (err) {
          alert('Merge failed: ' + err.message);
        }
      };
    }



  setupSplitButton() {
    if (!this.splitBtn) return;
    this.splitBtn.onclick = e => {
      e.preventDefault();
      if (this.nft_selected === null) {
        alert('Please select an NFT to split.');
        return;
      }
      [this.mergeBtn, this.splitBtn, this.nextBtn].forEach(btn => {
        if (btn) btn.style.display = 'none';
      });
      if (this.cancelSplitBtn)  this.cancelSplitBtn.style.display = 'inline-block';
      if (this.confirmSplitBtn) this.confirmSplitBtn.style.display = 'inline-block';
      const nftItem     = this.nft_list[this.nft_selected];
      const selectedRow = document.querySelector('.send-nft-row.nft-selected');
      if (!selectedRow) return;
      this.showSplitOverlay(nftItem, selectedRow);
    };
  }

  setupCancelSplitButton() {
    if (!this.cancelSplitBtn) return;
    this.cancelSplitBtn.onclick = e => {
      e.preventDefault();
      this.cancelSplitBtn.style.display  = 'none';
      this.confirmSplitBtn.style.display = 'none';
      const nftItem      = this.nft_list[this.nft_selected];
      const matchingCount = this.nft_list.filter(n => n.id === nftItem.id).length;
      if (this.mergeBtn) this.mergeBtn.style.display = (matchingCount >= 2) ? 'inline-block' : 'none';
      if (this.splitBtn) this.splitBtn.style.display = (nftItem.slip1.amount > 1) ? 'inline-block' : 'none';
      if (this.nextBtn)  this.nextBtn.style.display  = 'inline-block';
      const selectedRow = document.querySelector('.send-nft-row.nft-selected');
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
      const selectedRow = document.querySelector('.send-nft-row.nft-selected');
      if (!selectedRow) return;
      const overlay = selectedRow.querySelector('.split-overlay');
      if (!overlay) return;
      const leftCount = parseInt(overlay.querySelector('.split-left').innerText, 10);
      const rightCount = parseInt(overlay.querySelector('.split-right').innerText, 10);
      const nftId = nft_self.nft_list[nft_self.nft_selected].id;
      let newtx = await nft_self.app.wallet.splitNft(nftId, leftCount, rightCount);
    
      await newtx.sign();
      await nft_self.app.network.propagateTransaction(newtx);
      console.log("split tx:", newtx);

        setTimeout(async function(){
            let nft_list = await nft_self.app.wallet.getNftList();            
            console.log("Fetched NFT list: ", nft_list);

            const nftArray    = JSON.parse(nft_list); 
            await nft_self.app.wallet.saveNftList(nftArray);

            console.log("Updated wallet nft list: ", nft_self.app.options.wallet.nft);

            salert("NFT split successfully!");
        }, 2000);

        nft_self.overlay.close();
    };
  }

  setupRowClicks() {
    document.querySelectorAll('.send-nft-row').forEach(row => {
      row.onclick = e => {
        if (this.cancelSplitBtn && this.cancelSplitBtn.style.display !== 'none') return;
        document.querySelectorAll('.send-nft-row').forEach(r => {
          r.classList.remove('nft-selected');
          const rRadio = r.querySelector('input[type="radio"].hidden-nft-radio');
          if (rRadio) rRadio.checked = false;
        });
        row.classList.add('nft-selected');
        const hiddenRadio = row.querySelector('input[type="radio"].hidden-nft-radio');
        if (hiddenRadio) {
          hiddenRadio.checked = true;
          this.nft_selected = parseInt(hiddenRadio.value);
        }
        this.updateNavAfterRowSelect();
      };
    });
  }

  updateNavAfterRowSelect() {
    const nftItem = this.nft_list[this.nft_selected];
    if (!nftItem) return;
    const matchingCount = this.nft_list.filter(n => n.id === nftItem.id).length;
    if (this.mergeBtn) this.mergeBtn.style.display = (matchingCount >= 2) ? 'inline-block' : 'none';
    if (this.splitBtn) this.splitBtn.style.display = (nftItem.slip1.amount > 1) ? 'inline-block' : 'none';
    if (this.nextBtn) {
      this.nextBtn.classList.remove('disabled');
      this.nextBtn.style.display = 'inline-block';
    }
    if (this.cancelSplitBtn)  this.cancelSplitBtn.style.display = 'none';
    if (this.confirmSplitBtn) this.confirmSplitBtn.style.display = 'none';
  }

  setupNextButton() {
    if (!this.nextBtn) return;
    this.nextBtn.onclick = e => {
      e.preventDefault();
      if (this.nextBtn.classList.contains('disabled')) return;
      const page1 = document.querySelector('#page1');
      const page2 = document.querySelector('#page2');
      if (page1 && page2) {
        page1.style.display         = 'none';
        page2.style.display         = 'flex';
        this.page1Nav.style.display = 'none';
        this.sendNftTitle.innerText = 'SEND NFT';
        this.page2Nav.style.display = 'flex';
      }
    };
  }

  setupBackButton() {
    if (!this.backBtn) return;
    this.backBtn.onclick = e => {
      e.preventDefault();
      const page1 = document.querySelector('#page1');
      const page2 = document.querySelector('#page2');
      
      if (page1 && page2) {
        page2.style.display         = 'none';
        page1.style.display         = 'block';
        this.page1Nav.style.display = 'flex';
        this.sendNftTitle.innerText = 'SELECT NFT';
        this.page2Nav.style.display = 'block';

        document.querySelectorAll('.send-nft-row').forEach(r => {
          r.classList.remove('nft-selected');
          const rRadio = r.querySelector('input[type="radio"].hidden-nft-radio');
          if (rRadio) rRadio.checked = false;
        });

        this.nft_selected = null;
        if (this.mergeBtn) this.mergeBtn.style.display = 'none';
        if (this.splitBtn) this.splitBtn.style.display = 'none';
        if (this.nextBtn)  this.nextBtn.classList.add('disabled');
      }
    };
  }

  setupSendButton() {
    if (!this.sendBtn) return;
    this.sendBtn.onclick = async e => {
      e.preventDefault();
      if (this.nft_selected === null) {
        alert('Please select an NFT first.');
        return;
      }
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
        const amt      = BigInt(1);
        const payload  = JSON.stringify({ image: '' });
        const newtx = await this.app.wallet.createSendBoundTransaction(
          amt, slip1Key, slip2Key, slip3Key, payload, receiver
        );
        await newtx.sign();
        await this.app.network.propagateTransaction(newtx);
        setTimeout(async () => {
          try {
            const rawList = await this.app.wallet.getNftList();
            const parsed  = JSON.parse(rawList);
            await this.app.wallet.saveNftList(parsed);
            alert('NFT sent successfully!');
          } catch {
            alert('NFT was sent, but failed to refresh local list.');
          }
        }, 2000);
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
      backgroundColor: 'rgba(0,0,0,0.85)',
      display: 'flex',
      zIndex: '10'
    });

    const leftDiv = document.createElement('div');
    leftDiv.classList.add('split-left');
    Object.assign(leftDiv.style, {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
      fontSize: '2.2rem'
    });

    const bar = document.createElement('div');
    bar.classList.add('split-bar');
    Object.assign(bar.style, {
      width: '2px',
      backgroundColor: 'silver',
      cursor: 'col-resize',
      position: 'relative'
    });
    bar.innerHTML = `<div class="resize-icon horizontal"></div>`;

    const dragIcon = bar.querySelector('.resize-icon.horizontal');
    Object.assign(dragIcon.style, {
      position: 'absolute',
      left: '50%',
      top: '50%',
      transform: 'translate(-50%,-50%)',
      pointerEvents: 'none'
    });

    const rightDiv = document.createElement('div');
    rightDiv.classList.add('split-right');
    Object.assign(rightDiv.style, {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
      fontSize: '2.2rem'
    });

    overlay.append(leftDiv, bar, rightDiv);
    rowElement.appendChild(overlay);

    // measure dimensions
    const rowRect  = rowElement.getBoundingClientRect();
    const rowWidth = rowRect.width;
    // make sure this matches your CSS width
    const barWidth = parseInt(getComputedStyle(bar).width, 10);

    // initial split in half
    const halfWidth = (rowWidth - barWidth) / 2;
    leftDiv.style.width  = `${halfWidth}px`;
    rightDiv.style.width = `${rowWidth - barWidth - halfWidth}px`;

    let leftCount  = Math.round((halfWidth / rowWidth) * totalAmount);
    let rightCount = totalAmount - leftCount;
    leftDiv .innerText = leftCount;
    rightDiv.innerText = rightCount;

    // compute draggable bounds so that neither side can round to zero
    const minLeftW = (0.5 / totalAmount) * rowWidth;
    const maxLeftW = rowWidth - barWidth - minLeftW;

    const dragSplit = e => {
      const rect = rowElement.getBoundingClientRect();
      const x = e.clientX - rect.left;
      // raw new left width
      let newLeftW = x - barWidth / 2;

      // clamp so leftCount >= 1 and rightCount >= 1
      newLeftW = Math.max(minLeftW, Math.min(newLeftW, maxLeftW));

      leftDiv.style.width  = `${newLeftW}px`;
      const newRightW = rect.width - barWidth - newLeftW;
      rightDiv.style.width = `${newRightW}px`;

      leftCount  = Math.round((newLeftW / rect.width) * totalAmount);
      rightCount = totalAmount - leftCount;
      leftDiv .innerText = leftCount;
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
    const data = this.app.options.wallet.nfts || [];
    return data;
  }
}

module.exports = Nft;
