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

		this.main = null;
		this.header = null;

		this.local_dev = true;
		//
		// TODO -- CHANGE THIS
		//
		this.migration_publickey = 'zYCCXRZt2DyPD9UmxRfwFgLTNAqCd5VE8RuNneg4aNMK';

		return this;
	}

	async initialize(app) {
		await super.initialize(app);

		if (!this.app.BROWSER) {
			if (this.local_dev) {
				this.migration_publickey = this.publicKey;
			}

			setTimeout(async () => {
				let cmod = this.app.wallet.returnCryptoModuleByTicker('ERC-SAITO');
				if (cmod) {
					await cmod.activate();
					this.can_auto = true;
					console.log(cmod.formatAddress());
				}
			}, 2000);
		}
	}

	returnServices() {
		let services = [];
		if (this.publicKey == this.migration_publickey) {
			services.push(new PeerService(null, 'migration'));
		}
		return services;
	}

	async onPeerServiceUp(app, peer, service = {}) {
		// Update migration service node address
		if (service.service == 'migration') {
			this.migration_publickey = peer.publicKey;
		}
	}

	async render() {
		this.main = new MigrationMain(this.app, this);
		this.header = new SaitoHeader(this.app, this);
		await this.header.initialize(this.app);

		this.addComponent(this.main);
		this.addComponent(this.header);

		await super.render(this.app, this);
	}

	async onConfirmation(blk, tx, conf) {
		if (this.app.BROWSER && !tx.isTo(this.publicKey)) {
			return;
		}

		let txmsg = tx.returnMessage();
		try {
			if (conf == 0) {
				console.log('Migration onConfirmation: ' + txmsg.request);

				if (txmsg.request === 'save migration data') {
					await this.receiveStoreMigrationTransaction(blk, tx, conf);
				}
			}
		} catch (err) {
			console.log('ERROR in ' + this.name + ' onConfirmation: ' + err);
		}
	}

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
			console.log('ERROR in saving migration data to db: ' + err);
		}
	}

	async handlePeerTransaction(app, tx = null, peer, mycallback) {
		if (tx?.isTo(this.publicKey)) {
			let txmsg = tx.returnMessage();

			if (txmsg.request == 'migration check') {
				await this.receiveMigrationPingTransaction(app, tx, peer, mycallback);
			}

			if (txmsg.request == 'migration accept') {
				await this.receiveMigrationResponseTransaction(app, tx, peer, mycallback);
			}
		}
	}

	async sendMigrationPingTransaction(data) {
		let newtx = await this.app.wallet.createUnsignedTransactionWithDefaultFee(
			this.migration_publickey
		);

		newtx.msg = {
			module: 'Migration',
			request: 'migration check',
			data
		};

		await newtx.sign();

		this.app.connection.emit('relay-transaction', newtx);
	}

	async receiveMigrationPingTransaction(app, tx, peer, mycallback) {
		let newtx = await this.app.wallet.createUnsignedTransactionWithDefaultFee(tx.from[0].publicKey);

		let error = null;
		// Check balance

		let min_deposit = 1000;
		let max_deposit = await this.app.wallet.getBalance('SAITO');

		let ercMod = this.app.wallet.returnCryptoModuleByTicker('ERC-SAITO');

		if (!ercMod) {
			error = "Migration node doesn't have ERC20 Saito installed";
		}

		await ercMod.activate();

		if (Number(max_deposit) < 1000) {
			error = 'Migration node is low on on-chain $SAITO';
		}

		newtx.msg = {
			module: 'Migration',
			request: 'migration accept',
			data: {
				min_deposit,
				max_deposit,
				mixin_address: ercMod.formatAddress(),
				error
			}
		};

		await newtx.sign();

		this.app.connection.emit('relay-transaction', newtx);
	}

	async receiveMigrationResponseTransaction(app, tx, peer, mycallback) {
		if (app.BROWSER) {
			let txmsg = tx.returnMessage();

			console.log('****************', txmsg);

			if (txmsg.data.error) {
				salert('Unable to Migrate now: <br>' + txmsg.data.error);
				return;
			}

			// Maybe the migration server changes the deposit address...

			if (!this.confirmed) {
				this.confirmed = await sconfirm(
					'This automated feature is under development, do <em>not</em> close your browser while the process is underway'
				);
			}

			if (this.confirmed) {
				app.connection.emit('saito-crypto-deposit-render-request', {
					title: 'ERC20 wrapped $SAITO',
					ticker: 'ERC-SAITO',
					migration: true,
					callback: () => {
						siteMessage('submitted!');
					}
				});
			}
		}
	}
}

module.exports = Migration;
