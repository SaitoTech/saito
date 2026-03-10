let NFTDetailsOverlay = require('./../../../../lib/saito/ui/saito-nft/overlays/nft-overlay');

class SellNFTOverlay extends NFTDetailsOverlay {
  constructor(app, mod) {
    super(app, mod, false);
  }

  render(nft) {
    super.render(nft); // Will call attachEvents

    Array.from(document.querySelectorAll('.saito-nft-panel-view .saito-nft-footer-btn')).forEach(
      (el) => (el.style.display = 'none')
    );

    if (document.querySelector('.saito-nft-footer-btn.send-nft')) {
      document.querySelector('.saito-nft-footer-btn.send-nft').innerHTML = 'List';
      document.querySelector('.saito-nft-footer-btn.send-nft').style.display = 'flex';
    }

    let key = this.app.keychain.returnKey(this.mod.publicKey);

    let html = `
        <div id='transfer-info-panel' class="saito-nft-description">
          <h2 class="saito-nft-mode-title">List NFT for sale</h2>
          <div class="listing-inputs">
            <input type="text" placeholder="sale price (SAITO)" id="nft-buy-price" autocomplete="off" inputmode="decimal" pattern="^[0-9]+(\.[0-9]{1,8})?$" title="Enter a decimal amount up to 8 decimals (min 0.00000001, max 100000000)" />
          </div>
          <div class="listing-inputs">
            <input id="seller-email" type="email" value="${key?.email || ''}" placeholder="email (optional)"></input>
          </div>
          <textarea id="nft-buy-description" autocomplete="off" title="" rows="4"  placeholder="${this.nft.description || 'description (optional)'}"></textarea>
        </div>
    `;

    if (document.getElementById('transfer-info-panel')) {
      this.app.browser.replaceElementById(html, 'transfer-info-panel');
    } else {
      this.app.browser.prependElementToSelector(
        html,
        '.saito-nft-panel-send .saito-nft-panel-body'
      );
    }
  }

  attachEvents() {
    super.attachEvents();
    document.querySelector('.saito-nft-footer-btn.enable-nft').style.display = 'none';
    document.querySelector('.saito-nft-footer-btn.disable-nft').style.display = 'none';

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
    let list_btn = document.querySelector('.saito-nft-footer-btn.send-nft');
    list_btn.onclick = (e) => {
      document.querySelector('.saito-nft-overlay.panels').classList.add('saito-nft-mode-send');
    };

    let send_btn = document.querySelector('.saito-nft-footer-btn.saito-nft-confirm-btn');
    send_btn.onclick = (e) => {
      e.preventDefault();
      const desc_field = document.querySelector('#nft-buy-description');
      let title = (document.querySelector('.saito-nft-header-title').innerHTML || '').trim();
      let description = desc_field?.innerText || desc_field?.value || desc_field.innerHTML || '';
      description = description.trim();

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

      let selected_shard = document.querySelector('.saito-nft-panel-send .selected-shard');
      if (!selected_shard) {
        salert('Please select which shard you want to send');
        return;
      } else {
        let idx = parseInt(selected_shard.getAttribute('data-utxo-idx')) - 1;

        let split_nft = this.all_slips[idx];

        this.nft.tx_sig = split_nft?.tx_sig;
        this.nft.slip1 = split_nft.slip1;
        this.nft.slip2 = split_nft.slip2;
        this.nft.slip3 = split_nft.slip3;
        this.nft.amount = split_nft.slip1.amount;
        this.nft.deposit = split_nft.slip2.amount;
      }

      let email = document.getElementById('seller-email')?.value || '';
      if (email) {
        this.app.keychain.addKey(this.mod.publicKey, { email });
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
            email,
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
            created_at: Date.now(),
            description
          };

          this.mod.listings.push(pseudo_record);
          await this.app.network.propagateTransaction(newtx);
          console.log('New pseudo_record:', pseudo_record);
          this.app.connection.emit('assetstore-render-listings');
          this.app.connection.emit('assetstore-new-user-listing');
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
