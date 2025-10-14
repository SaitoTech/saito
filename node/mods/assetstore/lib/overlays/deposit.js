const DepositTemplate = require('./deposit.template');
const SaitoOverlay = require('./../../../../lib/saito/ui/saito-overlay/saito-overlay');
const ListNftsOverlay = require('./../overlays/list-nfts');

class AssetstoreDepositOverlay {

	constructor(app, mod, container = 'body') {

		this.app = app;
		this.mod = mod;
		this.container = container;

		this.address = '';
		this.ticker = '';
		this.amount = 0;
		this.deposit_overlay = new SaitoOverlay(app, mod, false, true);
	}

	async render() {
		let this_self = this;

		this.deposit_overlay.show(DepositTemplate(this.app, this.mod, this));


		this.app.browser.generateQRCode(this.address, 'deposit-qrcode');
		
		this.attachEvents();
	}

	attachEvents() {

		// let this_self = this;
		// let list_asset_btn = document.querySelector('.list-asset');
		// if (list_asset_btn) {
		// 	list_asset_btn.onclick = async (e) => {
				

		// 	};
		// }

	}


}

module.exports = AssetstoreDepositOverlay;
