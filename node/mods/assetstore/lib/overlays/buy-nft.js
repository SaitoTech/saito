let NFTDetailsOverlay = require('./../../../../lib/saito/ui/saito-nft/overlays/nft-overlay');

class BuyNFTOverlay extends NFTDetailsOverlay {
  constructor(app, mod) {
    super(app, mod, false);
  }

  render(nft = null) {
    super.render(nft);

    Array.from(document.querySelectorAll('.saito-nft-panel-view .saito-nft-capability')).forEach(
      (el) => (el.style.display = 'none')
    );
  }

  async attachEvents() {
    await super.attachEvents();

    if (this.nft.metadata.active !== 1) {
      console.warn('NFT unavailable to purchase');
      return;
    }
    // Use Enable capability as Buy control
    let buy_with_saito_btn = document.querySelector('.saito-nft-capability.enable-nft');
    if (!buy_with_saito_btn) {
      // Synthesize a buy control if enable isn't in the capability list for this NFT
      const toolbar = document.querySelector('.saito-nft-capabilities');
      if (toolbar) {
        toolbar.insertAdjacentHTML(
          'beforeend',
          `<button type="button" class="saito-nft-capability saito-large-square-button saito-glass enable-nft" data-capability="buy" data-description="Purchase this NFT with SAITO." aria-label="Buy" aria-pressed="false"><span class="saito-icon-button"><i class="fa-solid fa-cart-shopping" aria-hidden="true"></i></span><span class="saito-nft-capability-label">Buy</span></button>`
        );
        buy_with_saito_btn = document.querySelector('.saito-nft-capability.enable-nft');
      }
    }
    if (!buy_with_saito_btn) {
      return;
    }

    buy_with_saito_btn.style.display = 'inline-flex';
    buy_with_saito_btn.setAttribute('aria-label', 'Buy');
    buy_with_saito_btn.setAttribute('data-description', 'Purchase this NFT with SAITO.');
    buy_with_saito_btn.innerHTML = `<span class="saito-icon-button"><i class="fa-solid fa-cart-shopping" aria-hidden="true"></i></span><span class="saito-nft-capability-label">Buy</span>`;

    let priceRaw = BigInt(this.nft.getBuyPriceSaito()); // BigInt -- Saito
    let fee = BigInt(this.mod?.fee || 0);

    let total_price = this.app.wallet.convertSaitoToNolan(priceRaw + fee);

    // I don't know why we would get this, but okay..
    if (total_price <= 0n) {
      alert('ERROR: price seems to be negative? Please report issue...');
      return;
    }

    //
    // BUY WITH SAITO
    //
    if (buy_with_saito_btn) {
      buy_with_saito_btn.onclick = async (e) => {
        e.preventDefault();
        buy_with_saito_btn.onclick = null;
        this.overlay.hide();

        let wallet_balance = await this.app.wallet.getBalance(); // BigInt - Nolan
        let insufficient_funds = wallet_balance < total_price;

        console.log('Click buy: ', wallet_balance, total_price);

        if (insufficient_funds) {
          let newtx = await this.mod.createPurchaseAssetTransaction(
            this.nft,
            { price: priceRaw, fee },
            0n
          );

          this.app.connection.emit(
            'saito-purchase-launch',
            this.app.wallet.convertNolanToSaito(total_price),
            this.mod.assetStore.publicKey,
            newtx.serialize_to_web(this.app),
            `Purchase ${this.app.wallet.convertNolanToSaito(total_price)} Saito NFT`
          );
        } else {
          try {
            let newtx = await this.mod.createPurchaseAssetTransaction(
              this.nft,
              { price: priceRaw, fee },
              total_price
            );
            await this.app.network.propagateTransaction(newtx);
            siteMessage('Purchase submitted, waiting for confirmation...', 3000);
          } catch (err) {
            console.error('Error submitting bid: ' + err);
            siteMessage('Purchase submission failed...', 3000);
          }
        }
      };
    }
  }
}

module.exports = BuyNFTOverlay;
