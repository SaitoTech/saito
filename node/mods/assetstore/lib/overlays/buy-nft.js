let NftDetailsOverlay = require('./../../../../lib/saito/ui/saito-nft/overlays/nft-overlay');
let DepositOverlay = require('./deposit');

class BuyNftOverlay extends NftDetailsOverlay {
  constructor(app, mod) {
    super(app, mod, false);
    this.deposit = new DepositOverlay(app, mod);
  }

  async render() {
    await super.render();

    let root = this._overlayRoot || document;
    let mount = root.getElementById ? root : document;

    let container = mount.getElementById('nft-details-send');
    if (!container) return;

    let priceRaw = await this.nft.getBuyPriceSaito?.();
    let price = typeof priceRaw === 'bigint' ? priceRaw.toString() : (priceRaw ?? '');

    container.innerHTML = `
      <div class="nft-details-action" id="nft-details-action">
        <div class="nft-details-buy" style="display:none">
          <div class="nft-buy-row">
            <div class="nft-details-confirm-msg">
              Confirm buy this asset for <span id="nft-buy-price"></span> SAITO?
            </div>
          </div>
          <div class="saito-button-row auto-fit">
            <button id="cancel" class="saito-button-secondary cancel-action">Close</button>
            <button id="confirm_buy" class="saito-button-primary">Buy Now</button>
          </div>
        </div>
      </div>
    `;

    let priceNode = mount.getElementById('nft-buy-price');
    if (priceNode) priceNode.textContent = `${price}`;

    let send_btn_label = mount.getElementById('send');
    if (send_btn_label) send_btn_label.textContent = 'Buy';

    let cancel = mount.getElementById('cancel');
    if (cancel) cancel.onclick = () => { this.overlay?.close?.(); };

    let buyBtn = mount.getElementById('confirm_buy');
    if (buyBtn) {
      buyBtn.onclick = async (e) => {
        e.preventDefault();
        buyBtn.disabled = true;
        try {
          let newtx = await this.mod.createPurchaseAssetTransaction(this.nft);
          await this.app.network.propagateTransaction(newtx);
          this.overlay?.hide?.();
          siteMessage('Purchase submitted. Waiting for network confirmation...', 3000);
        } catch (err) {
          salert('Failed to buy: ' + err);
          buyBtn.disabled = false;
        }
      };
    }

    if (send_btn_label && !mount.getElementById('send_other_crypto')) {
      let altBtn = document.createElement('button');
      altBtn.id = 'send_other_crypto';
      altBtn.className = send_btn_label.className || 'saito-button-secondary';
      altBtn.textContent = 'Buy with other crypto';
      altBtn.type = 'button';
      altBtn.setAttribute('aria-label', 'Buy with other crypto');
      send_btn_label.insertAdjacentElement('afterend', altBtn);

      altBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        altBtn.disabled = true;
        try {
          // fetch mixin mod
          let mixin = null;
          for (let i = 0; i < this.app.modules.mods.length; i++) {
            if (this.app.modules.mods[i].slug === 'mixin') {
              mixin = this.app.modules.mods[i];
            }
          }

          let ticker = 'TRX';
          let asset_id = '25dabac5-056a-48ff-b9f9-f67395dc407c';
          let chain_id = '25dabac5-056a-48ff-b9f9-f67395dc407c';
          let address = '';

          if (!mixin) {
            console.log('Mixin mod not active.');
            return;
          }

          siteMessage('Creating deposit address...please wait.', 3000);

          if (mixin.account_created === 0) {
            console.log('Create mixin account');
            await mixin.createAccount((res) => {
              if (res.err || Object.keys(res).length < 1) {
                if (this.app.BROWSER) salert('Having problem creating mixin account ');
              }
            });
          }

          console.log(`create deposit address for ${ticker}`);
          address = await this.createDepositAddress(mixin, asset_id, chain_id, ticker);

          console.log('address:', address);
          console.log('this.nft: ', this.nft);

          // hardcoded price & conversion
          let saito = 0.00213;
          let trx = 0.3124;
          let nft_price = this.nft.getBuyPriceSaito();

          let converted_amount = (nft_price * saito) / trx;

          console.log('converted_amount: ', converted_amount);

          this.deposit.ticker = ticker;
          this.deposit.address = address.destination;
          this.deposit.amount = converted_amount;
          this.deposit.render();

          return;
        } catch (err) {
          salert('Could not start alternative purchase: ' + err);
        } finally {
          altBtn.disabled = false;
        }
      });
    }

    this.showBuy();
  }

  async createDepositAddress(mixin, asset_id, chain_id, ticker) {
    let deposit = await mixin.createDepositAddress(asset_id, chain_id, false);
    if (!deposit) {
      if (this.app.BROWSER) {
        salert('Having problem generating key for ' + ' ' + ticker);
      }
      return null;
    }
    return deposit[0];
  }

  showBuy() {
    let root = this._overlayRoot || document;
    let buySection = root.querySelector('.nft-details-buy');
    let delistSection = root.querySelector('.nft-details-delist');
    let sendSection = root.querySelector('.nft-details-send-section');

    if (buySection) buySection.style.display = '';
    if (delistSection) delistSection.style.display = 'none';
    if (sendSection) sendSection.style.display = 'none';

    let headerBtn = root.getElementById
      ? root.getElementById('send')
      : document.getElementById('send');
    if (headerBtn) headerBtn.textContent = 'Buy';
  }
}

module.exports = BuyNftOverlay;
