const JSON = require('json-bigint');
const AssetStoreMainTemplate = require('./main.template');
const Transaction = require('../../../../lib/saito/transaction').default;
const AssetStoreNFTCard = require('./../overlays/assetstore-nft-card');

const SellNFTOverlay = require('./../overlays/sell-nft');
const BuyNFTOverlay = require('./../overlays/buy-nft');
const DelistNFTOverlay = require('./../overlays/delist-nft');

const SaitoLoader = require('./../../../lib/saito/ui/saito-loader/saito-loader');

class AssetStoreMain {
	constructor(app, mod) {
		this.app = app;
		this.mod = mod;

		this.sell_nft_overlay = new SellNFTOverlay(this.app, this.mod);
		this.buy_nft_overlay = new BuyNFTOverlay(this.app, this.mod);
		this.delist_nft_overlay = new DelistNFTOverlay(this.app, this.mod);

		this.view = null;

		this.loader = new SaitoLoader(app, mod, '.assetstore-table-list');

		this.app.connection.on('assetstore-render-listings', () => {
			this.renderListings();
		});
	}

	render() {
		if (!document.querySelector('.saito-container')) {
			this.app.browser.addElementToDom(AssetStoreMainTemplate(this.app, this.mod, this));
		} else {
			this.app.browser.replaceElementBySelector(
				AssetStoreMainTemplate(this.app, this.mod, this),
				'.saito-container'
			);
		}

		this.renderSidebar();
		this.renderListings();

		this.attachEvents();
	}

	attachEvents() {
		//
		// Clicking on add Listing button
		//
		let list_asset_btn = document.querySelector('.list-asset');
		if (list_asset_btn) {
			list_asset_btn.onclick = async (e) => {
				this.app.connection.emit('saito-nft-list-render-request', (nft) => {
					this.sell_nft_overlay.render(nft);
				});
			};
		}

		//
		// View navigation
		//
		Array.from(document.querySelectorAll('.saito-store-page-tab')).forEach((tab) => {
			tab.onclick = async (e) => {
				if (document.querySelector('.store-active-tab')) {
					document.querySelector('.store-active-tab').classList.remove('store-active-tab');
				}

				console.debug(
					'***',
					e.currentTarget.dataset[pkey],
					e.currentTarget.getAttribute('dataset-pkey')
				);
				this.view = e.currentTarget.dataset['pkey'];

				if (!this.mod.authorized_sellers.includes(this.view)) {
					this.loading = true;
					this.mod.authorized_sellers.push(this.view);

					this.app.network.sendRequestAsTransaction(
						'request listings',
						{
							seller: this.mod.authorized_sellers
						},
						(listings) => {
							console.log('STORE: re-fetched listings -- ', listings);
							this.mod.listings = listings;
							this.loading = false;
							this.renderListings();
						},
						this.mod.assetStore.peerIndex
					);
				}

				this.renderListings();
			};
		});
	}

	renderSidebar() {
		for (let pkey of this.mod.authorized_sellers) {
			if (!document.querySelector(`.saito-store-page-tab[data-pkey="${this.view}"]`)) {
				this.app.browser.addElementToSelector(
					`<div class='saito-store-page-tab' data-pkey='${pkey}'>${this.app.keychain.returnUsername(pkey)}</div>`,
					'.saito-store-explorer'
				);
			}
		}
	}

	renderListings() {
		if (document.querySelector('.assetstore-table-list')) {
			document.querySelector('.assetstore-table-list').innerHTML = ``;
		}

		let empty_msg = document.querySelector('#assetstore-empty');
		empty_msg.style.display = 'none';

		console.debug(`Store: ${this.mod.listings.length} listings`);

		if (!this.view) {
			this.view = this.mod.authorized_sellers[0];
		}

		// Show active tab (in sidebar)
		if (document.querySelector(`.saito-store-page-tab[data-pkey="${this.view}"]`)) {
			document
				.querySelector(`.saito-store-page-tab[data-pkey="${this.view}"]`)
				.classList.add('store-active-tab');
		}

		const listings_to_render = this.mod.filterListings([this.view]);

		console.debug(`Store: ${listings_to_render.length} listings to display`);

		//
		//
		//
		if (listings_to_render.length > 0) {
			for (let record of listings_to_render.length) {
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
			if (this.loading) {
				this.loader.show();
			} else {
				empty_msg.style.display = 'block';
			}
		}
	}
}

module.exports = AssetStoreMain;
