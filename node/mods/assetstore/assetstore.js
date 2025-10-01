const PeerService = require('saito-js/lib/peer_service').default;
const Transaction = require('../../lib/saito/transaction').default;
const saito = require('./../../lib/saito/saito');
const ModTemplate = require('../../lib/templates/modtemplate');
const AssetStoreMain = require('./lib/main/main');
const SaitoHeader = require('./../../lib/saito/ui/saito-header/saito-header');
const AssetStoreHome = require('./index');
const SaitoNft = require('./../../lib/saito/ui/saito-nft/saito-nft');

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
		this.description = 'Application providing automated settlement for NFT and other asset trades';
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

			this.fetchListings((records) => {
				console.log('onPeerServiceUp records: ', records);
				this.auction_list = records;
				this.app.connection.emit('assetstore-render');
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
				

				let nft = new SaitoNft(this.app, this, tx, null);

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
				this.app.connection.emit('assetstore-render-listings');

				//
				// and save the transaction
				//

				console.log("Saving nft tx to server: ", tx);
				this.addTransaction(0, nft_sig, 1, tx); // 0 ==> look-up listing_id
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
				this.app.connection.emit('assetstore-build-auction-list-request');
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

					if (txmsg.request === 'purchase_asset_transaction') {
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
		this.fetchListings((records) => {
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
		let nfttx = await this.app.wallet.createSendNftTransaction(nft, receiver, "AssetStore");
		await nfttx.sign();

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

		//
		// create the NFT
		//
		let nft = new SaitoNft(this.app, this.mod, nfttx);

		//
		// the listing information
		//
		let tx_sig = tx.signature;		// signature of wrapping
		let nft_id = nft.id;		// all NFTs created by 
		let nfttx_sig = nfttx.signature;	// unique value of TX containing NFT that will survive ATR

		//
		// add listing
		//
		let listing_id = await this.addListing(tx, blk, nfttx, nft);

		//
		// save transaction
		//
		this.addTransaction(listing_id, nfttx_sig, 0, tx);

		//
		// save local in-memory reference
		//
		const record = {
			id: listing_id ,
			nft_id: nft_id ,
			nfttx: txmsg.data.nft,
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

		console.log("createDelistAssetTransaction nft: ", nft);

		//
		// create the NFT transaction
		//
		let nfttx = await this.app.wallet.createSendNftTransaction(nft, receiver, "AssetStore");
		await nfttx.sign();

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
			const pre_sql = `SELECT id,nfttx_sig FROM listings WHERE delisting_nfttx_sig = $delisting_nfttx_sig`;
			const pre_params = {
				$delisting_nfttx_sig: tx.signature ,
			};
			let rows = await this.app.storage.queryDatabase(pre_sql, pre_params, 'assetstore');
			if (rows.length == 0) { return; }
			listing_id = rows[0].id;
			nfttx_sig = rows[0].nfttx_sig;
		}

		//
		// update our listings
		//
		this.updateListingStatus(nfttx_sig, 4); // 4 => delisting / inactive
		this.addTransaction(0, nfttx_sig, 4, tx); // 4 => delisting transaction

		//
		// remove any in-memory record...
		//
		for (let z = 0; z < this.auction_list.length; z++) {
			if (this.auction_list[z].nfttx_sig === nft_sig) {
				this.auction_list.splice(z, 1);
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
	    if (!tx) return; // allow blk===null at conf===0

	    const txmsg = tx.returnMessage();
	    if (!txmsg?.data?.nft || !txmsg?.data?.nft_sig) {
	      console.warn('receiveDelistAssetTransaction: missing nft or nft_sig');
	      return;
	    }

	    // Deserialize inner NFT send-back
	    const inner = new Transaction();
	    inner.deserialize_from_web(this.app, txmsg.data.nft);


		//
		// this is the ID of the item under auction, which is the 
		// sig of the transaction that broadcast the NFT to the 
		// AssetStore and created the unique ID associated with the 
		// listing
		//
	    const nft_sig = txmsg.data.nft_sig;

		//
		// at this point, we need the user to cache the transaction somewhere
		// so that when they view the listing in the AssetStore the UI shows 
		// that they can delist the auction, which is done by broadcasting the
		// transaction-within-a-transaction which will transfer ownership back
		// to us.
		//
	    if (this.app.BROWSER) {
	      this.app.options.assetstore ||= {};
	      this.app.options.assetstore.delist_drafts ||= {};
	      this.app.options.assetstore.delist_drafts[nft_sig] = txmsg.data.nft; // serialized inner tx
	      await this.app.storage.saveOptions();
	      this.app.connection.emit('assetstore-render');
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
	async fetchListings(mycallback = null) {
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

		//
		// nft: { id, slip1, slip2, slip3, amount, nft_sig, seller }
		// opts: { price, fee }
		//

		console.log('purchase nft: ', nft);

		// 
		// price and fee are in saito (converted to nolan down below)
		//
		const price = await nft.getPrice() ?? 0;
		const fee = this?.fee ?? 0;

		//
		// TODO - does this crash the browser / server ???
		//
		if (price <= 0n) { throw new Error('price must be > 0'); }
		//
		// allowing 0 fee for testing
		//
		//if (fee < 0n) { throw new Error('fee must be >= 0'); }

		//
		//
		//
		const total_price = price + fee;

		//
		// the payment is made to the AssetStore, which controls the NFT
		// and will collect the payment and re-sign the payment to the 
		// seller if the auction succeeds, or refund the payment to the 
		// buyer if it does not.
		//
		const seller = await nft.getSeller();
		if (!seller) { throw new Error('seller public key is required'); }

		//
		// create purchase transaction
		//
		let nolan_amount = this.app.wallet.convertSaitoToNolan(total_price);


		console.log("nolan_amount:", nolan_amount);
		console.log("seller:", seller);
		//
		// pay to assetstore first, assetstore then pays seller after due delligence
		//
		let to_address = this.assetStore.publicKey;
		let newtx = await this.app.wallet.createUnsignedTransactionWithDefaultFee(
	          to_address,
	          nolan_amount
	        );

		//
		// sanity check
		//
		newtx.msg = {
			module: this.name,
			request: 'purchase_asset_transaction',
			amount: nolan_amount,
			from: this.publicKey,
			to: to_address,
			nft_sig: nft.tx_sig,
			refund: this.publicKey,
			price: String(price),
			fee: String(fee),
		};
		newtx.packData();
		await newtx.sign();

		console.log("Create purchase tx: ", newtx);
		return newtx;

	}


	async receivePurchaseAssetTransaction(tx, blk = null) {
	  try {
	    if (this.app.BROWSER) return;

	    console.log(tx);
	    const txmsg = tx.returnMessage?.() || {};
	    console.log('txmsg: ', txmsg);
	    const buyer  = tx.from[0].publicKey;

	    console.log("buyer: ", buyer);
	    const nft_sig = txmsg.nft_sig;
	    const price = BigInt(this.app.wallet.convertSaitoToNolan(txmsg.price) ?? 0);
	    const fee   = BigInt(this.app.wallet.convertSaitoToNolan(txmsg.fee)   ?? 0);
	    const total = price + fee;

	    if (!buyer || !nft_sig) {
	      console.warn('Purchase: missing buyer or nft_sig');
	      return;
	    }
	    if (price <= 0n) {
	      console.warn('Purchase: invalid price/fee');
	      return;
	    }

	    //
	    // confirm listing is active
	    //
	    const listing = await this.returnListing(nft_sig, '', 1);
	    if (!listing) {
	      console.warn('Purchase: listing not active or not found');
	      
	      //
	      // return amount back to buyer if listing is not active
	      //
	      let amount_paid = 0n;
	      for (const o of (tx.to || [])) {
	        if (o?.publicKey === this.publicKey) {
	          const a = (typeof o.amount === 'bigint') ? o.amount : BigInt(o.amount ?? 0);
	          amount_paid += a;
	        }
	      }
	      if (amount_paid > 0n) {
	        await this.refundBuyer(buyer, nft_sig, amount_paid, 'listing-not-active', blk);
	      }
	      return;
	    }

	    //
	    // verify the payment to this server equals price+fee
	    //
	    let paid_to_server = 0n;
	    for (const o of (tx.to || [])) {
	      if (o?.publicKey === this.publicKey) {
	        const a = (typeof o.amount === 'bigint') ? o.amount : BigInt(o.amount ?? 0);
	        paid_to_server += a;
	      }
	    }
	    if (paid_to_server < total) {
	      console.warn(`Purchase: underpaid. got=${paid_to_server} need=${total}`);

	      //
	      // refund amount back to buyer if amount is insufficent for purchase
	      //
	      if (paid_to_server > 0n) {
	        await this.refundBuyer(buyer, nft_sig, paid_to_server, 'underpaid', blk);
	      }
	      return;
	    }

	    //
	    // check reserve price
	    //
	    const reserve = BigInt(this.app.wallet.convertSaitoToNolan(listing?.reserve_price) ?? 0);
	    if (price < reserve) {
	      console.warn(`Purchase: below reserve. price=${price} reserve=${reserve}`);
	      try {
	        const refund_tx = await this.app.wallet.createUnsignedTransaction(buyer, paid_to_server, BigInt(0));
	        refund_tx.msg = { module: this.name, request: 'purchase_refund', reason: 'below-reserve', nft_sig };
	        refund_tx.packData(); 
	        await refund_tx.sign(); 
	        this.app.network.propagateTransaction(refund_tx);

	        //
	        // add refund tx to transaction table
	        //
	        await this.addTransaction(0, nft_sig, 5, refund_tx, blk);
	      } catch (e) { 
	        console.error('Refund failed:', e); 
	      }
	      return;
	    }

	    //
	    // Check if NFT still owned by server wallet
	    // Refund if not
	    //

	    const nft_id = listing.nft_id;
	    let owned_nft = null;
	    const raw  = await this.app.wallet.getNftList();

	    console.log("Server nfts: ", raw);
	    const list = typeof raw === 'string' ? JSON.parse(raw) : raw;
	    const nft_owned = (list || []).find(n => (n.id === nft_id && n?.tx_sig === nft_sig) );

	    if (!nft_owned) {
	      console.warn('Purchase: server does not hold the NFT');
	      try {
	        const refund_tx = await this.app.wallet.createUnsignedTransaction(buyer, paid_to_server, BigInt(0));
	        refund_tx.msg = { module: this.name, request: 'purchase_refund', reason: 'nft-not-held', nft_sig };
	        refund_tx.packData(); await refund_tx.sign(); this.app.network.propagateTransaction(refund_tx);
	       
	        await this.addTransaction(0, nft_sig, 5, refund_tx, blk);
	      } catch (e) { console.error('Refund failed:', e); }
	      return;
	    }


            //
	    // recreate nft class from nft tx saved at listing time
	    //
	    // const listing_id = listing.id;
	    // const tx_type  = 1; // 1 = NFT listing
	    // const transaction_row = await this.returnTransaction(listing_id, tx_type);
	    // if (!transaction_row || !transaction_row.tx) {
	    //   console.warn('Purchase: could not load listing-time NFT transaction');
	    //   await this.refundBuyer(buyer, nft_sig, paid_to_server, 'nft-tx-missing', blk);
	    //   return;
	    // }

	    // let nft_creation_tx = new Transaction();
	    // try {
	    //   nft_creation_tx.deserialize_from_web(this.app, transaction_row.tx);
	    // } catch (e) {
	    //   console.error('Purchase: failed to deserialize NFT tx from DB', e);
	    //   await this.refundBuyer(buyer, nft_sig, paid_to_server, 'nft-tx-deserialize-failed', blk);
	    //   return;
	    // }

	    console.log("NFT owned: ", nft_owned);

	    let nft = new SaitoNft(this.app, this,  null, nft_owned);

	    console.log("Nft class: ", nft);

	    //
	    // transfer NFT to buyer
	    //
	    const nft_tx = await this.app.wallet.createSendNftTransaction(nft, buyer, 'AssetStore');
	    await nft_tx.sign();
	    this.app.network.propagateTransaction(nft_tx);


	    //
	    // update db and mark listing sold
	    //
	    await this.updateListingStatus(nft_sig, 2);
	    await this.addTransaction(0, nft_sig, 1, nft_tx, blk);
	    await this.addTransaction(0, nft_sig, 2, tx, blk);

	    //
	    // payout to seller 
	    //
	    const seller = listing.seller;
	    try {
	      const payout_tx = await this.app.wallet.createUnsignedTransaction(seller, price, BigInt(0));
	      payout_tx.msg = { module: this.name, request: 'seller_payout' };
	      payout_tx.packData(); 
	      await payout_tx.sign(); 
	      this.app.network.propagateTransaction(payout_tx);

	      await this.addTransaction(0, nft_sig, 3, payout_tx, blk);
	    } catch (e) {
	      console.error('Seller payout failed:', e);
	    }

	    //
	    // refresh UI?
	    //
	    //this.app.connection.emit('assetstore-build-auction-list-request');

	  } catch (err) {
	    console.error('receivePurchaseAssetTransaction error:', err);
	  }
	}



	async refundBuyer(buyer, nft_sig, amount, reason, blk) {
	  try {
	    if (!buyer || !nft_sig || amount <= 0n) return;

	    const refund_tx = await this.app.wallet.createUnsignedTransaction(buyer, amount, BigInt(0));
	    refund_tx.msg = { module: this.name, request: 'purchase_refund', reason, nft_sig };
	    refund_tx.packData();
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
		let reserve_price = txmsg.data.reserve_price;

		const sql = `
		  INSERT INTO listings (nft_id, nfttx_sig, status, seller, buyer, reserve_price)
		  VALUES ($nft_id, $nfttx_sig, $status, $seller, $buyer, $reserve_price)
		`;
		const params = {
		  $nft_id: nft.id,
		  $nfttx_sig: nfttx.signature,
		  $status: 0,
		  $seller: seller,
		  $buyer: '',
		  $reserve_price: reserve_price ?? null
		};

		const res = await this.app.storage.runDatabase(sql, params, 'assetstore');

		if (res?.changes > 0) {
			return res?.lastID || null;
		}
		return null;
	}

	async updateListingStatus(nfttx_sig, status = 0, delisting_nfttx_sig="") {

		if (delisting_nfttx_sig == "") {

			const sql = `UPDATE listings SET status = $status WHERE nfttx_sig = $nfttx_sig`;
			const params = {
				$status: status ,
				$nfttx_sig: nfttx_sig,
			};
			const res = await this.app.storage.runDatabase(sql, params, 'assetstore');

		} else {

			const sql2 = `UPDATE listings SET status = $status , delisting_nfttx_sig = $delisting_nfttx_sig WHERE nfttx_sig = $nfttx_sig`;
			const params2 = {
				$status: status ,
				$nfttx_sig: nfttx_sig,
				$delisting_nfttx_sig: delisting_nfttx_sig,
			};
			const res2 = await this.app.storage.runDatabase(sql2, params2, 'assetstore');

		}

		return;

	}

	async returnListing(nfttx_sig, delisting_nfttx_sig="", status = 0) {

		if (delisting_nfttx_sig == "") {

			const sql = `SELECT * FROM listings WHERE status = $status AND nfttx_sig = $nfttx_sig`;
			const params = {
				$status: status ,
				$nfttx_sig: nfttx_sig,
			};
			const res = await this.app.storage.queryDatabase(sql, params, 'assetstore');
			console.log("returnListing: ", res);
			if (res.length > 0) { return res[0]; }

		} else {

			const sql2 = `SELECT * FROM listings WHERE status = $status AND delisting_nfttx_sig = $delisting_nfttx_sig`;
			const params2 = {
				$status: status ,
				$delisting_nfttx_sig: delisting_nfttx_sig,
			};
			const res2 = await this.app.storage.queryDatabase(sql, params, 'assetstore');
			if (res2.length > 0) { return res2[0]; }
		}

		return null;

	}

	async returnTransaction(listing_id, tx_type) {

		if (listing_id != "") {

			const sql = `SELECT * FROM transactions WHERE listing_id = $listing_id AND tx_type = $tx_type`;
			const params = {
				$tx_type: tx_type,
				$listing_id: listing_id,
			};
			const res = await this.app.storage.queryDatabase(sql, params, 'assetstore');
			console.log("returnTransaction: ", res);
			if (res.length > 0) { return res[0]; }

		} 

		return null;

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
		if (tx.type == 8) {
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
			const pre_sql = `SELECT * FROM listings WHERE nfttx_sig = $nfttx_sig`;
			const pre_params = {
				$nfttx_sig: nfttx_sig,
			};
			let rows = await this.app.storage.queryDatabase(pre_sql, pre_params, 'assetstore');
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
		await this.app.storage.runDatabase(sql, params, 'assetstore');

		return;

	}

}

module.exports = AssetStore;
