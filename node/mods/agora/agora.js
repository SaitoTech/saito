const PeerService = require('saito-js/lib/peer_service').default;
const Transaction = require('../../lib/saito/transaction').default;
const saito = require('./../../lib/saito/saito');
const ModTemplate = require('../../lib/templates/modtemplate');
const AgoraMain = require('./lib/main/main');
const SaitoHeader = require('./../../lib/saito/ui/saito-header/saito-header');
const AgoraHome = require('./index');
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
class Agora extends ModTemplate {
	constructor(app) {
		super(app);

		this.debug = false;

		this.name = 'Agora';
		this.slug = 'agora';
		this.description =
			'NFT Interface for creating and joining games coded for the Saito Open Source Game Engine.';
		this.categories = 'Utility Ecommerce NFTs';
		this.icon = 'fa-solid fa-cart-shopping';

		this.nfts = {};
		this.auction_list = [];

		this.styles = ['/agora/style.css'];

		this.agoraKeys = [];

		this.affix_callbacks_to = [];

		this.social = {
			twitter: '@SaitoOfficial',
			title: '🟥 Saito Agora',
			url: 'https://saito.io/agora/',
			description: 'Buy or Sell Saito NFTs and other On-Chain Assets',
			image: 'https://saito.tech/wp-content/uploads/2023/11/agora-300x300.png'
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
		// compile list of agora games (which don't exist yet)
		//
		app.modules.returnModulesRespondingTo('agora-games').forEach((game_mod) => {
			this.agora_games.push(game_mod);
			//
			// and listen to their transactions
			//
			this.affix_callbacks_to.push(game_mod.name);
		});
	}

	shouldAffixCallbackToModule(modname, tx = null) {
		if (modname == 'Agora') {
			return 1;
		}

		//
		// NFT transaction / Bound transaction type
		//
		if (tx?.type == 8) {
			return 1;
		}

		//
		// Maybe already deprecated??
		//
		for (let i = 0; i < this.affix_callbacks_to.length; i++) {
			if (this.affix_callbacks_to[i] == modname) {
				return 1;
			}
		}

		return 0;
	}

	returnServices() {
		let services = [];

		if (this.app.BROWSER == 0) {
			services.push(new PeerService(null, 'Agora', this.publicKey));
		}
		return services;
	}

	async onPeerServiceUp(app, peer, service = {}) {
		if (service.service === 'Agora') {
			//
			// Remember which stores are available on the network
			//
			this.agoraKeys.push(peer);

			//
			// Ask for a list of assets to acquire
			//
			this.app.network.sendRequestAsTransaction(
				'agora retreive records',
				{},
				(records) => {
					console.log('onPeerServiceUp records: ', records);
					this.auction_list = records;
					this.app.connection.emit('agora-render-auction-list-request');
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
			this.main = new AgoraMain(this.app, this);
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
					type: 'navigation',
					callback: function (app, id) {
						navigateWindow('/agora');
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

		if (this.hasSeenTransaction(tx)) {
			return;
		}

		let txmsg = tx.returnMessage();

		if (tx.type == 8) {
			// Bound
			// if from slips less than 3 then its create not send nft tx
			if (tx.from.length < 3) return;

			let to_publicKey = tx.to[1].publicKey;
			let from_publicKey = tx.from[1].publicKey;

			// nft is sent to assestore (list)
			if (tx.isTo(to_publicKey)) {
				console.log('(');
				console.log('(');
				console.log('( Agora Receives Bound TX for ITSELF!');
				console.log('(');
				console.log('(');
				let nft = new SaitoNft(this.app, this);
				nft.createFromTx(tx);
				let nft_id = nft.returnId();

				let seller = from_publicKey;
				let res = await this.setActive(seller, nft_id);
				this.app.connection.emit('agora-update-auction-list-request');
			}

			// assestore is sending nft (delist)
			if (from_publicKey == this.publicKey) {
				console.log('(');
				console.log('(');
				console.log('( Agora Sends NFT');
				console.log('(');
				console.log('(');

				let nft = new SaitoNft(this.app, this);
				nft.createFromTx(tx);
				let nft_id = nft.returnId();

				// console.log("created NFT from tx...", nft);

				let seller = to_publicKey;
				let res = await this.setInactive(seller, nft_id);
				this.app.connection.emit('agora-update-auction-list-request');
			}
		}

		try {
			if (conf == 0) {
				if (txmsg.module === 'Agora') {
					//
					// public & private invites processed the same way
					//
					if (txmsg.request === 'create_list_asset_transaction') {
						await this.receiveListAssetTransaction(tx, blk);
					}

					if (txmsg.request === 'create_delist_asset_transaction') {
						await this.receiveDelistAssetTransaction(tx, blk);
					}
				}
			}
		} catch (err) {
			console.error('ERROR in agora onconfirmation block: ', err);
		}
	}

	/////////////////////////////
	// HANDLE PEER TRANSACTION //
	/////////////////////////////
	//
	async handlePeerTransaction(app, newtx = null, peer, mycallback = null) {
		if (!newtx || this.app.BROWSER) {
			return 0;
		}

		let txmsg = newtx.returnMessage();

		if (txmsg?.request === 'agora retreive records') {
			return this.receiveRetreiveRecordsTransaction(mycallback);
		}

		//if (message.request === 'agora invite list') {
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
	async createListAssetTransaction(nft, receiver) {
		//
		// create the NFT transaction
		//
		const obj = {};
		if (nft.image) obj.image = nft.image;
		if (nft.text) obj.text = nft.text;

		const tx_msg = {
			data: obj,
			module: 'Agora',
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

		console.log('inner nft_tx: ', nfttx);

		//
		// create the auction transaction
		//
		let newtx = await this.app.wallet.createUnsignedTransactionWithDefaultFee();
		newtx.msg = {
			module: 'Agora',
			request: 'create_list_asset_transaction',
			tx: nfttx.serialize_to_web(this.app)
		};

		newtx.type = 0;

		newtx.packData();
		await newtx.sign();

		return newtx;
	}

	async receiveListAssetTransaction(tx, blk = null) {
		try {
			let txmsg = tx.returnMessage();

			let nfttx = new Transaction();
			nfttx.deserialize_from_web(this.app, txmsg.tx);

			let nft = new SaitoNft(this.app, this);
			nft.createFromTx(nfttx);

			let seller = tx.from[0].publicKey;
			let lc = 1;
			let nft_id = nft.returnId();
			let nft_tx = txmsg.tx;
			let nft_sig = nfttx.signature;
			let bsh = blk.hash;
			let bid = blk.id;
			let tid = tx.signature;

			console.log('seller: ' + seller);
			console.log('nft_id: ' + nft_id);
			//console.log("nft_tx: " + nfttx);
			console.log('lc: ' + lc);
			console.log('bsh: ' + bsh);
			console.log('bid: ' + bid);
			console.log('tid: ' + tid);

			//
			// insert the NFT into our platform
			//
			await this.addRecord(seller, nft_id, nft_tx, nft_sig, lc, bsh, bid, tid);

			//
			// and broadcast the embedded tx
			//
			this.app.network.propagateTransaction(nfttx);
		} catch (err) {
			console.error(err);
		}
	}

	///////////////////
	// Delist Assets //
	///////////////////
	//
	// client / browser
	async createDelistAssetTransaction(nft) {
		const newtx = await this.app.wallet.createUnsignedTransactionWithDefaultFee();

		const obj = {
			module: 'Agora',
			request: 'create_delist_asset_transaction',
			nft_id: nft.id,
			seller: this.publicKey
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

			const msg = tx.returnMessage();
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
				'agora'
			);
			if (!rows || rows.length === 0) {
				console.warn('Delist: record not found / not active / wrong seller');
				return;
			}

			console.log('this.app.options.wallet: ', this.app.options.wallet);

			// check if nft held by agora wallet
			const raw = await this.app.wallet.getNftList();

			console.log('getNftList: ', raw);

			const list = typeof raw === 'string' ? JSON.parse(raw) : raw;
			console.log('getNftList list: ', list);
			const nft_owned = (list || []).find((n) => n.id === nft_id);

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
				module: 'Agora',
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

			console.log('delist send bound tx: ', nfttx);

			this.app.network.propagateTransaction(nfttx);
			// this.app.connection.emit('agora-update-auction-list-request');
		} catch (err) {
			console.error('receiveDelistAssetTransaction error:', err);
		}
	}

	//
	// purges invites unaccepted
	//
	purgeAssets() {}

	//
	// SQL Database Management
	//
	async setActive(seller = '', nft_id = '') {
		let sql = `UPDATE records SET active = 1 WHERE seller = $seller AND nft_id = $nft_id`;
		let params = {
			$seller: seller,
			$nft_id: nft_id
		};
		let res = await this.app.storage.runDatabase(sql, params, 'agora');

		console.log('setActive res: ', res);
		return res?.changes;
	}

	async setInactive(seller = '', nft_id = '') {
		console.log('inside setInactive ///');

		let sql = `UPDATE records SET active = 0 WHERE seller = $seller AND nft_id = $nft_id`;
		let params = {
			$seller: seller,
			$nft_id: nft_id
		};
		let res = await this.app.storage.runDatabase(sql, params, 'agora');
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
		seller = '',
		nft_id = '',
		nft_tx = '',
		nft_sig = '',
		lc = 1,
		bsh = '',
		bid = 0,
		tid = 0
	) {
		// prevent empty nft_id, we have UNIQUE('') in table will cause it to be ignored
		if (!nft_id || (typeof nft_id === 'string' && nft_id.trim() === '')) {
			console.warn('addRecord: empty nft_id — not inserting');
			return 0;
		}

		console.log('seller: ' + seller);
		console.log('nft_id: ' + nft_id);
		//console.log("nft_tx: " + nft_tx);
		console.log('nft_sig: ' + nft_sig);
		console.log('lc: ' + lc);
		console.log('bsh: ' + bsh);
		console.log('bid: ' + bid);
		console.log('tid: ' + tid);

		const lcNum = typeof lc === 'bigint' ? Number(lc) : Number(lc) || 0;
		const bidNum = typeof bid === 'bigint' ? Number(bid) : Number(bid) || 0; // handles `3n`
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

		const res = await this.app.storage.runDatabase(sql, params, 'agora');
		console.log('addRecord changes:', res);
		return res?.changes ?? 0;
	}

	async sendRetreiveRecordsTransaction(mycallback = null) {
		let this_self = this;

		for (let p of this.agoraKeys) {
			this.app.network.sendRequestAsTransaction(
				'agora retreive records',
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

	async receiveRetreiveRecordsTransaction(mycallback = null) {
		if (!mycallback) {
			console.warn('No callback');
			return 0;
		}

		let sql = 'SELECT * FROM records WHERE active = 1';
		let params = {};

		let results = await this.app.storage.queryDatabase(sql, params, 'agora');

		mycallback(results);
		return 1;
	}

	webServer(app, expressapp, express) {
		let webdir = `${__dirname}/../../mods/${this.dirname}/web`;
		let this_self = this;

		expressapp.get('/' + encodeURI(this.returnSlug()), async function (req, res) {
			let reqBaseURL = req.protocol + '://' + req.headers.host + '/';

			let updatedSocial = Object.assign({}, this_self.social);

			let html = AgoraHome(app, this_self, app.build_number, updatedSocial);
			if (!res.finished) {
				res.setHeader('Content-type', 'text/html');
				res.charset = 'UTF-8';
				return res.send(html);
			}
			return;
		});

		expressapp.use('/' + encodeURI(this.returnSlug()), express.static(webdir));
	}
}

module.exports = Agora;
