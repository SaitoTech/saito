const PeerService = require('saito-js/lib/peer_service').default;
const Transaction = require('../../lib/saito/transaction').default;
const saito = require('./../../lib/saito/saito');
const ModTemplate = require('../../lib/templates/modtemplate');
const AssetStoreMain = require('./lib/main/main');
const SaitoHeader = require('./../../lib/saito/ui/saito-header/saito-header');
const AssetStoreHome = require('./index');
const SaitoNft = require('./../../lib/saito/ui/saito-nft/nft');

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
		this.description = 'NFT Interface for creating and joining games coded for the Saito Open Source Game Engine.';
		this.categories = 'Utility Ecommerce NFTs';
		this.icon = 'fa-solid fa-cart-shopping';

		this.nfts = {};
		this.auction_list = [];
		this.purchaseFee = 0;

		this.styles = ['/assetstore/style.css'];

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

		if (!app.options.assetstore) {
			app.options.assetstore = {};
		}

	}


	async onPeerServiceUp(app, peer, service = {}) {
	    
	    console.log("onPeerServiceUp: ", service.service);

	    if (service.service === 'relay') {
	        this.app.network.sendRequestAsTransaction(
	          "assetstore retreive records",
	           {
	           	module: "AssetStore",
	           	request: "assetstore retreive records",
	           },
	          (records) => {

	          	console.log("onPeerServiceUp records: ", records);
	            this.auction_list = records;
	            this.app.connection.emit('assetstore-render-auction-list-request');
	          },
	          peer.peerIndex
	        );
	      
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
				this.attachStyleSheets();
				x.push({
					text: 'Store',
					icon: 'fa-solid fa-cart-shopping',
					rank: 15,
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

		// if (this.app.BROWSER) {
		// return;
		// }

		//
		// sanity check
		//
		if (this.hasSeenTransaction(tx)) {
			return;
		}

		let txmsg = tx.returnMessage();
		let assetstore_self = this.app.modules.returnModule('AssetStore');

		//
		// Bound Transactions (monitor NFT transfers)
		//
		if (tx.type == 8) {

			//
			// ignore "create nft" txs with < 3 from slips
			// 
			if (tx.from.length < 3) { return; }

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
				await this.updateListing(seller, nft_sig, 2);

				//
				// and save the transaction
				//
				this.addTransaction(tx, blk, nft_sig, seller, this.publicKey, 1);
			}

			//
			// if we are sending the NFT to someone else
			//
			if (!tx.isTo(this.publicKey) && tx.isFrom(this.publicKey)) {
			
				//
				// do nothing for now...
				//

			}

		}

		try {
			if (conf == 0) {
				if (txmsg.module === 'AssetStore') {

					//
					// public & private invites processed the same way
					//
					if (txmsg.request === 'create_list_asset_transaction') {
						await this.receiveListAssetTransaction(tx, blk);
					}

					if (txmsg.request === 'create_delist_asset_transaction') {
						await this.receiveDelistAssetTransaction(tx, blk);
					}

					if (txmsg.request === 'create_purchase_asset_transaction') {
						await this.receivePurchaseAssetTransaction(tx, blk);
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

		if (txmsg?.request === 'assetstore retreive records') {
			return this.receiveRetreiveRecordsTransaction(mycallback);
		}

		return super.handlePeerTransaction(app, tx, peer, mycallback);
	}



	/////////////////
	// List Assets //
	/////////////////
	//
	async createListAssetTransaction(nft, receiver) {

		//
		// create the NFT transaction
		//
		const obj = {};
	        if (nft.image) obj.image = nft.image;
	        if (nft.text) obj.text = nft.text;

	        const tx_msg = {
	          data: obj,
	          module: 'AssetStore',
	          request: 'send nft'
	        };

	        let amount = BigInt(nft.amount);
	        let slip1Key = nft.slip1.utxo_key;
	        let slip2Key = nft.slip2.utxo_key;
	        let slip3Key = nft.slip3.utxo_key;

	        let nfttx = await this.app.wallet.createSendBoundTransaction(
	          amount,
	          slip1Key,
	          slip2Key,
	          slip3Key,
	          receiver,
	          tx_msg
	        );
	        nfttx.sign();

	        console.log("inner nft_tx: ", nfttx);


		//	
		// create the auction transaction
		//
		let newtx = await this.app.wallet.createUnsignedTransactionWithDefaultFee();
		newtx.msg = {
			module: "AssetStore" ,
			request: "create_list_asset_transaction" ,
			tx : nfttx.serialize_to_web(this.app)
		};

		newtx.type = 0;

		newtx.packData();
		await newtx.sign();

		return newtx;
	}


	async receiveListAssetTransaction(tx, blk = null) {

		try {
			//
			// unpack the transaction
			//
			let txmsg = tx.returnMessage();
			let nfttx = new Transaction();
			    nfttx.deserialize_from_web(this.app, txmsg.tx);
			let nft = new SaitoNft(this.app, this);
			    nft.createFromTx(nfttx);

			//
			// add the auction listing
			//
			await this.addListing(nft, tx, nfttx, blk);

			//
			// and broadcast the embedded tx
			//
			this.app.network.propagateTransaction(nfttx);

		} catch (err) {

		}
        }


	///////////////////
	// Delist Assets //
	///////////////////
	//
	async createDelistAssetTransaction(nft) {

	  const newtx = await this.app.wallet.createUnsignedTransactionWithDefaultFee();
	  
	  const obj = {
	    module: 'AssetStore',
	    request: 'create_delist_asset_transaction',
	    nft_id: nft.id,
	    seller: this.publicKey,

	  };
	    
          if (nft.image) obj.image = nft.image;
          if (nft.text) obj.text = nft.text;

	  newtx.msg = obj;
	  newtx.type = 0;
	  newtx.packData();
	  await newtx.sign();
	  return newtx;
	}


	async receiveDelistAssetTransaction(tx, blk = null) {
	  try {
	    if (this.app.BROWSER) return;

	    const msg    = tx.returnMessage();
	    const nft_id = msg.nft_id;
	    const seller = tx.from[0].publicKey; 

	    if (!nft_id) {
	      console.warn('Delist: missing nft_id');
	      return;
	    }

	    // verify record exists having same seller and is active
	    const rows = await this.app.storage.queryDatabase(
	      'SELECT * FROM records WHERE nft_id = $nft_id AND seller = $seller AND active = 1 LIMIT 1',
	      { $nft_id: nft_id, $seller: seller },
	      'assetstore'
	    );
	    if (!rows || rows.length === 0) {
	      console.warn('Delist: record not found / not active / wrong seller');
	      return;
	    }
	    console.log("this.app.options.wallet: ", this.app.options.wallet);

	    // check if nft held by assetstore wallet
	    const raw  = await this.app.wallet.getNftList();

	    console.log("getNftList: ", raw);

	    const list = typeof raw === 'string' ? JSON.parse(raw) : raw;
	    console.log("getNftList list: ", list);
	    const nft_owned = (list || []).find(n => n.id === nft_id);

	    if (!nft_owned) {
	      console.warn('Delist: module wallet does not currently control this NFT');
	      return;
	    }

	    const slip1key = nft_owned.slip1?.utxo_key;
	    const slip2key = nft_owned.slip2?.utxo_key;
	    const slip3key = nft_owned.slip3?.utxo_key;	
    	    const amount = BigInt(nft_owned.slip2?.amount);


	    if (!slip1key || !slip2key || !slip3key) {
	      console.warn('Delist: missing slip keys on owned NFT');
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

	    const nfttx = await this.app.wallet.createSendBoundTransaction(
	      amount, 
	      slip1key, 
	      slip2key, 
	      slip3key, 
	      seller, 
	      txMsg
	    );
	    await nfttx.sign();

	    console.log("delist send bound tx: ", nfttx);

	    this.app.network.propagateTransaction(nfttx);
	   // this.app.connection.emit('assetstore-update-auction-list-request');

	  } catch (err) {
	    console.error('receiveDelistAssetTransaction error:', err);
	  }
	}

	///////////////////
	// Retreive records //
	///////////////////
	//
	async sendRetreiveRecordsTransaction(peer, mycallback) {
		let this_self = this;
		let msg = {
			module: "AssetStore",
	        	request: 'assetstore retreive records',
	        };

	        this.app.network.sendRequestAsTransaction(
	          'assetstore retreive records',
	          msg,
	          function(records){
	          	this_self.auction_list = records;
	          	if (mycallback != null) {
	          		return mycallback(records);
	          	}
	          },
	          peer.peerIndex
	        );
	}

	async receiveRetreiveRecordsTransaction(mycallback = null) {
		if (mycallback == null) {
			console.warn('No callback');
			return 0;
		}
		if (this.app.BROWSER == 1) {
			console.warn("Browsers don't support backup/recovery");
			return 0;
		}

		let sql = 'SELECT * FROM records WHERE active = 1';
		let params = {
		};

		let results = await this.app.storage.queryDatabase(sql, params, 'assetstore');

		if (mycallback) {
			mycallback(results);
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

	console.log("purchase nft: ", nft);

	  const price = BigInt(opts?.price ?? 0);
	  const fee   = BigInt(opts?.fee   ?? 0);
	  if (price <= 0n) { throw new Error('price must be > 0'); }
	  if (fee   <  0n) { throw new Error('fee must be >= 0'); }

	  const total = price + fee;

	  const seller = nft?.seller || opts?.seller;
	  if (!seller) { throw new Error('seller public key is required'); }

	  console.log("createPurchaseAssetTransaction 1///");

	 // create inner tx from buyer
  	let nolan_amount = this.app.wallet.convertSaitoToNolan(total);

  	console.log("nolan amount : ////////", nolan_amount);
  	console.log("createPurchaseAssetTransaction 2///");
	let newtx = await this.app.wallet.createUnsignedTransactionWithDefaultFee(
		seller,
		nolan_amount
	);

	newtx.msg = {
		module: this.name,
		request: 'crypto payment',
		amount,
		from: this.publicKey,
		to: seller,
	};

	  newtx.packData();
	  await newtx.sign();

	  console.log("createPurchaseAssetTransaction 3///");


	// create tx to send to server
	  let paytx = await this.app.wallet.createUnsignedTransactionWithDefaultFee();
	  const txmsg = {
	    module:  'AssetStore',
	    request: 'purchase_asset_transaction',
	    nft_id:  nft.id,
	    seller,
	     price:   String(price), // keeping as string to avoid JSON bigint issues
	     fee:     String(fee),

	    tx : newtx.serialize_to_web(this.app)
	  };

	if (nft.image) txmsg.image = nft.image;
	if (nft.text) txmsg.text = nft.text;

	  paytx.msg  = txmsg;
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

	    const buyer  = tx.from?.[0]?.publicKey || tx.returnSender();
	    const nft_id = txmsg.nft_id;
	    const seller = txmsg.seller;
	    const price  = BigInt(txmsg.price ?? 0);
	    const fee    = BigInt(txmsg.fee   ?? 0);
	    if (!nft_id || !seller) {
	      console.warn('Purchase: missing nft_id/seller'); return;
	    }
	    if (price <= 0n || fee < 0n) {
	      console.warn('Purchase: invalid price/fee'); return;
	    }

	    // Verify record exists & active & belongs to seller
	    const rows = await this.app.storage.queryDatabase(
	      'SELECT * FROM records WHERE nft_id = $nft_id AND seller = $seller AND active = 1 LIMIT 1',
	      { $nft_id: nft_id, $seller: seller },
	      'assetstore'
	    );
	    if (!rows || rows.length === 0) {
	      console.warn('Purchase: record not found / not active / wrong seller');
	      return;
	    }

	    // Verify module currently controls the NFT (like your delist)
	    const raw  = await this.app.wallet.getNftList();
	    const list = Array.isArray(raw) ? raw : (typeof raw === 'string' ? JSON.parse(raw || '[]') : []);
	    const nft_owned = (list || []).find(n => n.id === nft_id);
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
	    const amount   = BigInt(nft_owned.slip2?.amount ?? 0);
	    if (!slip1key || !slip2key || !slip3key) {
	      console.warn('Purchase: missing slip keys for owned NFT');
	      return;
	    }
	    if (amount <= 0n) {
	      console.warn('Purchase: NFT amount is zero/invalid'); return;
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

	    const nftTx = await this.app.wallet.createSendBoundTransaction(
	      amount, slip1key, slip2key, slip3key, buyer, nftMsg
	    );
	    await nftTx.sign();

	    // 6) Broadcast both, prefer NFT first (so seller is paid when transfer is on the way)
	    this.app.network.propagateTransaction(nftTx);
	    this.app.network.propagateTransaction(paySellerTx);

	    // 7) DB: mark inactive/sold (optimistic); UI update
	    await this.setInactive(seller, nft_id);
	    this.app.connection.emit('assetstore-update-auction-list-request');

	  } catch (err) {
	    console.error('receivePurchaseAssetTransaction error:', err);
	  }
	}




	//
	// purges invites unaccepted
	//
	purgeAssets() {
	}



	async onChainReorganization(bid, bsh, lc) {
		var sql = 'UPDATE records SET lc = $lc WHERE bid = $bid AND bsh = $bsh';
		var params = { $bid: bid, $bsh: bsh };
		await this.app.storage.runDatabase(sql, params, 'registry');
		return;
	}

	//
	// SQL Database Management
	//
	async addListing(
		nft = null ,
		tx = null ,
		nft_tx = null ,
		blk = null,
	) {

		//
		// sanity check
		//
		if (nft == null || tx == null || nft_tx == null || blk == null) { return; }
          
                let lc = 1;     
                let nft_id = nft.returnId();
                let nft_sig = nfttx.signature;
                let bsh = blk.hash;
                let bid = blk.id;
                let tid = tx.id;
                let seller = tx.from[0].publicKey;
                let receiver = tx.to[0].publicKey;
		let tx_json = tx.serialize_to_web(this.app);
        

		//
		// andother sanity check
		//
		if (!nft_id || (typeof nft_id === 'string' && nft_id.trim() === '')) {
			console.warn('addListing: empty nft_id — not adding listing');
			return 0;
		}
		if (tx != null) {
			//
			// NFT transaction / Bound transaction type
			//
			if (tx.type == 8) {
				return 1;
			}
		}
		return 0;

		//
		// create listing record 
		//
		//
		// CREATE TABLE IF NOT EXISTS listings (
		//  id INTEGER DEFAULT '',
		//  nft_sig TEXT DEFAULT '',		// sig of the tx that listed the NFT for sale
		//  nft_id TEXT DEFAULT '',		// slip1 + slip3
		//  seller TEXT DEFAULT '',
		//  status INTEGER DEFAULT 0 , 		// 0 = unlisted
		//			// 1 = listed, waiting for NFT transfer
		//			// 2 = listed and active
		//			// 3 = payment received, transfer not completed
		//			// 4 = payment received, transfer completed
		//  PRIMARY KEY(id ASC)
		// );
		const sql = `INSERT INTO listings (nft_sig, nft_id, seller, status) VALUES ($nft_sig, $nft_id, $seller, $status) RETURNING id`;
		const params = {
			$nft_sig: nft_sig ,
			$nft_id: nft_id ,
			$seller: seller ,
			$status : 0
		};


		//
		// execute and get LISTING_ID back
		//
		const res = await this.app.storage.runDatabase(sql, params, 'assetstore');
		const listing_id = res[0].id;


		//
		// save listing transaction
		//
		//
		// CREATE TABLE IF NOT EXISTS transactions (
		//  id INTEGER DEFAULT '' ,
		//  listing_id INTEGER DEFAULT 0 ,
		//  tx TEXT DEFAULT '' ,
		//  tx_sig TEXT DEFAULT '' ,
		//  sender TEXT DEFAULT '',
		//  type INTEGER DEFAULT 0 ,		// 0 = listing transaction
		//					// 1 = NFT transfer
		//					// 2 = inbound payment for NFT
		//					// 3 = outbound payment for sale
		//  lc INTEGER DEFAULT 0,
		//  bsh TEXT DEFAULT '' ,
		//  bid INTEGER DEFAULT 0,
		//  tid TEXT DEFAULT '' ,
		//  PRIMARY KEY(id ASC)
		// );
		//	
		const sql2 = `INSERT INTO transactions (listing_id, tx, tx_sig, sender, receiver, tx_type, lc, bsh, bid, tid) VALUES ($listing_id, $tx, $tx_sig, $sender, $receiver, $tx_type, $lc, $bsh, $bid, $tid)`;
		const params2 = {
			$listing_id 	: listing_id ,
			$tx		: tx_json ,
			$tx_sig 	: tx_sig ,
			$sender		: seller ,
			$receiver 	: receiver ,
			$tx_type 	: 0 ,
			$lc		: 1 ,
			$bsh		: bsh ,
			$bid		: bid ,
			$tid		: tid ,
		};


		//
		// and save a copy of the transaction
		//
		const res2 = await this.app.storage.runDatabase(sql2, params2, 'assetstore');

		return;

	}

	async updateListing(
		seller = "" ,
		nft_sig = "" ,
		status = 0 ,
	) {

		//
		// update listing
		//
		const sql = `UPDATE listings SET status = $status WHERE nft_sig = $nft_sig AND seller = $seller`;
		let params = {
			$seller: seller ,
			$status: status ,
			$nft_sig: nft_sig
		};
		const res = await this.app.storage.runDatabase(sql, params, 'assetstore');
		return;

	}

	async addTransaction(tx = null, blk = null, nft_sig = "", sender = "", receiver = "", tx_type = 0) {

		if (tx == null || nft_sig == "") { return; }

		let bsh = "";
		let bid = 0;
		let tid = 0;
		let lc = 1;

		if (blk != null) {
			bsh = blk.hash;
			bid = blk.id;
			tid = tx.id;
		}
		let listing_id = 0;
		let tx_json = tx.serialize_to_web(this.app);
		let tx_sig = tx.signature;

		//
		// fetch listing id
		//
		let sql = `SELECT id FROM listings WHERE nft_sig = $nft_sig`;
		let params = {
			$nft_sig	: 	nft_sig 
		}
		let rows = await this.app.storage.queryDatabase(sql, params, 'assetstore');
		if (rows.length > 0) { listing_id = rows[0].id; }

		//
		// insert transaction
		//
		let sql2 = `INSERT INTO transactions (listing_id, tx, tx_sig, sender, receiver, tx_type, lc, bsh, bid, tid) VALUES ($listing_id, $tx, $tx_sig, $sender, $receiver, $tx_type, $lc, $bsh, $bid, $tid)`;
		let params2 = {
			$listing_id 	: listing_id ,
			$tx		: tx_json ,
			$tx_sig 	: tx_sig ,
			$sender		: seller ,
			$receiver  	: receiver ,
			$tx_type 	: tx_type ,
			$lc		: lc ,
			$bsh		: bsh ,
			$bid		: bid ,
			$tid		: tid ,
		};
		await this.app.storage.runDatabase(sql2, params2, 'assetstore');

		return;

	}


	async sendRetreiveRecordsTransaction(mycallback = null) {
		let this_self = this;

		for (let p of this.assetStoreKeys) {
			this.app.network.sendRequestAsTransaction(
				'assetstore retreive records',
				{},
				function (records) {
					this_self.auction_list = records;
					if (mycallback != null) {
						return mycallback(records);
					}
				},
				p.peerIndex
			);
		}
	}


}

module.exports = AssetStore;
