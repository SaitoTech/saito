let NFTDetailsOverlay = require('./../../../../lib/saito/ui/saito-nft/overlays/nft-overlay');

class BuyNFTOverlay extends NFTDetailsOverlay {
  constructor(app, mod) {
    super(app, mod, false);
  }

  render(nft = null) {
    super.render(nft);

    // Remove buttons (added below in AttachEvents)
    Array.from(document.querySelectorAll('.saito-nft-footer-btn')).forEach(
      (el) => (el.style.display = 'none')
    );
  }

  async attachEvents() {
    if (this.nft.metadata.active !== 1) {
      console.warn('NFT unavailable to purchase');
      return;
    }
    // Use Enable/Disable buttons for controls...
    let buy_with_saito_btn = document.querySelector('.saito-nft-footer-btn.enable-nft');
    let buy_with_other_btn = document.querySelector('.saito-nft-footer-btn.disable-nft');
    buy_with_saito_btn.innerHTML = 'Buy with Saito';
    buy_with_saito_btn.style.display = 'block';

    let priceRaw = BigInt(this.nft.getBuyPriceSaito()); // BigInt -- Saito
    let fee = BigInt(this.mod?.fee || 0);

    let total_price = this.app.wallet.convertSaitoToNolan(priceRaw + fee);
    let wallet_balance = await this.app.wallet.getBalance(); // BigInt - Nolan

    let insufficient_funds = wallet_balance < total_price;

    // I don't know why we would get this, but okay..
    if (total_price <= 0n) {
      alert('ERROR: price seems to be negative? Please report issue...');
      return;
    }

    //
    // BUY WITH SAITO
    //
    if (buy_with_saito_btn) {
      if (insufficient_funds) {
        buy_with_saito_btn.classList.add('disabled-btn');

        buy_with_saito_btn.onclick = (e) => {
          console.info('Wallet: ', wallet_balance, 'Price: ', total_price);
          salert('Insufficient SAITO in Wallet');
        };
      } else {
        buy_with_saito_btn.onclick = async (e) => {
          e.preventDefault();
          buy_with_saito_btn.onclick = null;
          this.overlay.hide();
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
        };
      }
    }

    //
    // BUY WITH OTHER CRYPTO
    //

    // Add RespondTo to see if we have a buy SAITO option
    // And emit an event!

    if (buy_with_other_btn) {
      buy_with_other_btn.innerHTML = 'More Options';
      buy_with_other_btn.style.display = 'block';

      buy_with_other_btn.onclick = async (e) => {
        e.preventDefault();
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
      };
    }
  }
}

module.exports = BuyNFTOverlay;
