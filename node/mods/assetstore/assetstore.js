const PeerService = require('saito-js/lib/peer_service').default;
const Transaction = require('../../lib/saito/transaction').default;
const saito = require('./../../lib/saito/saito');
const ModTemplate = require('../../lib/templates/modtemplate');
const AssetStoreMain = require('./lib/main/main');
const SaitoHeader = require('./../../lib/saito/ui/saito-header/saito-header');
const AssetStoreHome = require('./index');

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
		this.slug = 'assetstore';
		this.description =
			'NFT Interface for creating and joining games coded for the Saito Open Source Game Engine.';
		this.categories = 'Utility Ecommerce NFTs';
		this.icon = 'fa-solid fa-cart-shopping';

		this.nfts = {};
		this.auction_list = [];
		this.purchaseFee = 0;

		this.styles = ['/assetstore/style.css'];

		this.assetStore = { publicKey: '', peerIndex: null };

		this.social = {
			twitter: '@SaitoOfficial',
			title: '🟥 Saito AssetStore',
			url: 'https://saito.io/assetstore/',
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
		// compile list of assetstore games
		//
		app.modules.returnModulesRespondingTo('assetstore-games').forEach((game_mod) => {
			this.assetstore_games.push(game_mod);
			//
			// and listen to their transactions
			//
			this.affix_callbacks_to.push(game_mod.name);
		});

		if (!this.app.BROWSER) {
			let sql = 'SELECT * FROM listings WHERE active = 1';
			let params = {};

			this.auction_list = await this.app.storage.queryDatabase(sql, params, 'assetstore');
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
		if (!this.browser_active) {
			return;
		}

		if (service.service === 'AssetStore') {
			//
			// Save store info
			//
			this.assetStore.publicKey = peer.publicKey;
			this.assetStore.peerIndex = peer.peerIndex;

			this.sendQueryAssetsTransaction((records) => {
				console.log('onPeerServiceUp records: ', records);
				this.auction_list = records;
				this.app.connection.emit('assetstore-render-auction-list-request');
			});
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
			let x = [];
			if (!this.browser_active) {
				x.push({
					text: 'Store',
					icon: 'fa-solid fa-cart-shopping',
					rank: 15,
					type: 'navigation', // Group similar icons in wallet
					callback: function (app, id) {
						navigateWindow('/assetstore');
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
	async onConfirmation(blk, tx, conf) {
		//
		// sanity check
		//
		if (this.hasSeenTransaction(tx)) {
			return;
		}

		//
		// Bound Transactions (monitor NFT transfers)
		//
		if (tx.type == 8) {
			//
			// ignore "create nft" txs with < 3 from slips
			//
			if (tx.from.length < 3) {
				return;
			}

			//
			// monitor nfts sent to me
			//
			// these are mostly likely the embedded NFTs that we are sent on listing
			// and that we have broadcast ourselves to transfer control to the Asset
			// Store. we monitor them in order to update the status of the auction
			// so that the listing is live.
			//
			if (tx.isTo(this.publicKey) && !tx.isFrom(this.publicKey)) {

				//
				// update the listing
				//
				let seller = tx.from[1].publicKey;
				let nft_sig = tx.signature;
				let delisting_nfttx_sig = "";
				

				let nft = new SaitoNft(this.app, this);
				nft.createFromTx(tx);


				//
				// creating the "delisting" nfttx and update our database
				// with that information (updateListingStatus()) and then
				// broadcast that delisting transaction back to the user
				//
				let delisting_nfttx = await this.createDelistAssetTransaction(nft, seller, nft_sig);
				delisting_nfttx_sig = delisting_nfttx.signature;

				//
				// updating listing status, including delisting tx info
				//
				await this.updateListingStatus(nft_sig, 1, delisting_nfttx_sig);

				//
				// and save the transaction
				//
				this.addTransaction(0, nfttx_sig, 1, tx); // 0 ==> look-up listing_id
									  // 1 ==> inbound nft transfer

				//
				// and propagate the delisting tx
				//
				this.app.network.propagateTransaction(delisting_nfttx);

			}

			//
			// monitor NFTs that were send FROM me. in this case we observe that the 
			// transfer will either be fulfillment of a SALE or a delisting transaction
			// that is removing the asset from the AssetStore.
			//
			if (tx.isFrom(this.publicKey) && !tx.isTo(this.publicKey)) {

				//
				// if this transacton is FROM me, we call delistAsset()
				// and that lets us update the appropriate listing to 
				// remove the auction...
				//
				this.delistAsset(0, tx, blk); // 0 = unsure of listing_id

			}


			//
			// if we are sending the NFT to someone else
			//
			if (!tx.isTo(this.publicKey) && tx.isFrom(this.publicKey)) {
				console.debug('Agora: noticed a NFT transaction from me');
				//
				// do nothing for now...
				//
			}
		}

		try {
			if (conf == 0) {
				let txmsg = tx.returnMessage();

				console.log('Agora: onConfirmation: ', txmsg.module, txmsg.request);

				if (txmsg.module === 'AssetStore') {
					if (txmsg.request === 'list asset') {
						if (tx.isTo(this.publicKey)) {
							console.log('===> LIST ASSET');
							await this.receiveListAssetTransaction(tx, blk);
						}
					}

					if (txmsg.request === 'delist asset') {
						if (tx.isTo(this.publicKey) || tx.isFrom(this.publicKey)) {
							console.log('===> DELIST ASSET');
							await this.receiveDelistAssetTransaction(tx, blk);
						}
					}

					if (txmsg.request === 'create_purchase_asset_transaction') {
						await this.receivePurchaseAssetTransaction(tx, blk);
					}

					if (this.app.BROWSER) {
						this.updateAuctionList();
					}
				}
			}
		} catch (err) {
			console.error('ERROR in assetstore onconfirmation block: ', err);
		}
	}

	/////////////////////////////
	// HANDLE PEER TRANSACTION //
	/////////////////////////////
	//
	async handlePeerTransaction(app, tx = null, peer, mycallback = null) {
		if (tx == null) return 0;
		const txmsg = tx.returnMessage();

		if (txmsg?.request === 'query assets') {
			console.log('==> query assets');
			return this.receiveQueryAssetsTransaction(mycallback);
		}

		return super.handlePeerTransaction(app, tx, peer, mycallback);
	}

	updateAuctionList() {
		this.sendQueryAssetsTransaction((records) => {
			console.log('updateAuctionList records: ', records);
			this.auction_list = records;
			this.app.connection.emit('assetstore-build-auction-list-request');
		});
	}

	/////////////////
	// List Assets //
	/////////////////
	//
	async createListAssetTransaction(nft, receiver, reserve_price=0) {

		//
		// create the NFT transaction
		//
		let nfttx = await this.app.wallet.createSendNftTransaction(nft, receiver);
		nfttx.sign();

		//
		// create the wrapper transaction
		//
		let newtx = await this.app.wallet.createUnsignedTransactionWithDefaultFee(receiver);
		newtx.msg = {
			module: 'AssetStore',
			request: 'list asset',
			data: {
				reserve_price,
				nft: nfttx.serialize_to_web(this.app) // a transaction to transfer ownership of nft to store
			}
		};
		newtx.type = 0;

		newtx.packData();
		await newtx.sign();

		return newtx;
	}

	async receiveListAssetTransaction(tx, blk = null) {

		//
		// sanity check transaction is valid
		//
		if (tx == null || blk == null) {
			console.warn('Nope out of addListing');
			return;
		}


console.log("RECEIVE LIST ASSET TRANSACTION 1");

		//
		// unpack the transaction
		//
		let txmsg = tx.returnMessage();
		let nfttx = new Transaction();
		if (!txmsg.data) {
			if (!txmsg.data.nft) {
				console.warn('no NFT provided to receiveListAssetTransaction - exiting...');
				return;
			}
		}
		nfttx.deserialize_from_web(this.app, txmsg.data.nft);
console.log("RECEIVE LIST ASSET TRANSACTION 2");

		//
		// create the NFT
		//
		let nft = new SaitoNft(this.app, this);
		nft.createFromTx(nfttx);

console.log("RECEIVE LIST ASSET TRANSACTION 3");

		//
		// the listing information
		//
		let tx_sig = tx.signature;		// signature of wrapping
		let nft_id = nft.returnId();		// all NFTs created by 
		let nfttx_sig = nfttx.signature;	// unique value of TX containing NFT that will survive ATR

		//
		// add listing
		//
		let listing_id = await this.addListing(tx, blk, nfttx, nft);
console.log("RECEIVE LIST ASSET TRANSACTION 4");

		//
		// save transaction
		//
		this.addTransaction(listing_id, nfttx_sig, 0, tx);

console.log("RECEIVE LIST ASSET TRANSACTION 5");

		//
		// save local in-memory reference
		//
		const record = {
			id: listing_id ,
			nft_id: nft_id ,
			nfttx_sig: nfttx_sig ,
			tx_sig: tx_sig ,
			seller: tx.from[0].publicKey,
			active: 0,
			reserve_price: txmsg.data.reserve_price
		};
		this.auction_list.push(record);

		//
		// and broadcast the embedded NFT tx to transfer it to the NFT Store
		//
		this.app.network.propagateTransaction(nfttx);

	}



	async activateListing(seller = '', tx_sig = '') {
		//
		// update listing
		//
		const sql = `UPDATE listings SET active = $active WHERE tx_sig = $tx_sig AND seller = $seller`;
		let params = {
			$active: 1,
			$tx_sig: tx_sig,
			$seller: seller
		};

		const res = await this.app.storage.runDatabase(sql, params, 'assetstore');

		for (let i = 0; i < this.auction_list.length; i++) {
			if (this.auction_list[i].tx_sig == tx_sig) {
				this.auction_list[i].active = 1;
			}
		}

		return;
	}

	///////////////////
	// Delist Assets //
	///////////////////
	//
	async createDelistAssetTransaction(nft, receiver, nft_sig="") {

		//
		// create the NFT transaction
		//
		let nfttx = await this.app.wallet.createSendNftTransaction(nft, receiver);
		nfttx.sign();

		//
		// create the wrapper transaction
		//
		let newtx = await this.app.wallet.createUnsignedTransactionWithDefaultFee(receiver);
		newtx.msg = {
			module: 'AssetStore',
			request: 'delist asset',
			data: {
				nft : nfttx.serialize_to_web(this.app) ,
				nft_sig : nft_sig 
			}
		};
		newtx.type = 0;
		newtx.packData();
		await newtx.sign();

		return newtx;

	}

	async delistAsset(listing_id=0, tx, blk) {

		let nfttx_sig = "";

		if (listing_id == 0) {
			const pre_sql = `SELECT listing_id , nfttx_sig FROM listings WHERE delisting_nfttx_sig = $delisting_nfttx_sig`;
			const pre_params = {
				$delisting_nfttx_sig: tx.signature ,
			};
			let rows = await this.app.storage.runDatabase(pre_sql, pre_params, 'assetstore');
			if (rows.length == 0) { return; }
			listing_id = rows[0].id;
			nfttx_sig = rows[0].nfttx_sig;
		}

		//
		// update our listings
		//
		this.updateListingStatus(nfttx_sig, 4); // 4 => delisting / inactive
		this.addTransaction(0, nfttx_sig, 4, tx); // 4 => delisting transaction

console.log("RECEIVE DELIST ASSET TRANSACTION 5");

		//
		// remove any in-memory record...
		//
		for (let z = 0; z < this.active_listings.length; z++) {
			if (this.active_listings[z].nfttx_sig === nft_sig) {
				this.active_listings.splice(z, 1);
				z--;
			}
		}

	}

	//
	// this receives the "delisting" transaction, but the de-listing
	// will not happen until / unless it is broadcast. so this function 
	// needs to have the original seller CACHE the transaction for 
	// later broadcast if/when they decide they want to actually 
	// terminate the auction.
	//
	async receiveDelistAssetTransaction(tx, blk = null) {
		try {

console.log("RECEIVE DELIST ASSET TRANSACTION 1");
			//
			// sanity check transaction is valid
			//
			if (tx == null || blk == null) { return; }

console.log("RECEIVE DELIST ASSET TRANSACTION 2");
			//
			// unpack the transaction
			//
			let txmsg = tx.returnMessage();
			let nfttx = new Transaction();
			if (!txmsg.data) {
				if (!txmsg.data.nft) {
					console.warn('no NFT provided to receiveDelistAssetTransaction - exiting...');
					return;
				}
				if (!txmsg.data.nft_sig) {
					console.warn('no NFT_SIG provided to receiveDelistAssetTransaction - exiting...');
					return;
				}
			}
			nfttx.deserialize_from_web(this.app, txmsg.data.nft);

console.log("RECEIVE DELIST ASSET TRANSACTION 3");

			//
			// create the NFT
			//
			let nft = new SaitoNft(this.app, this);
			nft.createFromTx(nfttx);

console.log("RECEIVE DELIST ASSET TRANSACTION 4");

			//
			// this is the ID of the item under auction, which is the 
			// sig of the transaction that broadcast the NFT to the 
			// AssetStore and created the unique ID associated with the 
			// listing
			//
			let nft_sig = txmsg.data.nft_sig;
			let nft_id = nft.returnId();

console.log("RECEIVE DELIST ASSET TRANSACTION 6");
			//
			// at this point, we need the user to cache the transaction somewhere
			// so that when they view the listing in the AssetStore the UI shows 
			// that they can delist the auction, which is done by broadcasting the
			// transaction-within-a-transaction which will transfer ownership back
			// to us.
			//
			// this transfer is done by:
			//
			// app.network.propagateTransaction(nfttx);
			//

		} catch (err) {
			console.error('receiveDelistAssetTransaction error:', err);
		}
	}

	///////////////////
	// Retreive records //
	///////////////////
	//
	async sendQueryAssetsTransaction(mycallback = null) {
		let this_self = this;

		if (this.assetStore.peerIndex) {
			this.app.network.sendRequestAsTransaction(
				'query assets',
				{},
				mycallback,
				this.assetStore.peerIndex
			);
		}
	}

	async receiveQueryAssetsTransaction(mycallback = null) {
		if (mycallback == null) {
			console.warn('No callback');
			return 0;
		}
		if (this.app.BROWSER == 1) {
			console.warn("Browsers don't support backup/recovery");
			return 0;
		}

		if (mycallback) {
			mycallback(this.auction_list);
			return 1;
		} else {
			console.warn('No callback to process assestore records');
		}

		return 0;
	}

	///////////////////
	// Retreive records //
	///////////////////
	//
	async createPurchaseAssetTransaction(nft, opts = {}) {
		// nft: { id, slip1, slip2, slip3, amount, seller? }
		// opts: { price, fee }

		console.log('purchase nft: ', nft);

		const price = BigInt(opts?.price ?? 0);
		const fee = BigInt(opts?.fee ?? 0);
		if (price <= 0n) {
			throw new Error('price must be > 0');
		}
		if (fee < 0n) {
			throw new Error('fee must be >= 0');
		}

		const total = price + fee;

		const seller = nft?.seller || opts?.seller;
		if (!seller) {
			throw new Error('seller public key is required');
		}

		console.log('createPurchaseAssetTransaction 1///');

		// create inner tx from buyer
		let nolan_amount = this.app.wallet.convertSaitoToNolan(total);

		console.log('nolan amount : ////////', nolan_amount);
		console.log('createPurchaseAssetTransaction 2///');
		let newtx = await this.app.wallet.createUnsignedTransactionWithDefaultFee(seller, nolan_amount);

		newtx.msg = {
			module: this.name,
			request: 'crypto payment',
			amount,
			from: this.publicKey,
			to: seller
		};

		newtx.packData();
		await newtx.sign();

		console.log('createPurchaseAssetTransaction 3///');

		// create tx to send to server
		let paytx = await this.app.wallet.createUnsignedTransactionWithDefaultFee();
		const txmsg = {
			module: 'AssetStore',
			request: 'purchase_asset_transaction',
			nft_id: nft.id,
			seller,
			price: String(price), // keeping as string to avoid JSON bigint issues
			fee: String(fee),

			tx: newtx.serialize_to_web(this.app)
		};

		if (nft.image) txmsg.image = nft.image;
		if (nft.text) txmsg.text = nft.text;

		paytx.msg = txmsg;
		paytx.packData();
		await paytx.sign();

		return paytx;
	}

	async receivePurchaseAssetTransaction(tx, blk = null) {
		try {
			if (this.app.BROWSER) return;

			const txmsg = tx.returnMessage();

			let buytx = new Transaction();
			buytx.deserialize_from_web(this.app, txtxmsg.tx);

			const buyer = tx.from?.[0]?.publicKey || tx.returnSender();
			const nft_id = txmsg.nft_id;
			const seller = txmsg.seller;
			const price = BigInt(txmsg.price ?? 0);
			const fee = BigInt(txmsg.fee ?? 0);
			if (!nft_id || !seller) {
				console.warn('Purchase: missing nft_id/seller');
				return;
			}
			if (price <= 0n || fee < 0n) {
				console.warn('Purchase: invalid price/fee');
				return;
			}

			// Verify record exists & active & belongs to seller
			const rows = await this.app.storage.queryDatabase(
				'SELECT * FROM listings WHERE nft_id = $nft_id AND seller = $seller AND active = 1 LIMIT 1',
				{ $nft_id: nft_id, $seller: seller },
				'assetstore'
			);
			if (!rows || rows.length === 0) {
				console.warn('Purchase: record not found / not active / wrong seller');
				return;
			}

			// Verify module currently controls the NFT (like your delist)
			const raw = await this.app.wallet.getNftList();
			const list = Array.isArray(raw)
				? raw
				: typeof raw === 'string'
					? JSON.parse(raw || '[]')
					: [];
			const nft_owned = (list || []).find((n) => n.id === nft_id);
			if (!nft_owned) {
				console.warn('Purchase: module wallet does not hold the NFT right now');
				return;
			}

			// Verify if payment done to AssetStore
			const total = price + fee;
			const paidToMe = this.amountToMe(tx);
			if (paidToMe < total) {
				console.warn(`Purchase: insufficient payment to module. got=${paidToMe} need=${total}`);
				return;
			}

			// Create NFT transfer to buyer (bound send)
			const slip1key = nft_owned.slip1?.utxo_key;
			const slip2key = nft_owned.slip2?.utxo_key;
			const slip3key = nft_owned.slip3?.utxo_key;
			const amount = BigInt(nft_owned.slip2?.amount ?? 0);
			if (!slip1key || !slip2key || !slip3key) {
				console.warn('Purchase: missing slip keys for owned NFT');
				return;
			}
			if (amount <= 0n) {
				console.warn('Purchase: NFT amount is zero/invalid');
				return;
			}

			let obj = {};
			if (msg.image) obj.image = msg.image;
			if (msg.text) obj.text = msg.text;

			const txMsg = {
				data: obj,
				module: 'AssetStore',
				request: 'send nft'
			};

			const nftMsg = {
				data: txMsg,
				module: 'AssetStore',
				request: 'send nft',
				context: 'purchase',
				nft_id,
				buyer,
				seller
			};

			const nftTx = await this.app.wallet.createSendNftTransaction(
				amount,
				slip1key,
				slip2key,
				slip3key,
				buyer,
				nftMsg
			);
			await nftTx.sign();

			// 6) Broadcast both, prefer NFT first (so seller is paid when transfer is on the way)
			this.app.network.propagateTransaction(nftTx);
			this.app.network.propagateTransaction(paySellerTx);

			// 7) DB: mark inactive/sold (optimistic); UI update
			await this.setInactive(seller, nft_id);
		} catch (err) {
			console.error('receivePurchaseAssetTransaction error:', err);
		}
	}

	//
	// purges invites unaccepted
	//
	purgeAssets() {}

	async onChainReorganization(bid, bsh, lc) {
		//var sql = 'UPDATE listings SET lc = $lc WHERE bid = $bid AND bsh = $bsh';
		//var params = { $bid: bid, $bsh: bsh };
		//await this.app.storage.runDatabase(sql, params, 'assetstore');
		return;
	}

	async retreiveNftTXFromId(nft_id) {
		//
		// load NFT transaction from local archive first
		//
		const processTX = (txs) => {
			if (Array.isArray(txs) && txs.length > 0) {
				resolve(txs);
				return;
			}
			resolve(null);
		};

		let nfttx = await new Promise((resolve) => {
			this.app.storage.loadTransactions({ field4: nft_id }, processTX, 'localhost');
		});

		if (nfttx) return nfttx;

		//
		// load NFT transaction from remote peers
		// if local not found
		//

		const peers = await this.app.network.getPeers();
		const peer = peers?.[0] ?? null;

		nfttx = await new Promise((resolve) => {
			this.app.storage.loadTransactions({ field4: nft_id }, processTX, peer);
		});

		if (nfttx) return nfttx;

		return null;
	}

	// Derive an NFT id from a tx
	computeNftIdFromTx(tx) {
		if (!tx) return null;

		// Prefer outputs; fall back to inputs
		const s3 = (tx?.to && tx.to[2]) || (tx?.from && tx.from[2]);
		if (!s3 || !s3.publicKey) return null;

		let pk = s3.publicKey;
		let bytes = null;

		// Normalize to Uint8Array
		if (pk instanceof Uint8Array || (typeof Buffer !== 'undefined' && pk instanceof Buffer)) {
			bytes = new Uint8Array(pk);
		} else if (typeof pk === 'string') {
			if (/^[0-9a-fA-F]{66}$/.test(pk)) {
				// Hex (33 bytes = 66 hex chars)
				bytes = this.hexToBytes(pk);
			} else {
				// Assume Base58 (Saito-style pubkey encoding)
				bytes = this.base58ToBytes(pk);
			}
		} else if (pk && typeof pk === 'object' && pk.data) {
			bytes = new Uint8Array(pk.data);
		}

		if (!bytes) return null;

		// Some encoders may prepend a 0x00; tolerate 34→33
		if (bytes.length === 34 && bytes[0] === 0) bytes = bytes.slice(1);
		if (bytes.length !== 33) return null;

		// Return as hex string
		return Array.from(bytes)
			.map((b) => b.toString(16).padStart(2, '0'))
			.join('');
	}

	/* Helpers */

	hexToBytes(hex) {
		const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
		const out = new Uint8Array(clean.length / 2);
		for (let i = 0; i < out.length; i++) {
			out[i] = parseInt(clean.substr(i * 2, 2), 16);
		}
		return out;
	}

	base58ToBytes(str) {
		// Bitcoin Base58 alphabet
		const B58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
		const B58_MAP = (() => {
			const m = new Map();
			for (let i = 0; i < B58_ALPHABET.length; i++) m.set(B58_ALPHABET[i], i);
			return m;
		})();

		// Count leading zeros
		let zeros = 0;
		while (zeros < str.length && str[zeros] === '1') zeros++;

		// Base58 decode to a big integer in bytes (base256)
		const bytes = [];
		for (let i = zeros; i < str.length; i++) {
			const val = B58_MAP.get(str[i]);
			if (val == null) throw new Error('Invalid Base58 character');
			let carry = val;
			for (let j = 0; j < bytes.length; j++) {
				const x = bytes[j] * 58 + carry;
				bytes[j] = x & 0xff;
				carry = x >> 8;
			}
			while (carry > 0) {
				bytes.push(carry & 0xff);
				carry >>= 8;
			}
		}

		// Add leading zeros
		for (let k = 0; k < zeros; k++) bytes.push(0);

		// Output is little-endian; reverse to big-endian
		bytes.reverse();
		return new Uint8Array(bytes);
	}

	webServer(app, expressapp, express) {
		let webdir = `${__dirname}/../../mods/${this.dirname}/web`;
		let this_self = this;

		expressapp.get('/' + encodeURI(this.returnSlug()), async function (req, res) {
			let reqBaseURL = req.protocol + '://' + req.headers.host + '/';

			let updatedSocial = Object.assign({}, this_self.social);

			let html = AssetStoreHome(app, this_self, app.build_number, updatedSocial);
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
	// Database Inserts
	//
	async addListing(tx, blk, nfttx, nft) {

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
		let reserve_price = txmsg.reserve_price;

		const sql = `INSERT INTO listings (nft_id, nfttx_sig, status, seller, buyer, created_at, reserve_price)`;
		const params = {
			$nft_id: nft_id,
			$nfttx_sig: nfttx_sig,
			$status: 0 ,
			$seller: seller ,
			$buyer: '' ,
			$reserve_price: reserve_price
		};
		const res = await this.app.storage.runDatabase(sql, params, 'assetstore');
		let rows = await this.app.storage.runDatabase("SELECT last_insert_rowid() AS id", {}, 'assetstore');
		let listing_id = rows[0].id;

		return listing_id;

	}

	async updateListingStatus(nfttx_sig, status, delisting_nfttx_sig="") {

		if (delisting_nfttx_sig == "") {

			const sql = `UPDATE listings SET status = $status WHERE nfttx_sig = $nfttx_sig`;
			const params = {
				$status: 0 ,
				$nfttx_sig: nfttx_sig,
			};
			const res = await this.app.storage.runDatabase(sql, params, 'assetstore');

		} else {

			const sql2 = `UPDATE listings SET status = $status , delisting_nfttx_sig = $delisting_nfttx_sig WHERE nfttx_sig = $nfttx_sig`;
			const params2 = {
				$status: 0 ,
				$nfttx_sig: nfttx_sig,
				$delisting_nfttx_sig: delisting_nfttx_sig,
			};
			const res2 = await this.app.storage.runDatabase(sql, params, 'assetstore');

		}

		return;

	}

	async addTransaction(listing_id=0, nfttx_sig="", tx_type=0, tx=null, blk=null) {

		if (tx == null) { return; }

		let lc = 0;
		let bsh = "";
		let bid = 0;
		let tid = 0;
		let sender = "";
		let receiver = "";
		let tx_json = tx.serialize_to_web(this.app);

		//
		// Bound Transaction
		//
		if (tx.type == 9) {
			if (tx.from.length > 0) {
				if (tx.from.length > 2) { sender = tx.from[1].publicKey; } else { sender = tx.from[0].publicKey; }
			}
			if (tx.to.length > 2) { receiver = tx.to[1].publicKey; } else { receiver = tx.to[0].publicKey; }
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
			const pre_sql = `SELECT listing_id FROM listings WHERE nfttx_sig = $nfttx_sig`;
			const pre_params = {
				$nfttx_sig: nfttx_sig,
			};
			let rows = await this.app.storage.runDatabase(pre_sql, pre_params, 'assetstore');
			if (rows.length == 0) { return; }
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
			receiver, 
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
			$receiver, 
			$tx_type, 
			$lc, 
			$bsh, 
			$bid, 
			$tid
		)`;

		let params = {
			$listing_id: listing_id,
			$tx: tx_json,
			$tx_sig: tx_sig,
			$sender: seller,
			$receiver: receiver,
			$tx_type: tx_type,
			$lc: lc,
			$bsh: bsh,
			$bid: bid,
			$tid: tid
		};
		await this.app.storage.runDatabase(sql, params, 'assetstore');

		return;

	}

}

module.exports = AssetStore;
