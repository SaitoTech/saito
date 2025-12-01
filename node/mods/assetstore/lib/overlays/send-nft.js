let NFTDetailsOverlay = require('./../../../../lib/saito/ui/saito-nft/overlays/nft-overlay');

class SendNFTOverlay extends NFTDetailsOverlay {

  constructor(app, mod) {

    super(app, mod, false);

  }

  async render() {

    await super.render();

    if (document.querySelector(".saito-nft-footer-btn.send")) {
      document.querySelector(".saito-nft-footer-btn.send").innerHTML = "Confirm and List";
    }               
 
    document.querySelector(".saito-nft-footer-btn.enable").style.display = "none";   
    document.querySelector(".saito-nft-footer-btn.split").style.display = "none";   
    document.querySelector(".saito-nft-footer-btn.merge").style.display = "none";   
    document.querySelector(".saito-nft-footer-btn.disable").style.display = "none";   

    let html = `
      <div class="assetstore-nft-listing-inputs">
        <div class="assetstore-nft-listing-inputs-receiver" style="display:none">
          <input type="text" placeholder="Recipient public key" id="nft-receiver-address" value="${this.mod.assetStore?.publicKey}" />
        </div>
        <div class="assetstore-nft-listing-inputs-price">
          <input type="text" placeholder="sale price (SAITO)" id="nft-buy-price" autocomplete="off" inputmode="decimal" pattern="^[0-9]+(\.[0-9]{1,8})?$" title="Enter a decimal amount up to 8 decimals (min 0.00000001, max 100000000)" style="width: 100%; box-sizing: border-box;" />
        </div>
	<textarea placeholder="description (optional)" id="nft-buy-description" autocomplete="off" title="" style="height:80px; width: 100%; box-sizing: border-box;"></textarea>
      </div>          
    `;

    document.querySelector(".saito-nft-description").innerHTML = html;
    setTimeout(() => { this.attachMyEvents(); }, 25);

  }

  async attachMyEvents() {

      let input = document.querySelector('#nft-buy-price');
      let desc = document.querySelector('#nft-buy-description');
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



      //
      // send button click
      //
      let send_btn = document.querySelector('.saito-nft-footer-btn.send');
      send_btn.onclick = async (e) => {

        e.preventDefault();

        let receiver = (document.getElementById('nft-receiver-address').value || '').trim();
        let title = (document.querySelector('.saito-nft-header-title').innerHTML || '').trim();
        let description = (document.querySelector('#nft-buy-description').innerHTML || '').trim();

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

	  let opt = {
	    nft : this.nft , 
	    receiver : receiver ,
	    reserve_price : buy_price_num ,
	    title : title ,
	    description : description
	  }

          let newtx = await this.mod.createListAssetTransaction(opt);
          await this.app.network.propagateTransaction(newtx);
	  await this.app.storage.saveTransaction(newtx, { field4: newtx.signature }, 'localhost', null);

          siteMessage('NFT listing transaction broadcast...', 3000);
        } catch (err) {
          salert('Failed to list: ' + (err?.message || err));
        }
      };

  }
}

module.exports = SendNFTOverlay;
