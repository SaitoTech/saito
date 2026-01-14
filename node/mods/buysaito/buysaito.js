const PeerService = require('saito-js/lib/peer_service').default;
const Transaction = require('../../lib/saito/transaction').default;
const saito = require('./../../lib/saito/saito');
const ModTemplate = require('../../lib/templates/modtemplate');
const SaitoHeader = require('./../../lib/saito/ui/saito-header/saito-header');
const BuySaitoHome = require('./index');
const SaitoPurchaseOverlay = require('./lib/saito-purchase');

//
//

class BuySaito extends ModTemplate {
	constructor(app) {
		super(app);

		this.name = 'BuySaito';
		this.slug = 'buy';

		this.dependencies = ['Relay', 'Mixin', 'ERC'];
		this.description = 'Testnet BuySaito for Testing and Application Development';
		this.categories = 'Utility Ecommerce NFTs';

		this.social = {
			twitter: '@SaitoOfficial',
			title: '🟥 Saito BuySaito',
			url: 'https://saito.io/buysaito/',
			description: 'Get Testnet Saito',
			image: 'https://saito.tech/wp-content/uploads/2023/11/buysaito-300x300.png'
		};

		this.mixin_mod = null;

		// For the full node, to juggle multiple deposit addresses
		this.mixin_accounts = [];

		this.authorized_public_key = null;

		/////////////////////////////////////////////
		// * = Accept all installed crypto modules
		// or provide an array of acceptable TICKER
		this.acceptable_currencies = '*';

		this.purchase_overlay = new SaitoPurchaseOverlay(app, this);
	}

	async initialize(app) {
		await super.initialize(app);

		if (!this.app.BROWSER) {
			this.mixin_mod = app.modules.returnModule('Mixin');

			if (app.options?.server?.host == 'localhost') {
				console.log('---> Buy Saito Local development mode');
				this.authorized_public_key = this.publicKey;
			}

			setTimeout(() => {
				if (this.mixin_mod && this.authorized_public_key === this.publicKey) {
					this.mixin_mod.createAccount();
					this.loadAltAccounts();
				}
			}, 5000);
		}
	}

	returnServices() {
		let services = [];
		if (!this.app.BROWSER) {
			if (this.publicKey == this.authorized_public_key) {
				console.log('---> I provide saito selling services!!!!');
				services.push(new PeerService(null, 'buysaito'));
			}
		}
		return services;
	}

	async onPeerServiceUp(app, peer, service = {}) {
		if (service.service === 'buysaito') {
			console.warn('---> set public key of authorized Saito seller!!!!');
			this.authorized_public_key = peer.publicKey;
		}
	}

	async render() {
		//
		// browsers only!
		//
		if (!this.app.BROWSER || !this.browser_active) {
			return;
		}

		if (!this.header) {
			this.header = new SaitoHeader(this.app, this);
			await this.header.initialize(this.app);
			this.header.header_class = 'arcade';
			this.addComponent(this.header);
		}

		await super.render();

		this.attachEvents();
	}

	attachEvents() {
		let btn = document.getElementById('buysaito-button');
		if (btn) {
			btn.onclick = (e) => {
				const amount = document.getElementById('purchase-saito-amount').value;
				console.log('Saito Amount to Quote...', amount);
				this.app.connection.emit('saito-purchase-launch', amount);
			};
		}
	}

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
			return;
		}

		console.log('###############################');
		console.log('BuySaito onConfirmation: ', tx);
		console.log('###############################');

		//
		// Bound Transactions (monitor NFT transfers)
		//
		let txmsg = tx.returnMessage();

		if (txmsg.request === 'buysaito request') {
			if (!this.app.BROWSER) {
				await this.receiveBuySaitoRequestTransaction(tx, blk);
			} else {
				if (tx.isFrom(this.publicKey)) {
					siteMessage('BuySaito Token Request received by Server...', 5000);
				}
			}
			return;
		}

		if (txmsg.request === 'buysaito issuance') {
			if (tx.isTo(this.publicKey)) {
				siteMessage('BuySaito Payment Received...', 3000);
				try {
					let msg = document.querySelector('.saito-container p');
					msg.innerHTML = 'please check your wallet...';
				} catch (err) {}
			}
			return;
		}
	}

	async createBuySaitoTransaction() {
		//
		// create the wrapper transaction
		//
		let newtx = await this.app.wallet.createUnsignedTransactionWithDefaultFee();
		newtx.msg = {
			module: 'BuySaito',
			request: 'buysaito request'
		};
		newtx.type = 0;
		newtx.packData();
		await newtx.sign();
		return newtx;
	}

	async receiveBuySaitoRequestTransaction(tx = null, blk = null) {
		//
		// sanity check transaction is valid
		//
		if (tx == null || blk == null) {
			return;
		}

		let receiver = tx.from[0].publicKey;
		let newtx = await this.app.wallet.createUnsignedTransactionWithDefaultFee(
			receiver,
			// uh... what!
			this.amount
		);
		newtx.msg = {
			module: 'BuySaito',
			request: 'buysaito issuance'
		};
		newtx.packData();
		await newtx.sign();
		this.app.network.propagateTransaction(newtx);
	}

	webServer(app, expressapp, express) {
		let webdir = `${__dirname}/../../mods/${this.dirname}/web`;
		let buysaito_self = this;

		expressapp.get('/' + encodeURI(this.returnSlug()), async function (req, res) {
			let reqBaseURL = req.protocol + '://' + req.headers.host + '/';

			let updatedSocial = Object.assign({}, buysaito_self.social);

			let html = BuySaitoHome(app, buysaito_self, app.build_number, updatedSocial);
			if (!res.finished) {
				res.setHeader('Content-type', 'text/html');
				res.charset = 'UTF-8';
				return res.send(html);
			}
			return;
		});

		expressapp.use('/' + encodeURI(this.returnSlug()), express.static(webdir));
	}

	createNewAltAccount(callback) {
		if (!this.mixin_mod) {
			console.error('Mixin not installed!');
			return;
		}

		this.mixin_mod.createAccount(async (res) => {
			if (res.err || Object.keys(res).length < 1) {
				console.error('Mixin create account failed...', res.err);
				return;
			}

			// Save encrypted Mixin account (keys) in our own DB...
			let sql = `INSERT INTO mixin_accounts (publickey, mixin_json) VALUES ($publickey, $mixin_json) `;
			let params = {
				$publickey: this.publicKey,
				$mixin_json: res.res
			};

			await this.app.storage.runDatabase(sql, params, 'buysaito');

			// Add raw account keys to our accounts array...
			this.mixin_accounts.push(res.keys);

			// Run provided callback because we don't have a direct return value...
			if (callback) {
				callback(res.keys);
			}
		}, true);
	}

	async loadAltAccounts() {
		let sql = `SELECT * FROM mixin_accounts WHERE publickey = $publickey`;
		let params = { $publickey: this.publicKey };

		let res = await this.app.storage.queryDatabase(sql, params, 'buysaito');

		const privateKey = await this.app.wallet.getPrivateKey();

		for (let r of res) {
			// Unencrypt
			const buf1 = Buffer.from(r.mixin_json, 'base64');
			const buf2 = this.app.crypto.decryptWithPrivateKey(buf1, privateKey);
			this.mixin_accounts.push(JSON.parse(buf2.toString('utf8')));
		}

		console.info(`BuySaito Service Loaded ${this.mixin_accounts.length} alternate Mixin accounts`);
	}
}

module.exports = BuySaito;
