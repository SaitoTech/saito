const JSON = require('json-bigint');
const AssetStoreMainTemplate = require('./main.template');
const Transaction = require('../../../../lib/saito/transaction').default;
const AssetStoreNFTCard = require('./../overlays/assetstore-nft-card');

const SellNFTOverlay = require('./../overlays/sell-nft');
const BuyNFTOverlay = require('./../overlays/buy-nft');
const DelistNFTOverlay = require('./../overlays/delist-nft');

class AssetStoreMain {
	constructor(app, mod) {
		this.app = app;
		this.mod = mod;

		this.sell_nft_overlay = new SellNFTOverlay(this.app, this.mod);
		this.buy_nft_overlay = new BuyNFTOverlay(this.app, this.mod);
		this.delist_nft_overlay = new DelistNFTOverlay(this.app, this.mod);

		this.app.connection.on('assetstore-render-listings', () => {
			this.renderListings();
		});
	}

	render() {
		let this_self = this;

		if (!document.querySelector('.saito-container')) {
			this.app.browser.addElementToDom(AssetStoreMainTemplate(this.app, this.mod, this));
		} else {
			this.app.browser.replaceElementBySelector(
				AssetStoreMainTemplate(this.app, this.mod, this),
				'.saito-container'
			);
		}

		this.renderListings();

		this.attachEvents();
	}

	attachEvents() {
		let this_self = this;
		let list_asset_btn = document.querySelector('.list-asset');
		if (list_asset_btn) {
			list_asset_btn.onclick = async (e) => {
				this.app.connection.emit('saito-nft-list-render-request', (nft) => {
					this.sell_nft_overlay.render(nft);
				});
			};
		}
	}

	renderListings() {
		if (document.querySelector('.assetstore-table-list')) {
			document.querySelector('.assetstore-table-list').innerHTML = ``;
		}

		let empty_msg = document.querySelector('#assetstore-empty');

		console.debug(`Rendering: ${this.mod.listings.length} store listings`);
		//
		//
		//
		if (this.mod.listings.length > 0) {
			empty_msg.style.display = 'none';
			for (let i = 0; i < this.mod.listings.length; i++) {
				let record = this.mod.listings[i];

				if (record?.active > 1) {
					console.warn('Have unavailable nfts listed in store');
					continue;
				}

				console.log(record);
				if (!record.nft_card) {
					let nfttx = null;

					if (record.nfttx) {
						nfttx = new Transaction();
						nfttx.deserialize_from_web(this.app, record.nfttx);
					}

					let nft_card = new AssetStoreNFTCard(
						this.app,
						this.mod,
						'.assetstore-table-list',
						nfttx,
						record,
						(nft1) => {
							let seller_publicKey = nft1?.seller || '';
							if (seller_publicKey === this.mod.publicKey) {
								this.delist_nft_overlay.render(nft1);
							} else {
								this.buy_nft_overlay.render(nft1);
							}
						}
					);

					//
					// no transaction, we need the sig so fetch will work
					//
					if (nfttx == null) {
						if (record.nfttx_sig) {
							nft_card.nft.tx_sig = record.nfttx_sig;
							nft_card.nft.id = record.nft_id;
						}
					}

					nft_card.nft.setPrice(record?.reserve_price);
					nft_card.nft.setSeller(record?.seller);

					record.nft_card = nft_card;
				}

				record.nft_card.nft.fetchTransaction(async () => {
					//
					// check if transaction has changed...
					//
					if (record.nft_card.nft.tx_sig != record.nfttx_sig) {
						//this.app.browser.safeConsole('NFT:', record.nft_card.nft, 'debug');

						let new_nfttx = null;

						record.nft_card.nft.tx_sig = record.nfttx_sig;

						if (record.nfttx) {
							new_nfttx = new Transaction();
							new_nfttx.deserialize_from_web(this.app, record.nfttx);
							record.nft_card.nft.tx = new_nfttx;
							record.nft_card.nft.tx_sig = new_nfttx.signature;
						}
					}

					record.nft_card.nft.metadata = record;

					await record.nft_card.render();
				});
			}
		} else {
			empty_msg.style.display = 'block';
		}
	}
}

module.exports = AssetStoreMain;
