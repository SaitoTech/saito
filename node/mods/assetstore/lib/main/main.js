const JSON = require('json-bigint');
const AssetStoreMainTemplate = require('./main.template');
const Transaction = require('../../../../lib/saito/transaction').default;
const AssetStoreNFTCard = require('./../overlays/assetstore-nft-card');

const ListNFTsOverlay = require('./../overlays/list-nfts');
const SendNFTOverlay = require('./../overlays/send-nft');
const BuyNFTOverlay = require('./../overlays/buy-nft');
const DelistNFTOverlay = require('./../overlays/delist-nft');

class AssetStoreMain {

	constructor(app, mod, container = 'body') {

		this.app = app;
		this.mod = mod;
		this.container = container;

		this.list_nfts_overlay = new ListNFTsOverlay(this.app, this.mod);
		this.send_nft_overlay = new SendNFTOverlay(this.app, this.mod);
		this.buy_nft_overlay = new BuyNFTOverlay(this.app, this.mod);
		this.delist_nft_overlay = new DelistNFTOverlay(this.app, this.mod);

		this.app.connection.on('assetstore-render', async () => {
			await this.render();
		});

		this.app.connection.on('assetstore-render-listings', async () => {
			await this.renderListings();
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

		await this.renderListings();

		this.attachEvents();
	}

	attachEvents() {

		let this_self = this;
		let list_asset_btn = document.querySelector('.list-asset');
		if (list_asset_btn) {
			list_asset_btn.onclick = async (e) => {
				this.list_nfts_overlay.render();
			};
		}

	}


	async renderListings() {

		if (document.querySelector('.assetstore-table-list')) {
			document.querySelector('.assetstore-table-list').innerHTML = ``;
		}

		let empty_msg = document.querySelector('#assetstore-empty');

		//
		//
		//
		if (this.mod.listings.length > 0) {
			empty_msg.style.display = 'none';
			for (let i = 0; i < this.mod.listings.length; i++) {


				let record = this.mod.listings[i];
				let nfttx = null;
				let data = {};
				if (record.nfttx) {
				  nfttx = new Transaction();
				  nfttx.deserialize_from_web(this.app, record.nfttx);
				} else {
				}

				let nft_card = new AssetStoreNFTCard(this.app, this.mod, '.assetstore-table-list', nfttx, record, async (nft1) => {
					let seller_publicKey = nft1?.seller || '';
					if (seller_publicKey === this.mod.publicKey) {
					  	this.delist_nft_overlay.nft = nft1;
					  	this.delist_nft_overlay.render();
					} else {
						this.buy_nft_overlay.nft = nft1;
						this.buy_nft_overlay.render();
					}
				});

				//
				// no transaction, we need the sig so fetch will work
				//
				if (nfttx == null) {
					if (record.nfttx_sig) {
						nft_card.nft.tx_sig = record.nfttx_sig;
						nft_card.nft.id = record.nft_id;
					}
				}

				if (record.title) { nft_card.title = record.title; }
				if (record.description) { nft_card.description = record.description; }

				await nft_card.nft.setPrice(record?.reserve_price);
				await nft_card.nft.setSeller(record?.seller);
				await nft_card.render();

			}

		} else {
			empty_msg.style.display = 'block';
		}

	}

}

module.exports = AssetStoreMain;
