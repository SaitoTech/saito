const JSON = require('json-bigint');
const AssetStoreMainTemplate = require('./main.template');
const Transaction = require('../../../../lib/saito/transaction').default;

// To fix later
const Nft = require('./auction-nft-extended'); // use the subclass here
const AuctionSendOverlay = require('./auction-send-overlay');

class AssetStoreMain {
	constructor(app, mod, container = 'body') {
		this.app = app;
		this.mod = mod;
		this.container = container;

		this.app.connection.on('assetstore-render-auction-list-request', async () => {
			await this.render();
		});

		this.app.connection.on('assetstore-build-auction-list-request', async () => {
			console.log('inside  assetstore-buildAuctionList-auction-list-request /////////////////');
			await this.buildAuctionList();
		});
	}

	async render() {
		let this_self = this;

		if (!document.querySelector('.saito-container')) {
			this.app.browser.addElementToDom(AssetStoreMainTemplate(this.app, this.mod, this));
		} else {
			this.app.browser.replaceElementBySelector(
				AssetStoreMainTemplate(this.app, this.mod, this),
				'.saito-container'
			);
		}

		await this.buildAuctionList();

		this.attachEvents();
	}

	async buildAuctionList() {
		// empty list
		if (document.querySelector('.assetstore-table-list')) {
			document.querySelector('.assetstore-table-list').innerHTML = ``;
		}
		let empty_msg = document.querySelector('#assetstore-empty');
		let title = document.querySelector('#assetstore-table-title');

		console.log('this.mod.auction_list: ', this.mod.auction_list);

		if (this.mod.auction_list.length > 0) {
			empty_msg.style.display = 'none';
			title.style.display = 'block';

			for (let i = 0; i < this.mod.auction_list.length; i++) {
				let record = this.mod.auction_list[i];

				let nfttx = new Transaction();
				nfttx.deserialize_from_web(this.app, record.nft);

				const nft = new Nft(this.app, this.mod, '.assetstore-table-list', nfttx, null, (nft1) => {
					console.log('Click on available NFT in Auction House');
					// Render the overlay
					this.app.connection.emit('saito-nft-details-render-request', nft1);
					// edit the html
					this.convertSendToBuy(nft1);
				});

				nft.seller = record.seller;

				await nft.render();
			}
		} else {
			empty_msg.style.display = 'block';
			title.style.display = 'none';
		}
	}

	attachEvents() {
		let this_self = this;
		let list_asset_btn = document.querySelector('.list-asset');
		if (list_asset_btn) {
			list_asset_btn.onclick = async (e) => {
				console.log('Click to generate my nft list!');
				this.app.connection.emit('saito-nft-list-render-request', null, (nft) => {
					console.log('Click on my NFT to list in Auction House');
					// Render the overlay
					this.app.connection.emit('saito-nft-details-render-request', nft);
					// edit the html
					this.convertSendToList(nft);
				});
			};
		}
	}

	convertSendToList(nft) {
		if (document.getElementById('nft-details-send')) {
			let new_html = `
			<div class="nft-details-action" id="nft-details-send">
          		<div class="nft-receiver">
            		<input type="text" placeholder="Recipient public key" id="nft-receiver-address" value="${this.mod.assetStore.publicKey}" />
          		</div>
          		<div class="nft-buy-price" style="margin-top: 8px;">
          		<input type="text" placeholder="Buy price (SAITO)" id="nft-buy-price" autocomplete="off" inputmode="decimal" pattern="^[0-9]+(\.[0-9]{1,8})?$" 
          				title="Enter a decimal amount up to 8 decimals (min 0.00000001, max 100000000)" style="width: 100%; box-sizing: border-box;"></div>
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
					const listTx = await this.mod.createListAssetTransaction(nft, receiver, buyPriceNum);

					await this.app.network.propagateTransaction(listTx);

					// Close the overylay remotely
					this.app.connection.emit('saito-nft-details-close-request');

					siteMessage('NFT sent to auction house', 3000);
				} catch (err) {
					salert('Failed to list: ' + (err?.message || err));
				}
			};
		}
	}

	convertSendToBuy(nft) {}
}

module.exports = AssetStoreMain;
