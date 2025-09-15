const BaseSend = require('./../../../../lib/saito/ui/saito-nft/overlays/nft-overlay');

class AuctionSendOverlay /*extends BaseSend*/ {
  async render(nft) {
    await super.render(nft);

    const overlays = document.querySelectorAll('.nft-details-container');
    this._overlayRoot = overlays.length ? overlays[overlays.length - 1] : document;

    this.hideMergeSplit();
    this.addDelistSection();
    this.addBuySection();
    await this.attachEvents();

    this.applySellerToggle();
  }

  hideMergeSplit() {
    const root = this._overlayRoot || document;
    this.mergeSplitCont = root.querySelector('#nft-merge-split');
    this.mergeCont = root.querySelector('#nft-details-merge');
    this.splitCont = root.querySelector('#nft-details-split');
    if (this.mergeSplitCont) this.mergeSplitCont.style.display = 'none';
    if (this.mergeCont) this.mergeCont.style.display = 'none';
    if (this.splitCont) this.splitCont.style.display = 'none';
  }

  // Prepare list/delist section (hide input, set title)
  addDelistSection() {
    const root = this._overlayRoot || document;
    this.receiver_input = root.querySelector('#nft-receiver-address');

    const header = root.querySelector('.nft-details-send h4');
    if (header) header.textContent = 'DELIST FROM ASSETSTORE';

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
    const root = this._overlayRoot || document;
    const sendSection = root.querySelector('.nft-details-send');
    if (!sendSection || !sendSection.parentElement) return;

    const buy = sendSection.cloneNode(true);

    buy.querySelectorAll('[id]').forEach((el) => {
      if (el.id !== 'send_nft') el.removeAttribute('id');
    });

    buy.classList.remove('nft-details-send');
    buy.classList.add('nft-details-buy');

    // remove the receiver input area for buy
    const inputWrap = buy.querySelector('.nft-receiver');
    if (inputWrap) inputWrap.remove();

    const h4 = buy.querySelector('h4');
    if (h4) h4.innerHTML = 'BUY ASSET';

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
    if (this._eventsBound) return;
    this._eventsBound = true;

    await super.attachEvents();

    // Delist button (repurposed send button)
    if (this.sendBtn) {
      this.sendBtn.classList.remove('disabled');
      this.sendBtn.removeAttribute('disabled');
      this.sendBtn.innerText = 'Delist';
      this.sendBtn.onclick = async (e) => {
        e?.preventDefault?.();
        try {
          this.sendBtn.setAttribute('disabled', 'disabled');
          this.sendBtn.classList.add('disabled');

          const delistTx = await this.mod.createDelistAssetTransaction(this.nft);
          await this.app.network.propagateTransaction(delistTx);

          this.overlay?.close?.();
          salert('Delist request submitted. Awaiting network confirmation.');
        } catch (err) {
          console.error('Delist error:', err);
          salert('Delist failed. See console for details.');
        } finally {
          this.sendBtn?.removeAttribute?.('disabled');
          this.sendBtn?.classList?.remove?.('disabled');
        }
      };
    }

    if (!this.buyBtn) {
      const root = this._overlayRoot || document;
      this.buyBtn = root.querySelector('#buy_nft') || root.querySelector('.nft-details-buy button');
    }

    if (this.buyBtn) {
      this.buyBtn.onclick = async (e) => {
        e?.preventDefault?.();
        try {
          this.buyBtn.setAttribute('disabled', 'disabled');
          this.buyBtn.classList.add('disabled');

          const { price, fee, seller } = this.createBuyData();
          if (!this.mod?.createPurchaseAssetTransaction) {
            throw new Error('Module missing createPurchaseAssetTransaction');
          }

          const purchaseTx = await this.mod.createPurchaseAssetTransaction(this.nft, {
            price,
            fee,
            seller
          });
          await this.app.network.propagateTransaction(purchaseTx);

          this.overlay?.close?.();
          salert('Purchase submitted. You will receive the NFT once confirmed.');
        } catch (err) {
          console.error('Purchase error:', err);
          salert(err?.message || 'Purchase failed. See console for details.');
        } finally {
          this.buyBtn?.removeAttribute?.('disabled');
          this.buyBtn?.classList?.remove?.('disabled');
        }
      };
    }

    this.applySellerToggle();
  }

  // Show/hide Buy vs Delist based on seller === my pubkey
  applySellerToggle() {
    const root = this._overlayRoot || document;
    const buySection = root.querySelector('.nft-details-buy');
    const sendSection = root.querySelector('.nft-details-send');

    const showBuy = () => {
      if (buySection) buySection.style.display = '';
      if (this.buyBtn) this.buyBtn.style.display = '';
      if (sendSection) sendSection.style.display = 'none';
      if (this.sendBtn) this.sendBtn.style.display = 'none';
    };
    const showDelist = () => {
      if (sendSection) sendSection.style.display = '';
      if (this.sendBtn) this.sendBtn.style.display = '';
      if (buySection) buySection.style.display = 'none';
      if (this.buyBtn) this.buyBtn.style.display = 'none';
    };

    console.log('toggle delist: ', this.mod.publicKey);
    console.log('toggle delist: ', this);

    if (this.nft.seller == this.mod.publicKey) {
      showDelist();
    } else {
      showBuy();
    }
  }

  createBuyData() {
    const root = this._overlayRoot || document;
    const priceAttr =
      root?.dataset?.price ?? root?.dataset?.priceAtoms ?? root?.dataset?.amountAtoms;
    const feeAttr = root?.dataset?.fee ?? root?.dataset?.feeAtoms;
    const sellerAttr = root?.dataset?.seller;

    // Prefer data-amount attribute for atom price; fallback to text
    const priceNode = root.querySelector('[data-amount]') || root.querySelector('.nft-price');
    const priceText = priceNode
      ? priceNode.getAttribute?.('data-amount') || priceNode.textContent
      : 1;

    const nftPrice =
      this.nft?.priceAtoms ?? this.nft?.price ?? this.nft?.buy_now ?? this.nft?.buyNowPrice ?? null;

    const seller = sellerAttr || this.nft?.seller || this.nft?.owner || this.nft?.slip1?.public_key;
    if (!seller) throw new Error('Missing seller public key');

    const price = this.toBigInt(priceAttr ?? nftPrice ?? 0) || this.toBigInt(priceText ?? 0);
    const fee = this.toBigInt(feeAttr ?? this.mod?.purchaseFee ?? 0);

    if (price <= 0n) throw new Error('Invalid or missing price');

    return { price, fee, seller };
  }

  toBigInt(v) {
    if (typeof v === 'bigint') return v;
    if (typeof v === 'number') return BigInt(Math.trunc(v));
    if (typeof v === 'string') {
      const s = v.trim();
      if (!s) return 0n;
      if (/^-?\d+$/.test(s)) return BigInt(s);
      const cleaned = s.replace(/,/g, '');
      if (/^-?\d+$/.test(cleaned)) return BigInt(cleaned);
      return 0n;
    }
    return 0n;
  }
}

module.exports = AuctionSendOverlay;
