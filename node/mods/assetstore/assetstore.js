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
	    // if (!peer.hasService('assetstore')) {
	    //   return;
	    // }

	    if (service.service === 'relay') {
	      
	   	console.log("service is assestore ///////////");   
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

		let txmsg = tx.returnMessage();
		let assetstore_self = this.app.modules.returnModule('AssetStore');

		if (tx.type == 8) { // Bound
			console.log("key1: " + tx.to[1].publicKey);
			console.log("key2: " + this.publicKey);

			if (tx.isTo(this.publicKey)) {
				console.log("(");
				console.log("(");
				console.log("( AssetStore Receives Bound TX for ITSELF!");
				console.log("(");
				console.log("(");
				let nft = new SaitoNft(this.app, this);
				nft.createFromTx(tx);
				let nft_id = nft.returnId();

				console.log("created NFT from tx...", nft);
				
				let seller = tx.from[0].publicKey;;
				await this.setActive(seller, nft_id);

				//
				// SHOULD DELIST BE CALLED HERE?????
				// 
				await this.createDelistAssetTransaction(tx);
			}
		}

		try {
			if (conf == 0) {
				if (txmsg.module === 'AssetStore') {

					if (this.hasSeenTransaction(tx)) {
						return;
					}

					//
					// public & private invites processed the same way
					//
					if (txmsg.request === 'create_list_asset_transaction') {
						await this.receiveListAssetTransaction(tx, blk);
						this.app.connection.emit('assetstore-update-auction-list-request', {});
					}

					if (txmsg.request === 'create_delist_asset_transaction') {
						await this.receiveDelistAssetTransaction(tx, blk);
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
	async handlePeerTransaction(app, newtx = null, peer, mycallback = null) {

		if (newtx == null) {
			return 0;
		}
		let txmsg = newtx.returnMessage();


		if (txmsg?.request === 'assetstore retreive records') {
			return this.receiveRetreiveRecordsTransaction(mycallback);
		}

		//if (message.request === 'assetstore invite list') {
		//	// Process stuff on server side, then...
		//	if (mycallback) {
		//		mycallback(txs);
		//		return 1;
		//	}
		//}

		return super.handlePeerTransaction(app, newtx, peer, mycallback);
	}


	/////////////////
	// List Assets //
	/////////////////
	//
	async createListAssetTransaction(nfttx, node_publicKey) {

		let sendto = node_publicKey;
		let moduletype = 'AssetStore';

		console.log("createListAssetTransaction nfttx:", nfttx);

		//
		// create the NFT transaction
		//
		let nftinternaltx = await this.app.wallet.createUnsignedTransactionWithDefaultFee();
		nftinternaltx.msg = {
			module: "AssetStore" ,
			request: "internal_nft_transaction" ,
			tx : nfttx.serialize_to_web(this.app)
		};
		nftinternaltx.packData();
		await nftinternaltx.sign();

		//
		// create the auction transaction
		//
		let newtx = await this.app.wallet.createUnsignedTransactionWithDefaultFee();
		newtx.msg = {
			module: "AssetStore" ,
			request: "create_list_asset_transaction" ,
			tx : nftinternaltx.serialize_to_web(this.app)
		};

		newtx.addTo(sendto);	

		newtx.packData();
		await newtx.sign();

		return newtx;
	}



	///////////////////
	// Delist Assets //
	///////////////////
	//
	async createDelistAssetTransaction(nft) {

		let sendto = this.publicKey;
		let moduletype = 'AssetStore';

		let newtx = await this.app.wallet.createUnsignedTransactionWithDefaultFee();
		//newtx.addTo(this.publicKey);

		newtx.msg = {
			module: "AssetStore" ,
			request: "create_delist_asset_transaction",
			tx: nft.serialize_to_web(this)
		};

		newtx.packData();
		await newtx.sign();

		return newtx;
	}

	async receiveDelistAssetTransaction(tx, blk = null) {

	}

	async receiveListAssetTransaction(tx, blk = null) {

		try {

			let txmsg = tx.returnMessage();
			let internalnfttx = new Transaction();
	                internalnfttx.deserialize_from_web(this.app, txmsg.tx);

	                console.log("internalnfttx nfttx:", internalnfttx);


	                let internalnfttx_txmsg = internalnfttx.returnMessage();
	                let nfttx = new Transaction();
	                nfttx.deserialize_from_web(this.app, internalnfttx_txmsg.tx)


	                console.log("nfttx:", nfttx);

			let nft = new SaitoNft(this.app, this);
			nft.createFromTx(nfttx);

			let seller = tx.from[0].publicKey;
			let lc = 1;
			let nft_id = nft.returnId();
			let nft_tx = internalnfttx_txmsg.tx; // original nft tx as serialized
			let nft_sig = nfttx.signature;
			let bsh = blk.hash;
			let bid = blk.id;
			let tid = tx.signature;
	
// console.log("seller: " + seller);
// console.log("nft_id: " + nft_id);
// //console.log("nft_tx: " + nft_tx);
// console.log("lc: " + lc);
// console.log("bsh: " + bsh);
// console.log("bid: " + bid);
// console.log("tid: " + tid);

			//
			// insert the NFT into our platform
			//
			await this.addRecord(
				seller , 
				nft_id ,
				nft_tx ,
				nft_sig ,
				lc , 
				bsh ,
				bid ,
				tid 
			);

			//
			// and broadcast the embedded tx
			//

			//
			// BROADCASTING NFT TX CAUSES ERROR: 
			// "tx verification failed : hash = , sig = , pub_key = "
			//

			//this.app.network.propagateTransaction(nfttx);

		} catch (err) {

		}

        }


	async receiveNFTTransfer(tx, blk = null) {
		let txmsg = tx.returnMessage();
	}






	//
	// purges invites unaccepted
	//
	purgeAssets() {
	}



	shouldAffixCallbackToModule(modname, tx=null) {
		if (modname == 'AssetStore') {
			return 1;
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
	}


	//
	// SQL Database Management
	//
	async setActive(
		seller = "",
		nft_id = ""
	) {

                let sql = `UPDATE records SET active = 1 WHERE seller = $seller AND nft_id = $nft_id`;
                let params = {
                        $seller : seller ,
                        $nft_id : nft_id ,
                };
                let res = await this.app.storage.runDatabase(sql, params, 'assetstore');
                return res?.changes;
	}

	async setInactive(
		nft_sig = "",
		nft_id = ""
	) {

                let sql = `UPDATE records SET active = 0 WHERE nft_sig = $nft_sig AND nft_id = $nft_id`;
                let params = {
                        $nft_sig : nft_sig ,
                        $nft_id : nft_id ,
                };
                let res = await this.app.storage.runDatabase(sql, params, 'assetstore');
                return res?.changes;
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
        async addRecord(
	  seller = "",
	  nft_id = "",
	  nft_tx = "",
	  nft_sig = "",
	  lc = 1,
	  bsh = "",
	  bid = 0,
	  tid = 0
	) {
	  // prevent empty nft_id, we have UNIQUE('') in table will cause it to be ignored
	  if (!nft_id || (typeof nft_id === "string" && nft_id.trim() === "")) {
	    console.warn("addRecord: empty nft_id — not inserting");
	    return 0;
	  }

	console.log("seller: " + seller);
	console.log("nft_id: " + nft_id);
	console.log("nft_tx: " + nft_tx);
	console.log("nft_sig: " + nft_sig);
	console.log("lc: " + lc);
	console.log("bsh: " + bsh);
	console.log("bid: " + bid);
	console.log("tid: " + tid);


	  const lcNum  = typeof lc  === "bigint" ? Number(lc)  : Number(lc)  || 0;
	  const bidNum = typeof bid === "bigint" ? Number(bid) : Number(bid) || 0; // handles `3n`
	  const tidStr = String(tid);

	  //
	  // insert if nft_id unique, else update existing row
	  //
	  const sql = `
	    INSERT INTO records (
	      seller, nft_id, nft_tx, lc, bsh, bid, tid
	    ) VALUES (
	      $seller, $nft_id, $nft_tx, $lc, $bsh, $bid, $tid
	    )
	    ON CONFLICT(nft_id) DO UPDATE SET
	      seller = excluded.seller,
	      nft_tx = excluded.nft_tx,
	      lc     = excluded.lc,
	      bsh    = excluded.bsh,
	      bid    = excluded.bid,
	      tid    = excluded.tid;
	  `;

	  const params = {
	    $seller: seller,
	    $nft_id: nft_id,
	    $nft_tx: nft_tx,
	    $lc: lcNum,
	    $bsh: bsh,
	    $bid: bidNum,
	    $tid: tidStr
	  };

	  const res = await this.app.storage.runDatabase(sql, params, "assetstore");
	  console.log("addRecord changes:", res);
	  return res?.changes ?? 0;
	}

	async sendRetreiveRecordsTransaction(peer, mycallback) {
		let msg = {
			module: "AssetStore",
	        	request: 'assetstore retreive records',
	        };

	        this.app.network.sendRequestAsTransaction(
	          'assetstore retreive records',
	          msg,
	          function(records){
	          	this.auction_list = records;
	          	if (mycallback != null) {
	          		return mycallback(records);
	          	}
	          },
	          peer.peerIndex
	        );
	}

	async receiveRetreiveRecordsTransaction(mycallback = null) {
		console.log('inside receiveRetreiveRecordsTransaction 1 ///');
		if (mycallback == null) {
			console.warn('No callback');
			return 0;
		}
		if (this.app.BROWSER == 1) {
			console.warn("Browsers don't support backup/recovery");
			return 0;
		}

		console.log('inside receiveRetreiveRecordsTransaction 2 ///');


		let sql = 'SELECT * FROM records';
		let params = {
		};

		let results = await this.app.storage.queryDatabase(sql, params, 'assetstore');


		console.log('inside receiveRetreiveRecordsTransaction 3 ///');
		console.log("records:", results);

		if (mycallback) {
			mycallback(results);
			return 1;
		} else {
			console.warn('No callback to process assestore records');
		}

		return 0;
	}



}

module.exports = AssetStore;

