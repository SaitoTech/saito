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
const ContactsList = require('./../../../../lib/saito/ui/modals/saito-contacts/saito-contacts');

class AssetStoreMain {
	constructor(app, mod) {
		this.app = app;
		this.mod = mod;

		this.sell_nft_overlay = new SellNFTOverlay(this.app, this.mod);
		this.buy_nft_overlay = new BuyNFTOverlay(this.app, this.mod);
		this.delist_nft_overlay = new DelistNFTOverlay(this.app, this.mod);

		this.view = null;

		// Standard Saito UI Components
		this.loader = new SaitoLoader(app, mod, '.assetstore-table');
		//
		// registered sellers get the human-readable /store/@name permalink
		// (resolved server-side through the registry); everyone else shares
		// the raw ?seller= pubkey form
		//
		let store_identifier = app.keychain.returnIdentifierByPublicKey(mod.publicKey);
		let link_data = store_identifier
			? { name: 'Store', path: `/store/@${store_identifier.split('@')[0]}` }
			: { name: 'Store', path: '/store', seller: mod.publicKey };
		this.link = new SaitoInvitationLink(app, mod, link_data);
		// store links are long-lived references, not transitory invites
		this.link.shorten = false;
		this.contactList = new ContactsList(app, mod);
		this.contactList.title = 'Bookmark contact';
		this.contactList.callback = async (person) => {
			if (person) {
				if (!mod.authorized_sellers.includes(person)) {
					app.keychain.addKey(person, { guanzhu_shop: true });
					mod.authorized_sellers.push(person);
					this.render();
				}
			}
		};

		this.app.connection.on('assetstore-render-listings', () => {
			console.log('assetstore-render-listings');
			this.renderListings();
		});

		this.app.connection.on('assetstore-new-user-listing', () => {
			if (this.view !== this.mod.publicKey) {
				document
					.querySelector(`.saito-store-page-tab[data-pkey="${this.mod.publicKey}"]`)
					.classList.add('flashing-tab');
			}
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
				this.app.connection.emit(
					'saito-nft-list-render-request',
					'Select an NFT to List',
					(nft) => {
						this.sell_nft_overlay.render(nft);
					}
				);
			};
		}

		const dissolveSplash = () => {
			if (document.querySelector('.asset-store-splash')) {
				document.querySelector('.asset-store-splash').classList.add('dissolve');

				setTimeout(() => {
					if (document.querySelector('.asset-store-splash')) {
						document.querySelector('.asset-store-splash').remove();
					}
				}, 5000);
			}
		};

		if (document.getElementById('my-store-btn')) {
			document.getElementById('my-store-btn').onclick = (e) => {
				this.view = this.mod.publicKey;
				changeView();
				dissolveSplash();
			};
		}

		if (document.getElementById('home-store-btn')) {
			document.getElementById('home-store-btn').onclick = (e) => {
				this.view = this.mod.SAITO_OFFICIAL_PUBLICKEY;
				changeView();
				dissolveSplash();
			};
		}

		//
		// View navigation
		//
		const changeView = () => {
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

		// Sidebar Navigation
		Array.from(document.querySelectorAll('.saito-store-page-tab')).forEach((tab) => {
			tab.onclick = async (e) => {
				this.view = e.currentTarget.dataset['pkey'];
				changeView();
			};
		});

		// Mobile form
		if (document.querySelector('.saito-store-explorer-mobile')) {
			document.querySelector('.saito-store-explorer-mobile').onchange = (e) => {
				this.view = e.currentTarget.value;
				changeView();
			};
		}

		// Add bookmark
		Array.from(document.querySelectorAll('.add-store')).forEach((search) => {
			search.onclick = (e) => {
				this.contactList.render();
			};
		});

		//
		// Display User's Store Link
		//
		Array.from(document.querySelectorAll('.store-link')).forEach((link) => {
			link.onclick = (e) => {
				e.stopPropagation();
				this.link.render();
			};
		});

		const handleBookmarking = (pkey, icon_el) => {
			if (icon_el.classList.contains('fa-solid')) {
				// Unbookmark
				icon_el.classList.add('fa-regular');
				icon_el.classList.remove('fa-solid');
				this.app.keychain.addKey(pkey, { guanzhu_shop: false });
				for (let j = 0; j < this.mod.authorized_sellers.length; j++) {
					if (this.mod.authorized_sellers[j] == pkey) {
						this.mod.authorized_sellers.splice(j, 1);
						break;
					}
				}
				this.render();
			} else {
				// Bookmark
				icon_el.classList.add('fa-solid');
				icon_el.classList.remove('fa-regular');
				this.app.keychain.addKey(pkey, { guanzhu_shop: true });
				this.mod.authorized_sellers.push(pkey);
			}
		};

		if (document.querySelector('.other-store')) {
			document.querySelector('.other-store').onclick = (e) => {
				let pkey = document.querySelector('.other-store .store-bookmark')?.dataset['pkey'];
				let icon_el = document.querySelector('.other-store i');
				handleBookmarking(pkey, icon_el);
			};
		}

		Array.from(document.querySelectorAll('.store-bookmark')).forEach((bookmark) => {
			bookmark.onclick = (e) => {
				e.stopPropagation();

				let pkey = e.currentTarget.dataset['pkey'];
				let icon_el = e.currentTarget.querySelector('i');

				handleBookmarking(pkey, icon_el);
			};
		});
	}

	renderSidebar() {
		for (let pkey of this.mod.authorized_sellers) {
			if (!document.querySelector(`.saito-store-page-tab[data-pkey="${pkey}"]`)) {
				let key = this.app.keychain.returnKey(pkey);
				let icon = `<div data-pkey="${pkey}" class="store-bookmark store-absolute-icon"><i class="${key?.guanzhu_shop ? 'fa-solid' : 'fa-regular'} fa-bookmark"></i></div>`;

				this.app.browser.addElementToSelector(
					`<div class='saito-store-page-tab' data-pkey='${pkey}'><span>${this.app.keychain.returnUsername(pkey)}</span>${icon}</div>`,
					'.saito-store-explorer'
				);

				this.app.browser.addElementToSelector(
					`<option value='${pkey}'>${this.app.keychain.returnUsername(pkey)}</option>`,
					'.saito-store-explorer-mobile'
				);
			}
		}
	}

	renderListings() {
		if (document.querySelector('.assetstore-table-list')) {
			document.querySelector('.assetstore-table-list').innerHTML = ``;
		}
		if (document.querySelector('.store-active-tab')) {
			document.querySelector('.store-active-tab').classList.remove('store-active-tab');
		}

		const my_mobile_icon = document.querySelector('.my-store');
		const store_mobile_icon = document.querySelector('.other-store');
		const home_mobile_icon = document.querySelector('.home-store');

		if (my_mobile_icon && store_mobile_icon && home_mobile_icon) {
			if (this.view == this.mod.SAITO_OFFICIAL_PUBLICKEY) {
				my_mobile_icon.style.display = 'none';
				store_mobile_icon.style.display = 'none';
				home_mobile_icon.style.display = 'flex';
			} else if (this.view == this.mod.publicKey) {
				my_mobile_icon.style.display = 'flex';
				store_mobile_icon.style.display = 'none';
				home_mobile_icon.style.display = 'none';
			} else {
				my_mobile_icon.style.display = 'none';
				store_mobile_icon.style.display = 'flex';
				home_mobile_icon.style.display = 'none';
				let key = this.app.keychain.returnKey(this.view);
				let icon = `<div data-pkey="${this.view}" class="store-bookmark store-absolute-icon"><i class="${key?.guanzhu_shop ? 'fa-solid' : 'fa-regular'} fa-bookmark"></i></div>`;
				store_mobile_icon.innerHTML = icon;
			}
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
		let current_tab = document.querySelector(`.saito-store-page-tab[data-pkey="${this.view}"]`);
		if (current_tab) {
			current_tab.classList.add('store-active-tab');
			current_tab.classList.remove('flashing-tab');
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
