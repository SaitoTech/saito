const JSON = require('json-bigint');
const AssetStoreMainTemplate = require('./main.template');
const Transaction = require('../../../../lib/saito/transaction').default;
const NftCard = require('./../../../../lib/saito/ui/saito-nft/nft-card');

const ListNftsOverlay = require('./../overlays/list-nfts');
const SendNftOverlay = require('./../overlays/send-nft');
const BuyNftOverlay = require('./../overlays/buy-nft');
const DelistNftOverlay = require('./../overlays/delist-nft');

class AssetStoreMain {

	constructor(app, mod, container = 'body') {

		this.app = app;
		this.mod = mod;
		this.container = container;

		this.list_nfts_overlay = new ListNftsOverlay(this.app, this.mod);
		this.send_nft_overlay = new SendNftOverlay(this.app, this.mod);
		this.buy_nft_overlay = new BuyNftOverlay(this.app, this.mod);
		this.delist_nft_overlay = new DelistNftOverlay(this.app, this.mod);


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
		let title = document.querySelector('#assetstore-table-title');

		//
		//
		//
		if (this.mod.auction_list.length > 0) {

			empty_msg.style.display = 'none';
			title.style.display = 'block';

			for (let i = 0; i < this.mod.auction_list.length; i++) {
				let record = this.mod.auction_list[i];

				let nfttx = new Transaction();
				nfttx.deserialize_from_web(this.app, record.nfttx);

				const nft_card = new NftCard(this.app, this.mod, '.assetstore-table-list', nfttx, null, async (nft1) => {
					this.buy_nft_overlay.nft = nft1;
					this.buy_nft_overlay.render();
				});

				await nft_card.nft.setPrice(record?.reserve_price);
				await nft_card.nft.setSeller(record?.seller);
				await nft_card.render();

			}

		} else {

			empty_msg.style.display = 'block';
			title.style.display = 'none';
		}

	}
}

module.exports = AssetStoreMain;
