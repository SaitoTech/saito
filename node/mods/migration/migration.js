const ModTemplate = require('./../../lib/templates/modtemplate');
const MigrationMain = require('./lib/main');
const SaitoHeader = require('../../lib/saito/ui/saito-header/saito-header');
const SaitoOverlay = require('../../lib/saito/ui/saito-overlay/saito-overlay');

const PeerService = require('saito-js/lib/peer_service').default;

class Migration extends ModTemplate {
	constructor(app) {
		super(app);

		this.app = app;
		this.name = 'Migration';
		this.slug = 'migration';
		this.description = 'Migrate ERC20 or BEP20 tokens to Saito Native Tokens';
		this.categories = 'Core Utilities Messaging';
		this.styles = ['/migration/style.css'];

		this.dependencies = ['Relay', 'Mixin', 'ERC', 'MailRelay'];

		this.main = null;
		this.header = null;
		this.overlay = new SaitoOverlay(this.app, this, false);

		this.key_cache = {}; // Mapping from Mixin Address --> Saito publicKey
		this.pending_payments = [];

		this.wrapped_saito_ticker = 'ERC-SAITO';
		this.MAX_DEPOSIT = 500000; // Max of 500k at a time

		this.relay_available = false;
		this.can_auto = false;
		this.ercMod = null;

		this.local_dev = true;

		//this.migration_publickey = 'zYCCXRZt2DyPD9UmxRfwFgLTNAqCd5VE8RuNneg4aNMK';
		this.migration_publickey = 'cNACSaLdZQfbPkTTud4ezLWFYqRPUCMEt2dgLxJ9Axxx';
		this.migration_mixin_address = '';

		return this;
	}

	async initialize(app) {
		await super.initialize(app);

		if (!this.app.BROWSER) {
			if (this.local_dev) {
				this.migration_publickey = this.publicKey;
				console.warn('---> I am the migration bot for local testing!!!!');
			}

			await this.load();

			return;
		}
	}

	returnServices() {
		let services = [];
		if (!this.app.BROWSER) {
			if (this.publicKey == this.migration_publickey) {
				console.log('---> I provide migration services!!!!');
				services.push(new PeerService(null, 'migration'));
			}
		}
		return services;
	}

	async onPeerServiceUp(app, peer, service = {}) {
		// Update migration service node address
		if (this.browser_active) {
			if (service.service == 'migration') {
				console.warn('---> update public key of Migration bot for local testing!!!!');
				this.migration_publickey = peer.publicKey;
			}

			if (service.service == 'relay') {
				this.relay_available = true;
			}

			//
			// Make sure Mixin is online in case we need to create an account
			//
			if (service.service === 'mixin') {
				setTimeout(async () => {
					try {
						if (this.ercMod) {
							await this.ercMod.activate();

							if (this.relay_available && this.ercMod?.address) {
								console.log('My address: ', this.ercMod.formatAddress());
								this.sendMigrationPingTransaction({ mixin_address: this.ercMod.formatAddress() });
								siteMessage('checking if automated migration available...', 2000);
								return;
							}
						} else {
							salert('Automated Migration requires Mixin and ERC modules to be installed!');
						}
					} catch (err) {
						console.error(err);
						salert('Unable to initialize deposit address for automated migration');
					}
				}, 1000);
			}
		}
	}

	async render() {
		this.main = new MigrationMain(this.app, this);
		this.header = new SaitoHeader(this.app, this);
		await this.header.initialize(this.app);

		this.addComponent(this.main);
		this.addComponent(this.header);

		await super.render(this.app, this);

		// Set this on rendering... All modules will be initialized, so guaranteed to return if available.
		try {
			this.ercMod = this.app.wallet.returnCryptoModuleByTicker(this.wrapped_saito_ticker);
		} catch (err) {
			console.error(err);
		}
	}

	shouldAffixCallbackToModule(modname) {
		if (modname == this.name) {
			return 1;
		}

		// Monitor "crypto" transactions

		const my_cryptos = this.app.wallet.returnInstalledCryptos(false);

		for (let mc of my_cryptos) {
			if (mc.name == modname) {
				return 1;
			}
		}

		return 0;
	}

	async handlePeerTransaction(app, tx = null, peer, mycallback) {
		if (tx?.isTo(this.publicKey)) {
			let txmsg = tx.returnMessage();

			if (txmsg.request == 'migration accept') {
				await this.receiveMigrationResponseTransaction(app, tx, peer, mycallback);
			}

			if (txmsg.request == 'migration check') {
				await this.receiveMigrationPingTransaction(tx);
			}

			if (txmsg.request == 'migration failure') {
				if (this.app.BROWSER) {
					salert(
						'Uh oh, something went wrong with the automated migration. Please back up your wallet to ensure the security of your tokens and contact the team for a manual resolution.'
					);
				}
			}
		}
	}

	async onConfirmation(blk, tx, conf) {
		//
		// Just double checking that browsers only process what is addressed to them
		//
		if (this.app.BROWSER && !tx.isTo(this.publicKey)) {
			return;
		}

		let txmsg = tx.returnMessage();

		if (Number(conf) == 0) {
			if (txmsg.request === 'save migration data') {
				await this.receiveStoreMigrationTransaction(blk, tx, conf);
			}

			if (txmsg.request == 'migration check') {
				this.receiveMigrationPingTransaction(tx);
			}

			if (txmsg.request === 'crypto payment') {
				if (this.app.BROWSER) {
					// Browsers will process receipt of funds (log and update UI) inside their crypto module
					return;
				}

				console.log(
					'>>>>>>>>>> crypto payment',
					'Conf:',
					conf,
					'Block: ',
					blk.id,
					'\n>>',
					tx,
					'\n>>',
					tx.to
				);
				// tells the migration bot that the user's deposit is complete
				this.receiveCryptoPaymentTransaction(tx, blk);
			}
		}
	}

	/**
	 * On new block (assuming we get a slip back), try to clear out the payments queue
	 */
	async onNewBlock(blk, lc) {
		if (this.app.BROWSER) {
			return;
		}
		if (!this.pending_payments?.length) {
			return;
		}
	}

	/**
	 *  Send transaction for manual migration
	 */
	async sendStoreMigrationTransaction(app, mod, data) {
		let obj = {
			module: this.name,
			request: 'save migration data',
			data: {}
		};
		for (let key in data) {
			obj.data[key] = data[key];
		}

		let newtx = await this.app.wallet.createUnsignedTransaction();
		newtx.msg = obj;
		await newtx.sign();
		await this.app.network.propagateTransaction(newtx);

		return newtx;
	}

	/**
	 *  Send transaction for manual migration
	 */
	async receiveStoreMigrationTransaction(blk, tx, conf) {
		try {
			//
			// browsers
			//
			if (this.app.BROWSER == 1) {
				return;
			}

			//
			// servers
			//
			let txmsg = tx.returnMessage();
			let sql = `INSERT INTO migration ( 
	    						publickey,
	    						erc20,
	    						erc20_tx_id,
	    						email,
	    						saito_isssued,
	    						created_at
	  						 )
	               VALUES ( 
	                $publickey,
	                $erc20,
	                '',
	                $email,
	                0,
	                $created_at
	               )`;
			let params = {
				$publickey: txmsg.data.pk,
				$erc20: txmsg.data.erc20,
				$email: txmsg.data.email,
				$created_at: tx.timestamp
			};
			await this.app.storage.runDatabase(sql, params, 'migration');
		} catch (err) {
			console.error('ERROR in saving migration data to db: ' + err);
		}
	}

	async sendFailureNotification(publickey) {
		let newtx = await this.app.wallet.createUnsignedTransactionWithDefaultFee(publickey);

		newtx.msg = {
			module: this.name,
			request: 'migration failure',
			data: null
		};

		await newtx.sign();

		this.app.connection.emit('relay-transaction', newtx);
	}

	/**
	 * [BROWSER] Ping the Migration Bot to:
	 * -- check its availability
	 * -- let it cache my publickey & mixin account number
	 * -- get its mixin account number
	 *
	 * We ping the migration bot twice. The first time on chain to make sure that
	 * our account is able to send onChain transactions (wallet version not screwed up)
	 *
	 * And the second time to confirm that the bot still has sufficient balance for the transfer
	 */
	async sendMigrationPingTransaction(data, offchain = false) {
		if (!this.migration_publickey) {
			return;
		}

		let newtx = await this.app.wallet.createUnsignedTransactionWithDefaultFee(
			this.migration_publickey
		);

		newtx.msg = {
			module: this.name,
			request: 'migration check',
			data
		};

		await newtx.sign();

		console.log('Sending ping to migration bot: ', this.migration_publickey);
		if (offchain) {
			this.app.connection.emit('relay-transaction', newtx);
		} else {
			await this.app.network.propagateTransaction(newtx);
		}
	}

	/**
	 * [SERVER] Migration Bot respond to Ping
	 * -- give user transfer details (address, max amount)
	 * -- cache user's Saito public key and Mixin account number
	 */
	async receiveMigrationPingTransaction(tx) {
		let txmsg = tx.returnMessage();
		let saitozen = tx.from[0].publicKey;

		// Only respond if I am the known migration bot
		if (!this.publicKey == this.migration_publickey) {
			return;
		}

		if (!this.ercMod) {
			try {
				this.ercMod = this.app.wallet.returnCryptoModuleByTicker(this.wrapped_saito_ticker);
				console.log('My address: ', this.ercMod.formatAddress());
				await this.ercMod.activate();
			} catch (err) {
				this.ercMod = false;
				console.error(err);
				return;
			}
		}

		//
		// Save the key on the secondary off-chain confirmation
		//
		if (txmsg?.data?.double_check) {
			this.key_cache[txmsg.data.mixin_address] = saitozen;
		}

		let newtx = await this.app.wallet.createUnsignedTransactionWithDefaultFee(saitozen);

		let error = null;
		// Check balance

		let min_deposit = 0;
		let max_deposit = await this.app.wallet.getBalance('SAITO');
		max_deposit = Number(this.app.wallet.convertNolanToSaito(max_deposit));

		if (max_deposit > this.MAX_DEPOSIT) {
			max_deposit = this.MAX_DEPOSIT;
		} else {
			this.sendLowBalanceEmail(max_deposit);
		}

		let mixin_address = '';

		if (!this.ercMod) {
			error = "Migration bot doesn't have ERC20 Saito installed";
		} else {
			await this.ercMod.activate();
			mixin_address = this.ercMod.formatAddress();
		}

		if (max_deposit < 1000) {
			error = 'Insufficient balance in the Migration bot';
		}

		newtx.msg = {
			module: 'Migration',
			request: 'migration accept',
			data: {
				min_deposit,
				max_deposit,
				mixin_address,
				error,
				go: txmsg.data?.double_check
			}
		};

		await newtx.sign();

		this.app.connection.emit('relay-transaction', newtx);
	}

	async receiveMigrationResponseTransaction(app, tx, peer, mycallback) {
		if (app.BROWSER) {
			let txmsg = tx.returnMessage();

			if (txmsg.data.error) {
				console.error(txmsg.data.error);
				let btn = document.querySelector('button#automatic');
				if (btn) {
					btn.title = txmsg.data.error;
				}
				// We have deposited and want to finish the transfer, so need a more robust failure mode
				if (txmsg.data.go) {
					salert(
						'Migration Bot currently unable to process: \n' +
							txmsg.data.error +
							'\n Your ERC20 SAITO are safe on this wallet, you can refresh later to complete the migration'
					);
				}
				return;
			}

			// Maybe the migration server changes the deposit address...
			this.migration_mixin_address = txmsg.data.mixin_address;
			this.max_deposit = txmsg.data.max_deposit;

			this.can_auto = true;

			if (txmsg.data?.go) {
				let new_balance = Number(this.ercMod.returnBalance());
				if (this.local_dev) {
					new_balance = 100000 * Math.random();
					new_balance = Number(new_balance.toFixed(8));
				}

				this.main.processDepositedSaito(new_balance);
			} else {
				// We are already sitting on some ERC20 wrapped SAITO
				this.balance = Number(this.ercMod.returnBalance());
				this.main.render();
			}
		}
	}

	receiveCryptoPaymentTransaction(tx, blk) {
		let txmsg = tx.returnMessage();

		const tx_sender = tx?.from[0]?.publicKey;
		const { amount, from } = txmsg;

		//
		// This should be confirmation that the Migration Bot's disbursement is onChain
		//
		if (tx.isFrom(this.publicKey)) {
			console.log('***** Migration Disbursement confirmed...');
			this.savePaymentFromBot(tx);
			this.notifyTeam(txmsg, tx_sender, 2, `TX Signature: ${tx.signature}<br>Block ID: ${blk?.id}`);
			return;
		}

		//
		if (tx.isTo(this.publicKey)) {
			console.log('**** Migration processing crypto transfer...');

			//  module: 'ERC-SAITO',
			//  request: 'crypto payment',
			//  amount: '36293.58109136',
			//  from: '0x9e97e4c1201E961F6586fC5293b801e9e0d07859|e15bbf5b-f385-348f-b1a8-31ba2b0aae12|mixin',
			//  to: '0x1f7Fb1952bAd0be96d61971a95d1Ca1cA8b21A17|60b3be17-a4f7-363a-a2c7-06dc1f25bee9|mixin',
			//  hash: 'ce23e0df0c53a9605834101d71d89fcf84cf3f52757850856ca9074ba9a63017'

			if (txmsg.module !== this.wrapped_saito_ticker) {
				this.notifyTeam(txmsg, 0, tx_sender, 'Processing a crypto transfer tx for non-Saito!!');
				console.error('Processing a crypto transfer tx for non-Saito!!');
				return;
			}

			this.savePaymentToBot(tx);

			let saitozen_key = this.key_cache[from];

			if (!saitozen_key || !tx.isFrom(saitozen_key)) {
				this.notifyTeam(
					txmsg,
					tx_sender,
					0,
					`Received a ${txmsg.module.toUpper()} transaction from an unknown sender!!`
				);
				console.error('Process a crypto transfer from an unknown sender!!!');
				return;
			}

			const disburseSaito = () => {
				let sm = this.app.wallet.returnCryptoModuleByTicker('SAITO');
				sm.sendPayment(amount, saitozen_key, txmsg.hash + 1)
					.then(() => {
						this.notifyTeam(txmsg, saitozen_key, 1);
					})
					.catch((err) => {
						this.notifyTeam(txmsg, saitozen_key, 0, err);
						console.error(err);
						this.sendFailureNotification(saitozen_key);
					});
			};

			if (this.local_dev) {
				console.info('Disbursing Saito without verification because local testing...');
				disburseSaito();
			} else {
				this.ercMod.checkHistory((history) => {
					for (let h of history) {
						if (h.counter_party?.address) {
							if (txmsg.from.includes(h.counter_party?.address)) {
								if (Number(amount) == h.amount) {
									console.info("Payment 'Verified' in Mixin history");
									disburseSaito();
									return;
								}
							}
						}
					}
				});
			}
		}
	}

	savePaymentToBot(tx) {}

	async load() {
		let sql = `SELECT * FROM auto_migration WHERE issued_at = 0`;
		let params = {};

		let sqlResults = await this.app.storage.queryDatabase(sql, params, 'migration');

		console.log('MIGRATION: DB Check -- ', sqlResults);

		if (sqlResults.length > 0) {
			for (let s of sqlResults) {
				this.pending_payments.push({
					publicKey: s.publickey,
					nolan: s.nolan_received
				});
			}
		}
	}

	/**
	 * Format and send email for record keeping
	 */
	async notifyTeam(txmsg, pk, result, msg) {
		const { amount, from } = txmsg;

		let emailtext;

		// 2 -> Whole process confirmed onChain, tokens migrated!
		if (result == 2) {
			let x = await this.app.wallet.getBalance();
			let y = this.app.wallet.convertNolanToSaito(x);

			emailtext = `
					<div>
				     	<p>Saito Automated Migration Complete!</p>
				     	<hr>
				        <p>Migration Bot issued ${this.app.browser.formatDecimals(txmsg.amount, true)} ${txmsg.module} to ${txmsg.to}</p>
				     	<p></p>
				     	<p>${msg}</p>
				        <p>Remaining BALANCE: ${this.app.browser.formatDecimals(y)}</p>
				     </div>
			     	`;

			if (Number(y) < 500000) {
				this.sendLowBalanceEmail(Number(y));
			}
		} else {
			emailtext = `
			      <div>
			     	<p>Saito Automated Migration Transfer Service</p>
			     	<hr>
			     	<p>Tokens received by Migration Bot:</p>
			     	<p>TICKER: ${txmsg.module} </p>
			        <p>AMOUNT: ${this.app.browser.formatDecimals(txmsg.amount, true)} </p>
			        <p>FROM: ${from}</p>
			        <p>PUBLICKEY: ${pk}</p>
			     	<p></p>
			     	`;

			// 1 -> sent tokens to Saitozen, but not confirmed
			if (result) {
				emailtext += `<p>Disbursing SAITO!</p></div>`;
			} else {
				// Something went wrong!!!
				emailtext += `<p>Error: ${msg}</p></div>`;
			}
		}

		this.app.connection.emit('mailrelay-send-email', {
			to: 'migration@saito.tech',
			from: 'Saito Token Migration <info@saito.tech>',
			subject: `Saito Token Automated Migration Alert (${result ? 'Success!' : 'Error!'})`,
			html: emailtext,
			ishtml: true,
			bcc: 'migration@saito.io'
		});
	}

	sendLowBalanceEmail(balance) {
		this.app.connection.emit('mailrelay-send-email', {
			to: 'migration@saito.tech',
			from: 'Saito Token Migration <info@saito.tech>',
			subject: `Low Balance Warning: ${this.app.browser.formatDecimals(balance)}`,
			text: `Please deposit more SAITO ASAP`,
			bcc: 'migration@saito.io'
		});
	}
}

module.exports = Migration;
