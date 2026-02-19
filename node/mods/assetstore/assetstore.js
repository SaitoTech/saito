const PeerService = require('saito-js/lib/peer_service').default;
const Transaction = require('../../lib/saito/transaction').default;
const saito = require('./../../lib/saito/saito');
const ModTemplate = require('../../lib/templates/modtemplate');
const AssetStoreMain = require('./lib/main/main');
const SaitoHeader = require('./../../lib/saito/ui/saito-header/saito-header');
const SaitoNFT = require('./../../lib/saito/ui/saito-nft/saito-nft');
const AssetStoreHome = require('./index');
const AssetStoreNFT = require('./lib/overlays/assetstore-nft');

//
// This application provides an auction clearing platform for NFT sales on Saito.
//
// Users can submit NFTs in transactions that specify sales conditions. The application
// can receive and list them, and returns a transaction that can be used to withdraw
// the NFT from the platform and move it back into the original wallet. This withdrawal
// transaction can be submitted to the network any-time before sale.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED,
// INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
// PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT
// HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
// OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
// SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
//
//
class AssetStore extends ModTemplate {
	constructor(app) {
		super(app);

		this.debug = false;

		this.name = 'AssetStore';
		this.slug = 'store';
		this.dbname = 'store';
		this.description = 'Application providing automated settlement for NFT and other asset trades';
		this.categories = 'Utility Ecommerce NFTs';
		this.icon = 'fa-solid fa-cart-shopping';

		this.nfts = {};
		this.listings = [];
		this.purchaseFee = 0;

		this.styles = [`/${this.slug}/style.css`];

		this.assetStore = { publicKey: '', peerIndex: null };

		this.drafts = {}; // our listed nft, txs to send the back to us

		this.social = {
			twitter: '@SaitoOfficial',
			title: '🟥 Saito AssetStore',
			url: 'https://saito.io/store/',
			description: 'Buy or Sell Saito NFTs and other On-Chain Assets',
			image: 'https://saito.tech/wp-content/uploads/2023/11/assetstore-300x300.png'
		};
	}

	//////////////////////////////
	// INITIALIZATION FUNCTIONS //
	//////////////////////////////
	//
	// runs when the module initializes, note that at this point the network
	// may not be up. use onPeerHandshakeCompete() to make requests over the
	// network and process the results.
	//
	async initialize(app) {
		await super.initialize(app);

		//
		// servers pull listings from database
		//
		if (!this.app.BROWSER) {
			await this.restoreListingsFromDB();
		} else {
			if (this.browser_active) {
				this.drafts = (await this.app.storage.getLocalForageItem('listed_nfts')) || {};
				console.log(`We have ${Object.keys(this.drafts).length} NFTs listed in the store`);
			}
		}
	}

	returnServices() {
		let services = [];

		if (this.app.BROWSER == 0) {
			services.push(new PeerService(null, 'AssetStore', this.publicKey));
		}

		return services;
	}

	async onPeerServiceUp(app, peer, service = {}) {
		//
		// BROWSER peers
		//
		if (service.service === 'AssetStore') {
			//
			// save store info
			//
			this.assetStore.publicKey = peer.publicKey;
			this.assetStore.peerIndex = peer.peerIndex;

			if (this.browser_active) {
				//
				// fetch listings
				//
				this.app.network.sendRequestAsTransaction(
					'request listings',
					{},
					(listings) => {
						console.log('STORE: fetched listings -- ', listings);
						this.listings = listings;
						this.app.connection.emit('assetstore-render-listings');
					},
					this.assetStore.peerIndex
				);
			}
		}
	}

	////////////
	// RENDER //
	////////////
	async render() {
		//
		// browsers only!
		//
		if (!this.app.BROWSER || !this.browser_active) {
			return;
		}

		if (this.main == null) {
			this.main = new AssetStoreMain(this.app, this);
			this.header = new SaitoHeader(this.app, this);
			await this.header.initialize(this.app);
			this.header.header_class = 'arcade';
			this.addComponent(this.header);
			this.addComponent(this.main);
		}

		await super.render();
	}

	respondTo(type = '', obj) {
		if (type === 'saito-header') {
			const slug = this.returnSlug();
			let x = [];
			if (!this.browser_active) {
				x.push({
					text: 'Store',
					icon: 'fa-solid fa-cart-shopping',
					rank: 15,
					type: 'navigation', // Group similar icons in wallet
					callback: function (app, id) {
						navigateWindow('/' + slug);
					}
				});
			}

			return x;
		}

		return super.respondTo(type, obj);
	}

	////////////////////////////////////////////////////
	// NETWORK FUNCTIONS -- sending and receiving TXS //
	////////////////////////////////////////////////////
	//
	async onConfirmation(blk, tx, conf = 0) {
		//
		// only process the first conf
		//
		if (conf != 0) {
			return;
		}

		//
		// sanity check
		//
		if (this.hasSeenTransaction(tx, Number(blk.id))) {
			console.log('duplicate transaction', tx.returnMessage());
			return;
		}

		//
		// Bound Transactions (monitor NFT transfers)
		//
		if (tx.type == 8 && tx.from.length < 3) {
			//
			// we only want the servers that are running the AssetStore modules to process
			// this logic, as what this function does is create the delist transaction and
			// we don't want normal users to do that when they delist their own NFTs....
			//
			if (!this.app.BROWSER) {
				//
				// NFTs this machine receives
				//
				if (tx.isTo(this.publicKey) && !tx.isFrom(this.publicKey)) {
					//
					// update the listing
					//
					let seller = tx.from[1].publicKey;
					let nft_sig = tx.signature;
					let delisting_nfttx_sig = '';

					let nft = new AssetStoreNFT(this.app, this, tx, null);

					//
					// create delisting tx and update our database
					//
					let delisting_nfttx = await this.createDelistAssetTransaction(nft, seller, nft_sig);
					delisting_nfttx_sig = delisting_nfttx.signature;

					//
					// add delisting info to listing
					//
					await this.updateListingStatus(nft_sig, 1, delisting_nfttx_sig);

					//
					// and save the transaction
					//
					this.addTransaction(0, nft_sig, 1, tx); // 0 ==> look-up listing_id

					//
					// and propagate the delisting tx
					//
					this.app.network.propagateTransaction(delisting_nfttx);

					// Broadcast a store update that there is a new listing...
				}
			}

			//
			// add the listing!
			//
			this.updateListings();
		}

		try {
			if (conf == 0) {
				let txmsg = tx.returnMessage();

				if (txmsg.module === 'AssetStore') {
					console.debug('===============', txmsg, '===============');

					if (txmsg.request === 'list asset') {
						if (tx.isTo(this.publicKey)) {
							console.log('===> LIST ASSET');
							await this.receiveListAssetTransaction(tx, blk);
						}
						if (tx.isFrom(this.publicKey) && this.browser_active) {
							siteMessage('Listing confirmed on chain, store processing...', 2000);
							return;
						}
					}

					if (txmsg.request === 'delist asset') {
						if (tx.isTo(this.publicKey) || tx.isFrom(this.publicKey)) {
							console.log('===> DELIST ASSET');
							await this.receiveDelistAssetTransaction(tx, blk);
						}
					}
					if (txmsg.request === 'force delist asset') {
						console.log('F');
						console.log('F');
						console.log('F');
						console.log('F');
						console.log('FORCE DELIST ASSET: ' + this.publicKey);
						if (tx.isTo(this.publicKey) || tx.isFrom(this.publicKey)) {
							console.log('===> FORCE DELIST ASSET');
							await this.receiveForceDelistAssetTransaction(tx, blk);
						}
					}

					if (txmsg.request === 'purchase asset') {
						console.log('===> PURCHASE ASSET');
						await this.receivePurchaseAssetTransaction(tx, blk);
					}

					if (txmsg.request === 'seller_payout') {
						if (this.app.BROWSER && tx.isTo(this.publicKey)) {
							siteMessage('Someone bought your NFT!!!!');
						}
					}
				}
			}
		} catch (err) {
			console.error('ERROR in assetstore onconfirmation block: ', err);
		}
	}

	shouldAffixCallbackToModule(modname, tx = null) {
		if (modname === this.name) {
			return 1;
		}

		if (tx.type === 8) {
			return 1;
		}
		return 0;
	}

	/////////////////////////////
	// HANDLE PEER TRANSACTION //
	/////////////////////////////
	//
	async handlePeerTransaction(app, tx = null, peer, mycallback = null) {
		if (tx == null) {
			return 0;
		}

		let txmsg = tx.returnMessage();

		if (txmsg?.request === 'request listings') {
			console.debug('===============', txmsg, '===============');
			if (this.app.BROWSER != 1 && mycallback != null) {
				mycallback(this.listings);
				return 1;
			}
		}

		if (txmsg?.request === 'request nft image') {
			console.debug('===============', txmsg, '===============');
			let nfttx_sig = txmsg?.data?.nfttx_sig;
			let txs = await new Promise((resolve) => {
				this.app.storage.loadTransactions(
					{ sig: nfttx_sig },
					(txs) => {
						if (Array.isArray(txs) && txs.length > 0) {
							resolve(txs);
							return;
						}
						resolve(null);
					},
					'localhost'
				);
			});

			let txs_to_send = [];

			if (txs != null) {
				if (txs.length > 0) {
					txs_to_send.push(txs[0].serialize_to_web(this.app));
					mycallback(txs_to_send);
				}
			}
		}

		if (txmsg?.request === 'request delist complete') {
			console.debug('===============', txmsg, '===============');
			if (!this.app.BROWSER) {
				let nfttx_sig = txmsg?.data?.nfttx_sig;
				let delist_tx_serialized = txmsg?.data?.nft_tx;

				if (nfttx_sig && delist_tx_serialized) {
					await this.delistAsset(0, tx, nfttx_sig); // 0 = unsure of listing_id

					let delist_tx = new Transaction();
					delist_tx.deserialize_from_web(this.app, delist_tx_serialized);
					await this.app.network.propagateTransaction(delist_tx);
				}
			}
		}

		return super.handlePeerTransaction(app, tx, peer, mycallback);
	}

	/////////////////
	// List Assets //
	/////////////////
	//
	async createListAssetTransaction(opt = {}) {
		let nft = opt.nft;
		let receiver = opt.receiver;
		let reserve_price = opt.reserve_price;
		let title = opt.title;
		let description = opt.description;

		// create the NFT transaction
		//
		let nfttx = await this.app.wallet.createSendNFTTransaction(nft, receiver, 'AssetStore');
		await nfttx.sign();

		//
		// create the wrapper transaction
		//

		// We should add a fee here above and beyond network fees!
		let newtx = await this.app.wallet.createUnsignedTransactionWithDefaultFee(receiver);
		newtx.msg = {
			module: 'AssetStore',
			request: 'list asset',
			data: {
				reserve_price,
				title,
				description,
				nft: nfttx.serialize_to_web(this.app) // a transaction to transfer ownership of nft to store
			}
		};

		await newtx.sign();

		return newtx;
	}

	async receiveListAssetTransaction(tx = null, blk = null) {
		//
		// sanity check transaction is valid
		//
		if (tx == null || blk == null || !tx.isTo(this.publicKey) || this.app.BROWSER) {
			console.warn('Nope out of receiveListAssetTransaction');
			return;
		}

		//
		// unpack the transaction
		//
		let txmsg = tx.returnMessage();

		if (!txmsg?.data?.nft) {
			console.warn('no NFT provided to receiveListAssetTransaction - exiting...');
			return;
		}

		let nfttx = new Transaction();
		nfttx.deserialize_from_web(this.app, txmsg.data.nft);

		//
		// create the NFT
		//
		let nft = new AssetStoreNFT(this.app, this, nfttx);

		//
		// the listing information
		//
		let tx_sig = tx.signature; // signature of wrapping (listAssetTransaction)
		let nft_id = nft.id; // all NFTs created by
		let nfttx_sig = nfttx.signature; // unique value of TX containing NFT that will survive ATR

		//
		// add listing
		//
		let listing_id = await this.insertListingInDB(tx, blk, nfttx, nft);

		//
		// save local in-memory reference
		//
		let record = {
			id: listing_id,
			nft_id: nft_id,
			nfttx_sig: nfttx_sig, // transfer NFT ownership to Store transaction
			tx_sig: tx_sig, //"list asset" transaction
			seller: tx.from[0].publicKey,
			active: 0,
			reserve_price: txmsg?.data?.reserve_price,
			title: txmsg?.data?.title,
			description: txmsg?.data?.description
		};
		this.listings.push(record);

		//
		// save transaction
		//
		this.addTransaction(listing_id, nfttx_sig, 0, tx);

		//
		// and broadcast the embedded NFT tx to transfer it to the NFT Store
		//
		this.app.network.propagateTransaction(nfttx);
	}

	///////////////////
	// Delist Assets //
	///////////////////
	//
	async createDelistAssetTransaction(nft, receiver, nft_sig = '') {
		//
		// create the NFT transaction
		//
		let nfttx = await this.app.wallet.createSendNFTTransaction(nft, receiver, 'AssetStore');
		await nfttx.sign();

		//
		// create the wrapper transaction
		//
		let newtx = await this.app.wallet.createUnsignedTransactionWithDefaultFee(receiver);
		newtx.msg = {
			module: 'AssetStore',
			request: 'delist asset',
			data: {
				nft_tx: nfttx.serialize_to_web(this.app),
				nfttx_sig: nft_sig
			}
		};

		await newtx.sign();

		return newtx;
	}

	async delistAsset(listing_id = 0, tx, nfttx_sig = null, blk = null) {
		//
		// update our listings
		//
		this.updateListingStatus(nfttx_sig, 4); // 4 => delisting / inactive
		this.addTransaction(0, nfttx_sig, 4, tx); // 4 => delisting transaction

		//
		// remove any in-memory record...
		//
		for (let z = 0; z < this.listings.length; z++) {
			if (this.listings[z].nfttx_sig === nfttx_sig) {
				this.listings.active = 4;
			}
		}

		// Broadcast a store update that there one less listing...
	}

	//
	// if the user has not yet received a "delist asset" transaction, they can send
	// a "force delist" transaction that will ask the server to immediately send them
	// the NFT back. this is not supposed to be needed, but there are situations such
	// as if the user attempts to delist immediately AFTER listing and before the store
	// has provided them with the delist transaction that they might attempt to do this
	//
	async createForceDelistAssetTransaction(nft_sig = '') {
		let receiver = this.assetStore?.publicKey;

		//
		// create the delist request
		//
		let newtx = await this.app.wallet.createUnsignedTransactionWithDefaultFee(receiver);
		newtx.msg = {
			module: 'AssetStore',
			request: 'force delist asset',
			data: {
				nfttx_sig: nft_sig
			}
		};
		await newtx.sign();

		return newtx;
	}
	async receiveForceDelistAssetTransaction(tx, blk = null) {
		try {
			if (!tx) {
				return;
			}

			let txmsg = tx.returnMessage();
			if (!txmsg?.data?.nfttx_sig) {
				console.warn('receiveDelistAssetTransaction: missing nft or nfttx_sig');
				return;
			}

			let nfttx_sig = txmsg.data.nfttx_sig;
			let listing = await this.returnListing(nfttx_sig);

			if (!listing?.active == 0) {
				console.log('ERROR: requested to force delist ' + nfttx_sig + ' but do not have it');
				return;
			}

			let seller = listing.seller || '';

			//
			// only delete if seller is listed
			//
			if (seller != '' && tx.isFrom(seller)) {
				console.log('seller is 1: ' + seller);

				let txs = await new Promise((resolve) => {
					this.app.storage.loadTransactions(
						{ sig: nfttx_sig },
						(txs) => {
							if (Array.isArray(txs) && txs.length > 0) {
								resolve(txs);
								return;
							}
							resolve(null);
						},
						'localhost'
					);
				});

				console.log('seller is 2: ' + seller);

				if (txs.length > 0) {
					let nfttx = txs[0];

					let nfttx_msg = nfttx.returnMessage();

					console.log('txmsg of this nft is: ' + JSON.stringify(nfttx_msg));

					let nft = new SaitoNFT(this.app, this, nfttx);

					//
					// create the return transfer
					//
					console.log('about se send nft to: ' + seller);
					let delist_nfttx = await this.app.wallet.createSendNFTTransaction(nft, seller);

					console.log('after we have created this tx...');

					await delist_nfttx.sign();
					this.app.network.propagateTransaction(delist_nfttx);

					console.log('#########');
					console.log('#########');
					console.log('#########');
					console.log('#########');
					console.log('######### FORCE DELIST PROCESSED BY SERVER');
					console.log('#########');
					console.log('#########');
				}
			}

			//
			let nfttx = await this.app.wallet.createSendNFTTransaction(nft, receiver, 'AssetStore');
			await nfttx.sign();
		} catch (err) {
			console.error('receiveDelistAssetTransaction error:', err);
		}
	}

	//
	// this receives the "delisting" transaction, but the de-listing
	// WILL NOT HAPPEN until / unless it is broadcast. so this function
	// needs to have the original seller CACHE the transaction for
	// later broadcast if/when they decide they want to actually
	// terminate the auction.
	//
	async receiveDelistAssetTransaction(tx, blk = null) {
		try {
			if (!tx) {
				return;
			}

			let txmsg = tx.returnMessage();
			if (!txmsg?.data?.nft_tx || !txmsg?.data?.nfttx_sig) {
				console.warn('receiveDelistAssetTransaction: missing nft or nfttx_sig');
				return;
			}

			let inner = new Transaction();
			inner.deserialize_from_web(this.app, txmsg.data.nft_tx);

			//
			// this is the ID of the item under auction, which is the
			// sig of the transaction that broadcast the NFT to the
			// AssetStore and created the unique ID associated with the
			// listing
			//
			let nfttx_sig = txmsg.data.nfttx_sig;

			//
			// at this point, we need the user to cache the transaction somewhere
			// so that when they view the listing in the AssetStore the UI shows
			// that they can delist the auction, which is done by broadcasting the
			// transaction-within-a-transaction which will transfer ownership back
			// to us.
			//

			if (this.app.BROWSER) {
				this.drafts[nfttx_sig] = txmsg.data.nft_tx; // serialized inner tx
				console.debug('STORE: saving drafts: ', this.drafts);
				await this.app.storage.setLocalForageItem('listed_nfts', this.drafts);
			} else {
				let raw = await this.app.wallet.getNFTList();
				console.debug('STORE: Server nfts (after delist tx 2): ', raw);
			}

			// Do NOT broadcast here; actual delist happens when user clicks “Delist”
		} catch (err) {
			console.error('receiveDelistAssetTransaction error:', err);
		}
	}

	///////////////////
	// Retreive records //
	///////////////////
	//
	async createWeb3CryptoPurchase(nft, opts = {}) {
		//
		// nft: { id, slip1, slip2, slip3, amount, nft_sig, seller }
		// opts: { price, fee }
		//

		//
		// price and fee
		//
		let price = nft.getBuyPriceSaito();
		let fee = this?.fee ?? 0;
		let total_price =
			BigInt(this.app.wallet.convertSaitoToNolan(price)) +
			BigInt(this.app.wallet.convertSaitoToNolan(fee));
		if (total_price <= 0) {
			throw new Error('total price must be > 0');
		}

		//
		// the payment is made to the AssetStore, which controls the NFT
		// and will collect the payment and re-sign the payment to the
		// seller if the auction succeeds, or refund the payment to the
		// buyer if it does not.
		//
		let seller = await nft.getSeller();
		if (!seller) {
			throw new Error('seller public key is required');
		}

		//
		// pay to assetstore first, assetstore then pays seller after due delligence
		//
		let to_address = this.assetStore.publicKey;
		let newtx = await this.app.wallet.createUnsignedTransactionWithDefaultFee(
			to_address,
			BigInt(0)
		);

		//
		// sanity check
		//
		newtx.msg = {
			module: this.name,
			request: 'purchase asset',
			amount: total_price,
			from: this.publicKey,
			to: to_address,
			nft_sig: nft.tx_sig,
			refund: this.publicKey,
			price: String(price),
			fee: String(fee)
		};
		await newtx.sign();
		return newtx;
	}

	async createPurchaseAssetTransaction(nft, opts = {}) {
		//
		// nft: { id, slip1, slip2, slip3, amount, nft_sig, seller }
		// opts: { price, fee }
		//
		let balance = this.app.wallet.returnBalance('SAITO');

		//
		// price and fee
		//
		let price = nft.getBuyPriceSaito();
		let fee = this?.fee ?? 0;

		let total_price =
			BigInt(this.app.wallet.convertSaitoToNolan(price)) +
			BigInt(this.app.wallet.convertSaitoToNolan(fee));

		let total_balance = BigInt(this.app.wallet.convertSaitoToNolan(balance));

		if (total_balance < total_price) {
			salert('Not enough balance in wallet');
			return;
		}

		if (total_price <= 0) {
			alert('ERROR: price seems to be negative? Please report issue...');
			return;
		}

		//
		// pay to assetstore first, assetstore then pays seller after due delligence
		//
		let to_address = this.assetStore.publicKey;
		let newtx = await this.app.wallet.createUnsignedTransactionWithDefaultFee(
			to_address,
			total_price
		);

		//
		// sanity check
		//
		newtx.msg = {
			module: this.name,
			request: 'purchase asset',
			amount: total_price,
			from: this.publicKey,
			to: to_address,
			nft_sig: nft.tx_sig,
			refund: this.publicKey,
			price: String(price),
			fee: String(fee)
		};

		await newtx.sign();
		return newtx;
	}

	async receivePurchaseAssetTransaction(tx, blk = null) {
		if (this.app.BROWSER) {
			return;
		}

		let txmsg = tx.returnMessage?.() || {};
		let buyer = txmsg.from || tx.from[0].publicKey;
		let nfttx_sig = txmsg.nft_sig;
		let price = BigInt(this.app.wallet.convertSaitoToNolan(txmsg.price) ?? 0);
		let fee = BigInt(this.app.wallet.convertSaitoToNolan(txmsg.fee) ?? 0);
		let total = price + fee;

		if (!buyer || !nfttx_sig) {
			console.warn('Purchase: missing buyer or nfttx_sig');
			return;
		}
		if (price <= 0n) {
			console.warn('Purchase: invalid price/fee');
			return;
		}

		let amount_paid = 0n;
		for (let o of tx.to || []) {
			if (o?.publicKey === this.publicKey) {
				let a = typeof o.amount === 'bigint' ? o.amount : BigInt(o.amount ?? 0);
				amount_paid += a;
			}
		}

		//
		// confirm listing is active
		//
		let listing = await this.returnListing(nfttx_sig, 1);

		if (!listing?.active == 1) {
			console.warn('Purchase: listing not active or not found');
			//
			// return amount back to buyer if listing is not active
			//
			await this.refundBuyer(buyer, nfttx_sig, amount_paid, 'listing-not-active', blk);
			return;
		}

		//
		// verify the payment to this server equals price+fee
		//
		if (amount_paid < total) {
			console.warn(`Purchase: underpaid. got=${amount_paid} need=${total}`);

			//
			// refund amount back to buyer if amount is insufficent for purchase
			//
			await this.refundBuyer(buyer, nfttx_sig, amount_paid, 'underpaid', blk);
			return;
		}

		//
		// check reserve price
		//
		let reserve = BigInt(this.app.wallet.convertSaitoToNolan(listing?.reserve_price) ?? 0);

		if (price < reserve) {
			console.warn(`Purchase: below reserve. price=${price} reserve=${reserve}`);
			await this.refundBuyer(buyer, nfttx_sig, amount_paid, 'below-reserve', blk);
			return;
		}

		//
		// Check if NFT still owned by server wallet
		// Refund if not
		//

		let nft_id = listing.nft_id;
		let owned_nft = null;
		let raw = await this.app.wallet.getNFTList();

		let list = typeof raw === 'string' ? JSON.parse(raw) : raw;
		let nft_owned = (list || []).find((n) => n.id === nft_id && n?.tx_sig === nfttx_sig);

		if (!nft_owned) {
			console.warn('Purchase: server does not hold the NFT');
			await this.refundBuyer(buyer, nfttx_sig, amount_paid, 'nft-not-held', blk);
			return;
		}

		let nft = new AssetStoreNFT(this.app, this, null, nft_owned);

		//
		// transfer NFT to buyer
		//
		let nft_tx = await this.app.wallet.createSendNFTTransaction(nft, buyer);

		//
		// if nft_tx.msg is null, that means we haven't actually put the NFT into the
		// transaction, which indicates an error which should trigger a refund.
		//
		if (!nft_tx.msg) {
			await this.refundBuyer(buyer, nfttx_sig, amount_paid, 'fulfillment-not-possible', blk);
			return;
		}

		await nft_tx.sign();
		this.app.network.propagateTransaction(nft_tx);

		//
		// update db and mark listing sold
		//
		await this.updateListingStatus(nfttx_sig, 2);
		await this.addTransaction(0, nfttx_sig, 1, nft_tx, blk);
		await this.addTransaction(0, nfttx_sig, 2, tx, blk);

		//
		// payout to seller
		//
		let seller = listing.seller;

		try {
			let payout_tx = await this.app.wallet.createUnsignedTransaction(seller, price, BigInt(0));
			payout_tx.msg = { module: this.name, request: 'seller_payout', nfttx_sig };
			await payout_tx.sign();
			this.app.network.propagateTransaction(payout_tx);

			await this.addTransaction(0, nfttx_sig, 3, payout_tx, blk);
		} catch (e) {
			console.error('Seller payout failed:', e);
		}

		// Broadcast listing updates...
	}

	async refundBuyer(buyer, nft_sig, amount, reason, blk) {
		if (!buyer || !nft_sig || amount <= 0n) return;
		try {
			let refund_tx = await this.app.wallet.createUnsignedTransaction(buyer, amount, BigInt(0));
			refund_tx.msg = { module: this.name, request: 'purchase_refund', reason, nft_sig };
			await refund_tx.sign();
			this.app.network.propagateTransaction(refund_tx);

			//
			// add refund tx to transaction table
			//
			await this.addTransaction(0, nft_sig, 5, refund_tx, blk);
		} catch (e) {
			console.error('Refund failed:', e);
		}
	}

	webServer(app, expressapp, express) {
		let webdir = `${__dirname}/../../mods/${this.dirname}/web`;
		let assetstore_self = this;

		expressapp.get('/' + encodeURI(this.returnSlug()), async function (req, res) {
			let reqBaseURL = req.protocol + '://' + req.headers.host + '/';

			let updatedSocial = Object.assign({}, assetstore_self.social);

			let html = AssetStoreHome(app, assetstore_self, app.build_number, updatedSocial);
			if (!res.finished) {
				res.setHeader('Content-type', 'text/html');
				res.charset = 'UTF-8';
				return res.send(html);
			}
			return;
		});

		expressapp.use('/' + encodeURI(this.returnSlug()), express.static(webdir));
	}

	//
	// servers refresh from database
	//
	async restoreListingsFromDB() {
		if (!this.app.BROWSER) {
			let sql = `SELECT t.* from listings t JOIN ( SELECT nft_id , MIN(reserve_price) AS min_reserve_price FROM listings GROUP BY nft_id ) kept ON t.nft_id = kept.nft_id AND t.reserve_price = kept.min_reserve_price AND t.status = 1`;
			//			let sql = `SELECT * FROM listings WHERE status = 1`;
			let params = {};
			let res = await this.app.storage.queryDatabase(sql, params, this.dbname);
			let nlistings = [];

			for (let i = 0; i < res.length; i++) {
				nlistings.push({
					id: res[i].id,
					nft_id: res[i].nft_id,
					nfttx_sig: res[i].nfttx_sig,
					seller: res[i].seller,
					active: 1, // Status
					reserve_price: res[i].reserve_price,
					title: res[i].title,
					description: res[i].description
				});
			}

			this.listings = nlistings;
		}
	}

	updateListings() {
		if (this.browser_active) {
			this.app.connection.emit('assetstore-render-listings');
		}
	}

	//
	// Database Inserts
	//
	async insertListingInDB(tx, blk, nfttx, nft) {
		//
		//  id INTEGER PRIMARY KEY AUTOINCREMENT,
		//  nft_id TEXT DEFAULT '' ,                      // NFT ID common to all NFTs (slip1 + slip3)
		//  nfttx_sig TEXT DEFAULT '' ,                   // NFT SHARD ID unique to this transferred
		//  delisting_nfttx_sig TEXT DEFAULT ''           // NFT SHARD ID of delisting tx
		//  status INTEGER DEFAULT 0 ,                    // 0 => nft created, but not-active
		//		                                  // 1 => nft received, active
		//        		                          // 2 => nft sold, inactive
		//        		                          // 3 => nft transferred, inactive
		//      		 	                  // 4 => nft delisted, inactive
		//  seller TEXT DEFAULT '' ,
		//  buyer TEXT DEFAULT '' ,
		//  created_at INTEGER DEFAULT 0 ,
		//  reserve_price INTEGER DEFAULT 0
		//

		let txmsg = tx.returnMessage();
		let status = 0;
		let seller = tx.from[0].publicKey;
		let created_at = new Date().getTime();
		let reserve_price = txmsg.data.reserve_price;
		let title = txmsg?.data?.title || '';
		let description = txmsg?.data?.description || '';

		let sql = `
		  INSERT INTO listings (nft_id, nfttx_sig, status, seller, buyer, reserve_price, title, description)
		  VALUES ($nft_id, $nfttx_sig, $status, $seller, $buyer, $reserve_price, $title, $description)
		`;
		let params = {
			$nft_id: nft.id,
			$nfttx_sig: nfttx.signature,
			$status: 0,
			$seller: seller,
			$buyer: '',
			$title: title,
			$description: description,
			$reserve_price: reserve_price ?? null
		};

		let res = await this.app.storage.runDatabase(sql, params, this.dbname);

		return res.lastID;
	}

	async updateListingStatus(nfttx_sig, status = 0, delisting_nfttx_sig = '') {
		if (delisting_nfttx_sig == '') {
			let sql = `UPDATE listings SET status = $status WHERE nfttx_sig = $nfttx_sig`;
			let params = {
				$status: status,
				$nfttx_sig: nfttx_sig
			};

			let res = await this.app.storage.runDatabase(sql, params, this.dbname);
		} else {
			let sql2 = `UPDATE listings SET status = $status , delisting_nfttx_sig = $delisting_nfttx_sig WHERE nfttx_sig = $nfttx_sig`;
			let params2 = {
				$status: status,
				$nfttx_sig: nfttx_sig,
				$delisting_nfttx_sig: delisting_nfttx_sig
			};
			let res2 = await this.app.storage.runDatabase(sql2, params2, this.dbname);
		}

		return;
	}

	returnListing(nfttx_sig) {
		for (let i = 0; i < this.listings.length; i++) {
			if (this.listings[i].nfttx_sig == nfttx_sig) {
				return this.listings[i];
			}
		}
		return null;
	}

	async addTransaction(listing_id = 0, nfttx_sig = '', tx_type = 0, tx = null, blk = null) {
		if (tx == null) {
			return;
		}

		let lc = 0;
		let bsh = '';
		let bid = 0;
		let tid = 0;
		let sender = '';
		let receiver = '';
		let tx_json = tx.serialize_to_web(this.app);

		//
		// Bound Transaction
		//
		if (tx.type == 8) {
			if (tx.from.length > 0) {
				if (tx.from.length > 2) {
					sender = tx.from[1].publicKey;
				} else {
					sender = tx.from[0].publicKey;
				}
			}
			if (tx.to.length > 2) {
				receiver = tx.to[1].publicKey;
			} else {
				receiver = tx.to[0].publicKey;
			}
		}

		//
		// add blockchain data if available
		//
		if (blk != null) {
			lc = 1;
			bsh = blk.hash;
			bid = blk.id;
			tid = tx.id;
		}

		//
		// fetching listing_id if not provided
		//
		if (listing_id == 0) {
			let pre_sql = `SELECT * FROM listings WHERE nfttx_sig = $nfttx_sig`;
			let pre_params = {
				$nfttx_sig: nfttx_sig
			};
			let rows = await this.app.storage.queryDatabase(pre_sql, pre_params, this.dbname);
			if (rows.length == 0) {
				return;
			}

			listing_id = rows[0].id;
		}

		//
		//  id INTEGER DEFAULT '' ,
		//  listing_id INTEGER DEFAULT 0 ,
		//  tx TEXT DEFAULT '' ,
		//  tx_sig TEXT DEFAULT '' ,
		//  sender TEXT DEFAULT '',
		//  recipient TEXT DEFAULT '',
		//  tx_type INTEGER DEFAULT 0 ,         // 0 = listing transaction
		//		                        // 1 = NFT transfer
		//		                        // 2 = inbound payment for NFT
		//                                      // 3 = outbound payment for sale
		//                                      // 4 = delisting transaction
		//  lc INTEGER DEFAULT 0,
		//  bsh TEXT DEFAULT '' ,
		//  bid INTEGER DEFAULT 0,
		//  tid TEXT DEFAULT '' ,
		//  UNIQUE (tx_sig) ,
		//  PRIMARY KEY(id ASC)
		//
		let sql = `INSERT INTO transactions (
			listing_id, 
			tx, 
			tx_sig, 
			sender, 
			recipient, 
			tx_type, 
			lc, 
			bsh, 
			bid, 
			tid
		) VALUES (
			$listing_id, 
			$tx, 
			$tx_sig, 
			$sender, 
			$recipient, 
			$tx_type, 
			$lc, 
			$bsh, 
			$bid, 
			$tid
		)`;

		let params = {
			$listing_id: listing_id,
			$tx: tx_json,
			$tx_sig: tx.signature,
			$sender: sender,
			$recipient: receiver,
			$tx_type: tx_type,
			$lc: lc,
			$bsh: bsh,
			$bid: bid,
			$tid: tid
		};
		await this.app.storage.runDatabase(sql, params, this.dbname);

		return;
	}
}

module.exports = AssetStore;
