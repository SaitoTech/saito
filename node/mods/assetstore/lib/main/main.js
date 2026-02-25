const JSON = require('json-bigint');
const AssetStoreMainTemplate = require('./main.template');
const Transaction = require('../../../../lib/saito/transaction').default;
const AssetStoreNFTCard = require('./../overlays/assetstore-nft-card');
const AssetStoreNFT = require('./../overlays/assetstore-nft');

const SellNFTOverlay = require('./../overlays/sell-nft');
const BuyNFTOverlay = require('./../overlays/buy-nft');
const DelistNFTOverlay = require('./../overlays/delist-nft');

const SaitoLoader = require('./../../../../lib/saito/ui/saito-loader/saito-loader');
const SaitoInvitationLink = require('./../../../../lib/saito/ui/modals/saito-link/saito-link');

class AssetStoreMain {
	constructor(app, mod) {
		this.app = app;
		this.mod = mod;

		this.sell_nft_overlay = new SellNFTOverlay(this.app, this.mod);
		this.buy_nft_overlay = new BuyNFTOverlay(this.app, this.mod);
		this.delist_nft_overlay = new DelistNFTOverlay(this.app, this.mod);

		this.view = null;

		this.loader = new SaitoLoader(app, mod, '.assetstore-table');
		this.link = new SaitoInvitationLink(app, mod, {
			name: 'Store',
			path: '/store',
			seller: mod.publicKey
		});

		this.app.connection.on('assetstore-render-listings', () => {
			console.log('assetstore-render-listings');
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

		if (window?.target_listing) {
			let listing = JSON.parse(window.target_listing);
			let tx = window.nft_tx ? new Transaction() : null;
			if (tx) {
				tx.deserialize_from_web(this.app, window.nft_tx);
			}
			let nft = new AssetStoreNFT(this.app, this.mod, tx, listing);
			this.buy_nft_overlay.render(nft);
		}
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

				this.view = e.currentTarget.dataset['pkey'];

				if (!this.mod.authorized_sellers.includes(this.view) && this.view !== this.mod.publicKey) {
					this.loading = true;
					this.mod.authorized_sellers.push(this.view);

					console.debug('Loading nfts for user: ', this.view);

					setTimeout(() => {
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
					}, 1000);
				}

				this.renderListings();
			};
		});

		Array.from(document.querySelectorAll('.store-link')).forEach((link) => {
			link.onclick = (e) => {
				e.stopPropagation();
				this.link.render();
			};
		});
	}

	renderSidebar() {
		for (let pkey of this.mod.authorized_sellers) {
			if (!document.querySelector(`.saito-store-page-tab[data-pkey="${pkey}"]`)) {
				this.app.browser.addElementToSelector(
					`<div class='saito-store-page-tab' data-pkey='${pkey}'><span>${this.app.keychain.returnUsername(pkey)}</span></div>`,
					'.saito-store-explorer'
				);

				this.app.browser.addElementToSelector(
					`<option value='${pkey}'><span>${this.app.keychain.returnUsername(pkey)}</span></option>`,
					'.saito-store-explorer-mobile'
				);
			}
		}
	}

	renderListings() {
		if (document.querySelector('.assetstore-table-list')) {
			document.querySelector('.assetstore-table-list').innerHTML = ``;
		}
		this.loader.hide();

		let empty_msg = document.querySelector('#assetstore-empty');
		empty_msg.style.display = 'none';

		console.debug(`Store: ${this.mod.listings.length} listings`);

		if (!this.view) {
			this.view = this.mod.authorized_sellers[0];
			console.info('Inferred seller: ', this.view);
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
			for (let record of listings_to_render) {
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

					const nft_card = new AssetStoreNFTCard(
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

					console.log('rendering nft card');
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
