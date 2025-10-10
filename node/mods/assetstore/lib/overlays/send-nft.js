let NftDetailsOverlay = require('./../../../../lib/saito/ui/saito-nft/overlays/nft-overlay');

class SendNftOverlay extends NftDetailsOverlay {

  constructor(app, mod) {

    super(app, mod, false);

  }

  async render() {

    await super.render();

    if (document.getElementById('nft-details-send')) {
      let new_html = `
        <div class="nft-details-action" id="nft-details-send">
          <div class="nft-receiver">
            <input type="text" placeholder="Recipient public key" id="nft-receiver-address" value="${this.mod.assetStore?.publicKey}" />
          </div>
          <div class="nft-buy-price" style="margin-top: 8px;">
            <input type="text" placeholder="Buy price (SAITO)" id="nft-buy-price" autocomplete="off" inputmode="decimal" pattern="^[0-9]+(\.[0-9]{1,8})?$" title="Enter a decimal amount up to 8 decimals (min 0.00000001, max 100000000)" style="width: 100%; box-sizing: border-box;"></div>                                   
            <div class="saito-button-row auto-fit">
              <button id="cancel" class='saito-button-secondary cancel-action'>Cancel</button>
              <button id="confirm_list" class="saito-button-primary">Confirm Listing</button>
            </div>
          </div>          
      `;

      if (document.getElementById('send')) {
        document.getElementById('send').innerHTML = 'List';
      }               
                                        
      this.app.browser.replaceElementById(new_html, 'nft-details-send');
                
      let input = document.getElementById('nft-buy-price');
      let MIN = 0.00000001;
      let MAX = 100000000;
                                        
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

      let send_btn = document.getElementById('confirm_list');
      send_btn.onclick = async (e) => {

        e.preventDefault();

        let receiver = (document.getElementById('nft-receiver-address').value || '').trim();

        if (!this.app.wallet.isValidPublicKey(receiver)) {
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

        try {

	  // appear responsive...
	  this.overlay.close();

          let newtx = await this.mod.createListAssetTransaction(this.nft, receiver, buy_price_num);
          await this.app.network.propagateTransaction(newtx);


	  this.mod.addListing
	  await this.app.storage.saveTransaction(newtx, { field4: newtx.signature }, 'localhost', null);


          siteMessage('NFT listing transaction broadcast...', 3000);
        } catch (err) {
          salert('Failed to list: ' + (err?.message || err));
        }
      };
    }
  }
}

module.exports = SendNftOverlay;
