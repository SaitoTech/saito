const PeerService = require('saito-js/lib/peer_service').default;
const Transaction = require('../../lib/saito/transaction').default;
const saito = require('./../../lib/saito/saito');
const ModTemplate = require('../../lib/templates/modtemplate');
const AssetStoreMain = require('./lib/main/main');
const SaitoHeader = require('./../../lib/saito/ui/saito-header/saito-header');
const AssetStoreHome = require('./index');

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


		this.styles = ['/assetstore/style.css'];

		//this.services = [this.app.network.createPeerService(null, 'assetstore', '', 'saito')];

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

		let txmsg = tx.returnMessage();
		let assetstore_self = this.app.modules.returnModule('AssetStore');

		try {
			if (conf == 0) {
				if (txmsg.module === 'AssetStore') {

					if (this.hasSeenTransaction(tx)) {
						return;
					}

					//
					// public & private invites processed the same way
					//
					//if (txmsg.request === 'open' || txmsg.request === 'private') {
					//	await assetstore_self.receiveOpenTransaction(tx, blk);
					//}

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
		let message = newtx.returnMessage();

		//if (message.request === 'assetstore invite list') {
		//	// Process stuff on server side, then...
		//	if (mycallback) {
		//		mycallback(txs);
		//		return 1;
		//	}
		//}

		return super.handlePeerTransaction(app, newtx, peer, mycallback);
	}


	/////////////////////////////
	// List and De-List Assets //
	/////////////////////////////
	//
	async createListAssetTransaction(nft) {

		let sendto = this.publicKey;
		let moduletype = 'AssetStore';

		//let { timestamp, name, options, players_needed, invitation_type } = gamedata;

		//let newtx = await this.app.wallet.createUnsignedTransactionWithDefaultFee();
		//newtx.addTo(this.publicKey);

		newtx.msg = {
			timestamp: timestamp,
			module: moduletype,
			request: invitation_type,
		};

		//newtx.packData();
		//await newtx.sign();

		return newtx;
	}

	async receiveListAssetTransaction(tx, blk = null) {
		let txmsg = tx.returnMessage();
	}


	//
	// purges invites unaccepted
	//
	purgeAssets() {
	}



	shouldAffixCallbackToModule(modname) {
		if (modname == 'AssetStore') {
			return 1;
		}
		for (let i = 0; i < this.affix_callbacks_to.length; i++) {
			if (this.affix_callbacks_to[i] == modname) {
				return 1;
			}
		}
		return 0;
	}

}

module.exports = AssetStore;
