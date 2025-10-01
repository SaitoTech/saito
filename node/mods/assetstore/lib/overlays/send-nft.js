const NftDetailsOverlay = require('./../../../../lib/saito/ui/saito-nft/overlays/nft-overlay');

class SendNftOverlay extends NftDetailsOverlay {

  constructor(app, mod) {

    super(app, mod, false);

  }

  async render() {

    super.render();


    if (document.getElementById('nft-details-send')) {

      let new_html = `
        <div class="nft-details-action" id="nft-details-send">
          <div class="nft-receiver">
            <input type="text" placeholder="Recipient public key" id="nft-receiver-address" value="${this.mod.assetStore.publicKey}" />
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
      const MIN = 0.00000001;
      const MAX = 100000000;
                                        
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
                                if (Number.isFinite(num) && num > MAX) { 
                                        v = '100000000';
                                }       
                                input.value = v;
      });
                
      input.addEventListener('blur', () => {
                                const v = input.value.trim();
                                if (!v) return;
                                const num = Number(v);
                                if (Number.isFinite(num) && num > 0 && num < MIN) {
                                        input.value = MIN.toFixed(8).replace(/0+$/, '');
                                }
      });

      const sendBtn = document.getElementById('confirm_list');
      sendBtn.onclick = async (e) => {

	alert("button clicked -- confirm listing...");

        e.preventDefault();

        const receiver = (document.getElementById('nft-receiver-address').value || '').trim();

        if (!this.app.wallet.isValidPublicKey(receiver)) {
          salert('Node public key is not valid');
          return;
        }

        const buyPriceStr = (input?.value || '').trim();

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

        try {

          const newtx = await this.mod.createListAssetTransaction(this.nft, receiver, buyPriceNum);
          await this.app.network.propagateTransaction(newtx);

	  this.overlay.hide();

          siteMessage('NFT listing transaction broadcast...', 3000);
        } catch (err) {
          salert('Failed to list: ' + (err?.message || err));
        }
      };
    }
  }
}

module.exports = SendNftOverlay;
