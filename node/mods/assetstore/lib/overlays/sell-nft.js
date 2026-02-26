let NFTDetailsOverlay = require('./../../../../lib/saito/ui/saito-nft/overlays/nft-overlay');

class SellNFTOverlay extends NFTDetailsOverlay {
  constructor(app, mod) {
    super(app, mod, false);
  }

  render(nft) {
    super.render(nft); // Will call attachEvents

    Array.from(document.querySelectorAll('.saito-nft-footer-btn')).forEach(
      (el) => (el.style.display = 'none')
    );

    if (document.querySelector('.saito-nft-footer-btn.send-nft')) {
      document.querySelector('.saito-nft-footer-btn.send-nft').innerHTML = 'Confirm and List';
      document.querySelector('.saito-nft-footer-btn.send-nft').style.display = 'flex';
    }

    let html = `
      <div class="saito-nft-description">
          <div class="assetstore-nft-listing-inputs-price">
            <input type="text" placeholder="sale price (SAITO)" id="nft-buy-price" autocomplete="off" inputmode="decimal" pattern="^[0-9]+(\.[0-9]{1,8})?$" title="Enter a decimal amount up to 8 decimals (min 0.00000001, max 100000000)" style="width: 100%; box-sizing: border-box;" />
          </div>
    <textarea id="nft-buy-description" autocomplete="off" title="" style="height:80px; width: 100%; box-sizing: border-box;" placeholder="${this.nft.description || 'description (optional)'}"></textarea>
      </div>
    `;

    if (!document.querySelector('.saito-nft-description')) {
      this.app.browser.addElementToSelector(html, '.saito-nft-panel-body');
    } else {
      document.querySelector('.saito-nft-description').innerHTML = html;
    }
  }

  attachEvents() {
    let input = document.querySelector('#nft-buy-price');
    const MIN = 0.00000001;
    const MAX = 100000000;

    input.addEventListener('input', () => {
      let v = input.value;
      v = v.replace(/[^\d.]/g, '');
      let firstDot = v.indexOf('.');
      if (firstDot !== -1) {
        let before = v.slice(0, firstDot + 1);
        let after = v.slice(firstDot + 1).replace(/\./g, '');
        v = before + after;
      }
      if (v.startsWith('.')) v = '0' + v;
      if (v.includes('.')) {
        let [w, f] = v.split('.');
        v = w + '.' + f.slice(0, 8);
      }
      let num = Number(v);
      if (Number.isFinite(num) && num > MAX) {
        v = '100000000';
      }
      input.value = v;
    });

    input.addEventListener('blur', () => {
      let v = input.value.trim();
      if (!v) return;
      let num = Number(v);
      if (Number.isFinite(num) && num > 0 && num < MIN) {
        input.value = MIN.toFixed(8).replace(/0+$/, '');
      }
    });

    //
    // send button click
    //
    let send_btn = document.querySelector('.saito-nft-footer-btn.send-nft');
    send_btn.onclick = (e) => {
      e.preventDefault();
      const desc_field = document.querySelector('#nft-buy-description');
      let title = (document.querySelector('.saito-nft-header-title').innerHTML || '').trim();
      let description = desc_field?.innerText || desc_field?.value || desc_field.innerHTML || '';
      description = description.trim();

      console.log(description, this.nft.description);

      if (!this.app.wallet.isValidPublicKey(this.mod.assetStore?.publicKey)) {
        salert('Node public key is not valid');
        return;
      }

      let buy_price_str = (input?.value || '').trim();

      if (!buy_price_str) {
        salert('Please enter a Buy price (SAITO).');
        return;
      }

      if (!/^\d+(\.\d+)?$/.test(buy_price_str)) {
        salert('Buy price must be a decimal number.');
        return;
      }

      let buy_price_num = Number(buy_price_str);
      if (!Number.isFinite(buy_price_num)) {
        salert('Invalid Buy price.');
        return;
      }

      if (buy_price_num < MIN || buy_price_num > MAX) {
        salert(`Buy price must be between ${MIN} and ${MAX} SAITO.`);
        return;
      }

      // appear responsive...
      console.log('sell-nft: update ui');
      this.overlay.close();
      this.app.connection.emit('saito-nft-list-close-request');
      siteMessage('Sending NFT to the store...', 3000);

      this.app.browser.safeConsole('Nft: ', this.nft, 'info');

      setTimeout(async () => {
        try {
          // create the NFT transaction
          //
          let nfttx = await this.app.wallet.createSendNFTTransaction(
            this.nft,
            this.mod.assetStore.publicKey,
            'AssetStore'
          );
          await nfttx.sign();

          let opt = {
            receiver: this.mod.assetStore.publicKey,
            reserve_price: buy_price_num,
            title,
            description,
            nft_tx: nfttx.serialize_to_web(this.app)
          };

          console.log('sell-nft: make transaction');
          let newtx = await this.mod.createListAssetTransaction(opt);

          let pseudo_record = {
            nft_id: this.nft.id,
            nfttx: nfttx.serialize_to_web(this.app),
            nfttx_sig: nfttx.signature, // transfer NFT ownership to Store transaction
            seller: this.mod.publicKey,
            active: 0,
            reserve_price: buy_price_num,
            title,
            description
          };

          this.mod.listings.push(pseudo_record);
          await this.app.network.propagateTransaction(newtx);
          console.log('New pseudo_record:', pseudo_record);
          this.app.connection.emit('assetstore-render-listings');
        } catch (err) {
          console.error(err);
          salert('Failed to list: ' + (err?.message || err));
          this.app.browser.safeConsole('Nft: ', this.nft, 'debug');
        }
      }, 50);
    };
  }
}

module.exports = SellNFTOverlay;
