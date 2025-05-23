const ReceiveTemplate = require('./receive.template');
const SaitoOverlay = require('./../../saito-overlay/saito-overlay');
const SaitoUser = require('./../../saito-user/saito-user');

class Receive {
	constructor(app, mod, container = '') {
		this.app = app;
		this.mod = mod;
		this.overlay = new SaitoOverlay(app, mod, false);

		this.overlay.clickBackdropToClose = false;

		this.counter_party = new SaitoUser(this.app, this.mod, "#receive-crypto-request-container .counterparty-details");

		this.app.connection.on('saito-crypto-receive-render-request', (details) => {
			this.render(details);
		});

		this.app.connection.on('saito-crypto-receive-confirm', (details) => {
			this.updateOverlay(details);
		});




	}

	/**
	 * Shows a confirmation overlay before initiating a crypto transfer
	 * @param ticker { string } - name of a currency
	 * @param amount { string } - the amount of crypto
	 * @param publicKey { string } - Saito public key of recipient
	 * @param address { string } - address of receiver (for currency)
	 * @param trusted { boolean } - flag for whether to autoprocess
	 * @param mycallback { function} - to run when approved
	 *
	 */
	render(details) {

		//
		// Verify complete information
		//
		if (!details?.ticker || !details?.amount){
			console.error("Missing ticker/amount in Receive Crypto Overlay");
			return;
		}

		if (!details?.publicKey || !details?.address){
			console.error("Missing address in Receive Crypto Overlay");
			return;
		}

		console.log("Show overlay");
		this.overlay.show(ReceiveTemplate(this.app, this.mod, details), ()=> {
			console.log("&&&&&&&&&&& close overlay -- run call back!!!");
			if (details.mycallback){
				details.mycallback();
			}
		});

		this.counter_party.publicKey = details.publicKey;

		this.counter_party.render();

		let html = `
			<div class="profile-public-key">
				${details.address.slice(0, 8)}...${details.address.slice(-8)}
            </div>`;

		this.counter_party.updateUserline(html);

		this.attachEvents();

		if (details?.trusted){
			console.log("Trusted!");
			this.timeout = setTimeout(()=> { 
				this.overlay.close(); 
				this.timeout = null;
			}, 3000);
			this.countDown();
		}


	}

	countDown() {
		// Countdown clock
		setTimeout(()=> {														
			let c = document.querySelector("#receive-crypto-request-container .crypto-transfer-countdown span");
			if (c){
				let value = parseInt(c.innerHTML);
				value = Math.max(value-1, 0);
				c.innerHTML = value.toString();
				this.countDown();
			}
		}, 900);
	}



	attachEvents() {

		if (document.getElementById('crypto_receipt_btn')){
			document.getElementById('crypto_receipt_btn').onclick = (e) => {
				let ignoreBtn = document.querySelector('#ignore_checkbox');
				if (ignoreBtn?.checked){
					this.mod.saveGamePreference("crypto_transfers_inbound_trusted", 1);
				}
				this.overlay.close();
			};			
		}
	
	}


	updateOverlay(results){

		let success = results?.hash && !results?.err;

		if (document.getElementById("receive-crypto-request-container")) {
			document.querySelector('.spinner').style.display = 'none';

			if (success){
				document.querySelector('#auth_title').innerHTML = `Received Payment`;
				document.querySelector('#game-crypto-icon').style.display = 'block';
			}else{
				document.querySelector('#auth_title').innerHTML = `Failure`;
				document.querySelector('#game-crypto-failure-icon').style.display = 'block';
			}
		
			if (this.timeout) {
				clearTimeout(this.timeout);
				setTimeout(() => { 
					this.overlay.close(); 
					this.timeout = null;
				}, 3000);
				document.querySelector("#receive-crypto-request-container .crypto-transfer-countdown span");
			}

		}

	}

}


module.exports = Receive;
