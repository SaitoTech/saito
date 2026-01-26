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
		this.dbname = 'buysaito';

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
		this.erc_saito = null;
		this.time_limit = 15 * 60000;
		// For the full node, to juggle multiple deposit addresses
		this.mixin_accounts = [];

		/* A list of payments to handle
		   stored in a DB every time a status is updated and restored on load for 
		   persistence across server down time

		   Statuses: 
		   		'new' 		-- user has requested a deposit address
		   		'pending' 	-- payment is pending in Mixin account, cleared to issue saito
		   		'confirmed' -- payment in Mixin received (and transfered to safe wallet)
		   		'failed'    -- payment didn't come in...
		   		'cancelled' -- timeout or user cancels
		*/
		this.pending_payments = [];

		this.authorized_public_key = 'cNACSaLdZQfbPkTTud4ezLWFYqRPUCMEt2dgLxJ9Axxx';

		this.available_currencies = [];

		// turn this on to fake receiving a mixin payment and test out the UX flow
		this.local_dev = false;

		this.purchase_overlay = new SaitoPurchaseOverlay(app, this);
	}

	async initialize(app) {
		await super.initialize(app);

		if (!this.app.BROWSER) {
			this.mixin_mod = app.modules.returnModule('Mixin');
			console.log(app.options.server);
			if (
				app.options?.server?.endpoint?.host == 'localhost' ||
				app.options?.server?.endpoint?.host.includes('staging') ||
				app.options?.server?.host.includes('staging')
			) {
				console.log('BUYSAITO ---> Local development mode');
				this.authorized_public_key = this.publicKey;
			} else {
				this.local_dev = false;
			}

			setTimeout(() => {
				if (this.mixin_mod && this.authorized_public_key === this.publicKey) {
					console.log('BUYSAITO --> Iniitalize Mixin Mod!!');
					this.mixin_mod.createAccount();
					this.loadAltAccounts();
					this.loadPendingPayments();
					this.checkPrices();
				}
			}, 2000);
		}
	}

	returnServices() {
		let services = [];
		if (!this.app.BROWSER) {
			if (this.publicKey == this.authorized_public_key) {
				console.log('BUYSAITO ---> I provide saito selling services!!!!');
				services.push(new PeerService(null, 'buysaito'));
			}
		}
		return services;
	}

	async onPeerServiceUp(app, peer, service = {}) {
		if (service.service === 'buysaito') {
			if (this.app.BROWSER) {
				if (this.app.modules.returnActiveModule().respondTo('buysaito')) {
					if (this.local_dev) {
						salert('3rd party crypto purchases of SAITO are available in test mode');
					}
				}
			}
			this.authorized_public_key = peer.publicKey;
			console.warn(
				'BUYSAITO ---> set public key of authorized Saito seller!!!!',
				this.authorized_public_key
			);
		}

		if (service.service === 'relay') {
			if (this.app.BROWSER) {
				if (this.app.modules.returnActiveModule().respondTo('buysaito')) {
					if (this.authorized_public_key) {
						if (this.available_currencies.length == 0) {
							this.app.connection.emit('relay-send-message', {
								recipient: this.authorized_public_key,
								request: 'buysaito available currencies',
								data: null
							});
						}
					}
				}
			}
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

	respondTo(type = '', obj) {
		if (type == 'buysaito') {
			return true;
		}
	}

	attachEvents() {
		let btn = document.getElementById('buysaito-button');
		if (btn) {
			btn.onclick = (e) => {
				if (this.pending_payments.length) {
					this.app.connection.emit('saito-purchase-address-reserved', this.pending_payments[0]);
					return;
				}

				const amount = document.getElementById('purchase-saito-amount').value;
				this.app.connection.emit('saito-purchase-launch', amount);
			};
		}
	}

	async handlePeerTransaction(app, tx = null, peer, mycallback = null) {
		if (tx == null) {
			return 0;
		}

		let txmsg = tx.returnMessage();

		if (!tx.isTo(this.publicKey)) {
			return 0;
		}

		if (txmsg.request.includes('buysaito')) {
			console.log('BUYSAITO - ', txmsg.request, txmsg.data);

			if (txmsg.request == 'buysaito available currencies') {
				if (this.publicKey === this.authorized_public_key) {
					if (!this.available_currencies.length) {
						this.loadAvailableCryptos();
					}
					this.app.connection.emit('relay-send-message', {
						recipient: tx.from[0].publicKey,
						request: 'buysaito available currencies',
						data: this.available_currencies
					});
					this.hasPendingPayment(tx.from[0].publicKey);
				} else if (txmsg.data) {
					this.available_currencies = txmsg.data;
				} else {
					console.warn("BUYSAITO - We are getting a request we shouldn't be...");
					console.warn(txmsg);
				}
			}

			if (txmsg.request === 'buysaito release address') {
				if (this.publicKey === this.authorized_public_key) {
					for (let i = 0; i < this.pending_payments.length; i++) {
						if (
							this.pending_payments[i].publicKey == tx.from[0].publicKey &&
							this.pending_payments[i].ticker == txmsg.data.ticker
						) {
							this.pending_payments[i].status = 'cancelled';
							this.cancelPayment(this.pending_payments[i].id);
						}
					}
				} else {
					console.warn("BUYSAITO - We are getting a request we shouldn't be...");
					console.warn(txmsg);
				}
			}

			if (txmsg.request === 'buysaito reserve address') {
				if (this.publicKey === this.authorized_public_key) {
					// If user has an open address, ignore the new specifics... (?)
					if (!this.hasPendingPayment(tx.from[0].publicKey)) {
						if (!tx.isFrom(txmsg.data.initiator_pubkey)) {
							console.error('BUYSAITO - PublicKey mismatch... ignore payment request');
							return;
						}
						await this.checkPrices();
						this.findAvailableAddress(txmsg.data);
					}
				} else if (tx.isFrom(this.authorized_public_key)) {
					this.pending_payments.push(txmsg.data);
					this.app.connection.emit('saito-purchase-address-reserved', txmsg.data);
				}
			}

			if (txmsg.request === 'buysaito saito issued') {
				if (tx.isFrom(this.authorized_public_key)) {
					for (let j = 0; j < this.pending_payments.length; j++) {
						if (this.pending_payments[j].destination == txmsg.data.destination) {
							this.pending_payments.splice(j, 1);
							this.app.connection.emit('saito-purchase-saito-issued', txmsg.data);
							return;
						}
					}
					console.warn('BUYSAITO - received notification for an Unexpected pending payment');
				} else {
					console.warn('BUYSAITO - Unexpected peer message: ', txmsg);
				}
			}

			return 0;
		}
		return super.handlePeerTransaction(app, tx, peer, mycallback);
	}

	/**
	 * On new block (assuming we get a slip back), try to clear out the payments queue
	 */
	async onNewBlock(blk, lc) {
		if (this.publicKey == this.authorized_public_key && !this.app.BROWSER) {
			await this.processPayments();
		}
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

	//////////////////////////
	/// SERVER FUNCTIONS
	//////////////////////////
	convertSaitoToOther(amount, ticker = null) {
		console.log('Currency Conversion: ', amount, ticker);

		let saito_price = this.erc_saito ? 1.05 * Number(this.erc_saito.price_usd) : 1;
		let usd_price = 0;

		if (ticker) {
			for (let cm of this.mixin_mod.crypto_mods) {
				if (cm.ticker == ticker) {
					usd_price = Number(cm.price_usd);
				}
			}
		}

		console.log(saito_price, usd_price);

		if (usd_price == 0) {
			console.warn('BUYSAITO - No ticker selected for conversion!');
		}

		// calculate
		let amount_to_deposit = (amount * saito_price) / usd_price;

		//restrict to 6 significant digits
		amount_to_deposit = Math.ceil(amount_to_deposit * 1000000) / 1000000;

		// Mixin truncates TRX to 6 digits, send 0.32758538, but received amount: '0.327585',

		return amount_to_deposit;
	}

	loadAvailableCryptos() {
		if (!this.mixin_mod) {
			console.error('BUYSAITO - No mixin module -- loadAvailableCryptos');
			return;
		}

		this.available_currencies = [];

		for (let cm of this.mixin_mod.crypto_mods) {
			if (cm.ticker === 'ERC-SAITO') {
				if (!this.erc_saito) {
					this.erc_saito = cm;
					this.erc_saito.activate();
				}
			} else {
				this.available_currencies.push({
					ticker: cm.ticker,
					price_usd: cm.price_usd,
					last_update: cm.last_update
				});
			}
		}
	}

	async checkPrices() {
		let updated = false;
		for (let cm of this.mixin_mod.crypto_mods) {
			if (!cm.last_update || Date.now() - cm.last_update > 300000) {
				updated = true;
				await cm.returnNetworkInfo();
			}
		}
		if (updated) {
			this.loadAvailableCryptos();
		}
	}

	createNewAltAccount(callback) {
		if (!this.mixin_mod) {
			console.error('Mixin not installed!');
			return;
		}

		this.mixin_mod.createAccount(async (res) => {
			if (res.err || Object.keys(res).length < 1) {
				console.error('BUYSAITO - Mixin create account failed...', res.err);
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

		console.info(
			`BUYSAITO - Service Loaded ${this.mixin_accounts.length} alternate Mixin accounts`
		);
	}

	async loadPendingPayments() {
		let sql = `SELECT * FROM purchases WHERE active = 1`;
		let params = {};

		let res = await this.app.storage.queryDatabase(sql, params, 'buysaito');

		let now = Date.now();
		let expired_cutoff = now - this.time_limit;
		for (let i = 0; i < res.length; i++) {
			if (res[i].created_at < expired_cutoff && res[i].status == 'new') {
				this.cancelPayment(res[i].id);
			} else {
				let pp = Object.assign({}, res[i]);
				pp.ts = pp.created_at;

				delete pp.created_at;
				delete pp.updated_at;

				pp.mixin = this.returnMixinAccountByID(pp.mixin_user_id);
				delete pp.mixin_user_id;

				this.pending_payments.push(pp);
			}
		}

		console.debug(
			`BUYSAITO - Recovered ${this.pending_payments.length} pending payments from the DB`
		);
	}

	hasPendingPayment(publicKey) {
		// Check if this user has a pending payment and send them that info again
		for (let p of this.pending_payments) {
			if (p.initiator_pubkey == publicKey) {
				this.app.connection.emit('relay-send-message', {
					recipient: publicKey,
					request: 'buysaito reserve address',
					data: {
						initiator_pubkey: p.initiator_pubkey,
						issue_amount: p.issue_amount,
						ticker: p.ticker,
						destination: p.destination,
						expected_deposit: p.expected_deposit,
						reserved_until: p.ts + this.time_limit,
						status: 'pending'
					}
				});
				return true;
			}
		}
		return false;
	}

	returnMixinAccountByID(user_id) {
		if (user_id == this.mixin_mod.mixin.user_id) {
			return this.mixin_mod.mixin;
		}

		for (let j = 0; j < this.mixin_accounts.length; j++) {
			if (this.mixin_accounts[j].user_id == user_id) {
				return this.mixin_accounts[j];
			}
		}

		console.error('Mixin account not found: ', user_id);
		return null;
	}

	checkAvailability(ticker, destination) {
		for (let ep of this.pending_payments) {
			if (ep.ticker == ticker && ep.destination == destination) {
				return false;
			}
		}
		console.log(ticker + ':' + destination + ' available!');
		return true;
	}

	//
	// 	publicKey, issue_amount, ticker,  tx
	//
	async findAvailableAddress(payment_data) {
		//Is my main available?
		const cm = this.app.wallet.returnCryptoModuleByTicker(payment_data.ticker);
		await cm.activate();

		const ticker = payment_data.ticker;
		let destination = cm.address;

		if (this.checkAvailability(ticker, destination)) {
			await this.createPendingPayment(destination, payment_data, this.mixin_mod.mixin);
			return; // exit here
		} else {
			for (let m of this.mixin_accounts) {
				destination = await this.mixin_mod.createDepositAddress(null, cm.chain_id, m);
				if (this.checkAvailability(ticker, destination)) {
					await this.createPendingPayment(destination, payment_data, m);
					return; // exit here
				}
			}
		}

		console.info('BUYSAITO - Creating New Alt Account for Payment Processing...');
		this.createNewAltAccount(async (keys) => {
			// Take the last one
			destination = await this.mixin_mod.createDepositAddress(null, cm.chain_id, keys);
			await this.createPendingPayment(destination, payment_data, keys);
		});
	}

	async createPendingPayment(destination, payment_data, mixin_account) {
		// Add remaining fields
		payment_data.destination = destination;
		payment_data.ts = Date.now();
		payment_data.status = 'new';
		payment_data.mixin = mixin_account;

		// Do the math
		payment_data.expected_deposit = this.convertSaitoToOther(
			payment_data.issue_amount,
			payment_data.ticker
		);

		this.pending_payments.push(payment_data);

		//
		// Send key info back to user
		//
		this.app.connection.emit('relay-send-message', {
			recipient: payment_data.initiator_pubkey,
			request: 'buysaito reserve address',
			data: {
				initiator_pubkey: payment_data.initiator_pubkey,
				recipient_pubkey: payment_data.recipient_pubkey,
				issue_amount: payment_data.issue_amount,
				ticker: payment_data.ticker,
				destination: payment_data.destination,
				expected_deposit: payment_data.expected_deposit,
				reserved_until: payment_data.ts + this.time_limit
			}
		});

		// back up to DB
		let sql = `INSERT INTO purchases (initiator_pubkey, recipient_pubkey, ticker, mixin_user_id, destination, issue_amount, expected_deposit, status, tx, created_at) 
		VALUES ($initiator_pubkey, $recipient_pubkey, $ticker, $mixin_user_id, $destination, $issue_amount, $expected_deposit, $status, $tx, $created_at)`;

		let params = {
			$initiator_pubkey: payment_data.initiator_pubkey,
			$recipient_pubkey: payment_data.recipient_pubkey,
			$ticker: payment_data.ticker,
			$mixin_user_id: mixin_account.user_id,
			$destination: payment_data.destination,
			$issue_amount: payment_data.issue_amount,
			$expected_deposit: payment_data.expected_deposit,
			$status: payment_data.status,
			$tx: payment_data.tx,
			$created_at: payment_data.ts
		};

		let res = await this.app.storage.runDatabase(sql, params, 'buysaito');

		console.debug('BUYSAITO - Saved new pending payment: ', res);

		if (res?.lastID) {
			payment_data.id = res.lastID;
		}

		console.debug(this.pending_payments);
	}

	async authorizePaymentIssuance(payment_data) {
		payment_data.status = 'pending';

		let sql = `UPDATE purchases SET status = "pending", updated_at = $updated_at WHERE id=$id`;
		let params = { $id: payment_data.id, $updated_at: Date.now() };
		await this.app.storage.runDatabase(sql, params, 'buysaito');
	}

	async confirmPaymentReceipt(payment_data) {
		payment_data.status = 'confirmed';

		let sql = `UPDATE purchases SET status = "confirmed", external_address = $external_address, updated_at = $updated_at WHERE id=$id`;
		let params = {
			$id: payment_data.id,
			$external_address: payment_data.external_address || '',
			$updated_at: Date.now()
		};
		await this.app.storage.runDatabase(sql, params, 'buysaito');
	}

	async cancelPayment(payment_id) {
		let sql = `UPDATE purchases SET active = 0, status = "failed", updated_at = $updated_at WHERE id=$id`;
		let params = { $id: payment_id, $updated_at: Date.now() };

		await this.app.storage.runDatabase(sql, params, 'buysaito');
	}

	async finishPayment(payment_data) {
		let sql = `UPDATE purchases SET active = 0, paid = $paid, updated_at = $updated_at WHERE id=$id`;
		let params = { $id: payment_data.id, $paid: payment_data.paid, $updated_at: Date.now() };

		await this.app.storage.runDatabase(sql, params, 'buysaito');

		this.app.connection.emit('relay-send-message', {
			recipient: payment_data.initiator_pubkey,
			request: 'buysaito saito issued',
			data: payment_data
		});

		console.debug('Payment done: ', payment_data);
	}

	clearInactivePayments() {
		// Check for expired addresses
		for (let pp of this.pending_payments) {
			if (pp.status == 'new' && pp.created_at + this.time_limit < Date.now()) {
				pp.status = 'failed';
				this.cancelPayment(pp.id);
			}
		}

		// Clear from list
		for (let i = this.pending_payments.length - 1; i >= 0; i--) {
			if (
				this.pending_payments[i].status == 'cancelled' ||
				this.pending_payments[i].status == 'failed' ||
				(this.pending_payments[i].status == 'confirmed' && this.pending_payments[i].paid)
			) {
				this.pending_payments.splice(i, 1);
			}
		}
	}

	async processPayments() {
		// First clear out any inactive payments
		this.clearInactivePayments();

		// Second, make sure we have something to process
		if (!this.pending_payments.length) {
			return;
		}

		// Third, check Mixin to update status
		for (let pp of this.pending_payments) {
			let success = false;
			if (pp.status !== 'confirmed') {
				console.log('Checking pending payments...');
				let { deposits, utxo, snapshots } = await this.mixin_mod.consolidatedLookUp(
					pp.ticker,
					pp.destination,
					pp.ts,
					pp.mixin
				);

				console.log(deposits, utxo, snapshots);

				// Check pending deposits (first)
				for (let j = 0; j < deposits.length; j++) {
					if (Number(deposits[j].amount) >= pp.expected_deposit) {
						if (deposits[j].status == 'confirmed') {
							// Mark as confirmed
							await this.confirmPaymentReceipt(pp);
							success = true;
						} else if (pp.status == 'new') {
							// Mark as pending
							await this.authorizePaymentIssuance(pp);
							success = true;
						}
					} else {
						console.warn('Unexpected payment to mixin account...');
					}
				}

				// Check if in safe snapshot history
				if (!success) {
					for (let j = 0; j < snapshots.length; j++) {
						if (Number(snapshots[j].amount) >= pp.expected_deposit) {
							// Mark as confirmed
							pp.external_address = snapshots[j].deposit?.sender;
							await this.confirmPaymentReceipt(pp);
						} else {
							console.warn('Unexpected payment to mixin account...');
						}
					}
				}

				if (this.local_dev) {
					if (Math.random() > 0.5) {
						if (pp.status == 'new') {
							await this.authorizePaymentIssuance(pp);
						} else if (pp.status == 'pending') {
							await this.confirmPaymentReceipt(pp);
						}
					}
				}
			}
		}

		// Fourth, issue payments

		for (let pp of this.pending_payments) {
			if (pp.status !== 'new' && !pp.paid) {
				await this.createSaitoIssuanceTransaction(pp)
					.then((sig) => {
						pp.paid = sig;
						pp.active = 0;
						this.finishPayment(pp);
					})
					.catch((err) => {
						// Don't do anything other than report the error
						console.error(err);
					});
			}
		}
	}

	async createSaitoIssuanceTransaction(payment_data) {
		let newtx = await this.app.wallet.createUnsignedTransactionWithDefaultFee(
			payment_data.recipient_pubkey,
			this.app.wallet.convertSaitoToNolan(payment_data.issue_amount)
		);

		if (payment_data.tx) {
			let userTX = new Transaction();
			userTX.deserialize_from_web(this.app, payment_data.tx);
			newtx.msg = userTX.returnMessage();
		} else {
			newtx.msg = {
				module: 'BuySaito',
				request: 'buysaito issuance',
				data: payment_data
			};
		}

		console.debug(
			`Issuing ${payment_data.issue_amount} Saito to ${payment_data.recipient_pubkey} with tx_msg: `,
			newtx.msg
		);

		await newtx.sign();
		await this.app.network.propagateTransaction(newtx);

		return newtx.signature;
	}
}

module.exports = BuySaito;
