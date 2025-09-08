const BaseSend = require('./../../../../lib/saito/ui/saito-nft/send-overlay');

class AuctionSendOverlay extends BaseSend {
  async render(nft) {
    await super.render(nft);
    this.hideMergeSplit();
    this.addListSection();
    this.addBuySection();
    this.attachEvents();
  }

  // Hide merge/split sections
  hideMergeSplit() {
    const overlays = document.querySelectorAll('.nft-details-container');
    this._overlayRoot = overlays.length ? overlays[overlays.length - 1] : document;
    this.mergeSplitCont = this._overlayRoot.querySelector('#nft-merge-split');
    this.mergeCont = this._overlayRoot.querySelector('#nft-details-merge');
    this.splitCont = this._overlayRoot.querySelector('#nft-details-split');
    this.mergeSplitCont && (this.mergeSplitCont.style.display = 'none');
    this.mergeCont && (this.mergeCont.style.display = 'none');
    this.splitCont && (this.splitCont.style.display = 'none');
  }

  // Prepare list/delist section (hide input, set title)
  addListSection() {
    const overlays = document.querySelectorAll('.nft-details-container');
    this._overlayRoot = overlays.length ? overlays[overlays.length - 1] : document;
    this.receiver_input = this._overlayRoot.querySelector('#nft-receiver-address');

    const header = this._overlayRoot?.querySelector('.nft-details-send h4');
    if (header) header.textContent = 'DELIST FROM ASSETSTORE 🧾';

    if (this.receiver_input) {
      if (this._syncBtnListener) {
        this.receiver_input.removeEventListener('input', this._syncBtnListener);
        this.receiver_input.removeEventListener('change', this._syncBtnListener);
      }
      const wrap = this.receiver_input.closest('.nft-receiver');
      if (wrap) wrap.style.display = 'none';
      this.receiver_input.value = '';
      this.receiver_input.setAttribute('disabled', 'disabled');
      this.receiver_input.style.display = 'none';
    }
  }

  // Clone send section as buy section
  addBuySection() {
    const overlays = document.querySelectorAll('.nft-details-container');
    const root = overlays.length ? overlays[overlays.length - 1] : document;
    const sendSection = root.querySelector('.nft-details-send');
    if (!sendSection || !sendSection.parentElement) return;

    const buy = sendSection.cloneNode(true);
    buy.classList.remove('nft-details-send');
    buy.classList.add('nft-details-buy');

    const inputWrap = buy.querySelector('.nft-receiver');
    if (inputWrap) inputWrap.remove();

    const h4 = buy.querySelector('h4');
    if (h4) h4.innerHTML = 'BUY ASSET <i>🛒</i>';

    const btn = buy.querySelector('#send_nft') || buy.querySelector('button');
    if (btn) {
      btn.id = 'buy_nft';
      btn.innerText = 'Buy';
      btn.classList.remove('disabled');
      btn.removeAttribute('disabled');
    }

    sendSection.parentElement.appendChild(buy);
    this.buyBtn = buy.querySelector('#buy_nft') || buy.querySelector('button');
  }

  async attachEvents() {
    await super.attachEvents();

    if (this.sendBtn) {
      this.sendBtn.classList.remove('disabled');
      this.sendBtn.removeAttribute('disabled');
      this.sendBtn.innerText = 'Delist';
      this.sendBtn.onclick = (e) => { 
        e?.preventDefault?.(); 
        salert("Delisting your asset from assetstore");
      };
    }

    if (!this.buyBtn) {
      const overlays = document.querySelectorAll('.nft-details-container');
      const root = overlays.length ? overlays[overlays.length - 1] : document;
      this.buyBtn = root.querySelector('#buy_nft') || root.querySelector('.nft-details-buy button');
    }
    if (this.buyBtn) {
      this.buyBtn.onclick = (e) => { 
        e?.preventDefault?.();
        salert("Buying feature coming soon....")
      };
    }
  }
}

module.exports = AuctionSendOverlay;
