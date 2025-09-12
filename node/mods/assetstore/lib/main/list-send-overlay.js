const BaseSend = require('./../../../../lib/saito/ui/saito-nft/send-overlay');

class ListSendOverlay extends BaseSend {
  async render(nft) {
    await super.render(nft);
    await this.attachEvents();
  }

  async attachEvents() {
    await super.attachEvents();

    this.mergeSplitCont && (this.mergeSplitCont.style.display = 'none');
    this.mergeCont && (this.mergeCont.style.display = 'none');
    this.splitCont && (this.splitCont.style.display = 'none');

    const header = this._overlayRoot?.querySelector('.nft-details-send h4');
    if (header) header.textContent = 'LIST ON ASSETSTORE🧾';

    if (this.receiver_input) {
      this.receiver_input.placeholder = 'Assetstore public key';
      this._addBuyPriceInputBelow(this.receiver_input);
    } else {
      const sendSection = this._overlayRoot?.querySelector('.nft-details-send');
      if (sendSection) this._addBuyPriceInputBelow(sendSection);
    }

    if (this.sendBtn) {
      this.sendBtn.innerText = 'List';
      this.sendBtn.classList.remove('disabled');
      this.sendBtn.removeAttribute('disabled');

      this.sendBtn.onclick = async (e) => {
        e.preventDefault();

        const receiver = (this.receiver_input?.value || '').trim();
        const pc = this.app.wallet.returnPreferredCrypto?.();

        if (pc?.validateAddress && !pc.validateAddress(receiver)) {
          salert('Node public key is not valid');
          return;
        }

        const buyPriceStr = (this.buyPriceInput?.value || '').trim();
        const MIN = 0.00000001;
        const MAX = 100000000;

        if (!buyPriceStr) {
          salert('Please enter a Buy price (SAITO).');
          return;
        }
        if (!/^\d+(\.\d+)?$/.test(buyPriceStr)) {
          salert('Buy price must be a decimal number.');
          return;
        }

        const buyPriceNum = Number(buyPriceStr);
        if (!Number.isFinite(buyPriceNum)) {
          salert('Invalid Buy price.');
          return;
        }
        if (buyPriceNum < MIN || buyPriceNum > MAX) {
          salert(`Buy price must be between ${MIN} and ${MAX} SAITO.`);
          return;
        }

        const prev = this.sendBtn.innerText;
        this.sendBtn.classList.add('disabled');
        this.sendBtn.setAttribute('disabled', 'disabled');
        this.sendBtn.innerText = 'Submitting...';

        try {
          const listTx = await this.mod.createListAssetTransaction(this.nft, receiver);
          await this.app.network.propagateTransaction(listTx);

          this.overlay.close();
          this.app.connection.emit('assetstore-close-list-overlay-request');

          salert('Listing submitted. Awaiting network confirmation.');
        } catch (err) {
          salert('Failed to list: ' + (err?.message || err));
        } finally {
          this.sendBtn.classList.remove('disabled');
          this.sendBtn.removeAttribute('disabled');
          this.sendBtn.innerText = prev;
        }
      };
    }
  }

  _addBuyPriceInputBelow(anchorEl) {
    if (this._buyPriceAdded) return;
    this._buyPriceAdded = true;

    const wrap = document.createElement('div');
    wrap.className = 'nft-buy-price';
    wrap.style.marginTop = '8px';

    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'Buy price (SAITO)';
    input.id = 'nft-buy-price';
    input.autocomplete = 'off';
    input.inputMode = 'decimal';
    input.pattern = '^[0-9]+(\\.[0-9]{1,8})?$';
    input.title = 'Enter a decimal amount up to 8 decimals (min 0.00000001, max 100000000)';
    input.style.width = '100%';
    input.style.boxSizing = 'border-box';

    input.addEventListener('input', () => {
      let v = input.value;
      v = v.replace(/[^\d.]/g, '');
      const firstDot = v.indexOf('.');
      if (firstDot !== -1) {
        const before = v.slice(0, firstDot + 1);
        const after = v.slice(firstDot + 1).replace(/\./g, '');
        v = before + after;
      }
      if (v.startsWith('.')) v = '0' + v;
      if (v.includes('.')) {
        const [w, f] = v.split('.');
        v = w + '.' + f.slice(0, 8);
      }
      const num = Number(v);
      if (Number.isFinite(num) && num > 100000000) {
        v = '100000000';
      }
      input.value = v;
    });

    input.addEventListener('blur', () => {
      const MIN = 0.00000001;
      const v = input.value.trim();
      if (!v) return;
      const num = Number(v);
      if (Number.isFinite(num) && num > 0 && num < MIN) {
        input.value = MIN.toFixed(8).replace(/0+$/, '');
      }
    });

    wrap.appendChild(input);

    if (anchorEl && anchorEl.parentNode) {
      anchorEl.parentNode.insertBefore(wrap, anchorEl.nextSibling);
    } else {
      const sendSection = this._overlayRoot?.querySelector('.nft-details-send');
      (sendSection || document.body).appendChild(wrap);
    }

    this.buyPriceInput = input;
  }
}

module.exports = ListSendOverlay;
