const saito = require('../../lib/saito/saito');
const ModTemplate = require('../../lib/templates/modtemplate');
const KeyEntry = require('./../../lib/saito/ui/modals/saito-recovery/saito-recovery');
const SaitoLogin = require('./lib/login');
const SaitoBackup = require('./lib/backup');
const Transaction = require('../../lib/saito/transaction').default;
const PeerService = require('saito-js/lib/peer_service').default;

class Recovery extends ModTemplate {
	constructor(app) {
		super(app);
		this.name = 'Recovery';
		this.slug = 'recovery';
		this.description = 'Secure wallet backup and recovery';
		this.categories = 'Utilities Core';
		this.class = 'utility';
		this.backup_overlay = new SaitoBackup(app, this);
		this.login_overlay = new SaitoLogin(app, this);
		this.key_entry = new KeyEntry(app, this);

		this.keychain_hash = '';

		app.connection.on('recovery-backup-overlay-render-request', async (obj) => {
			console.debug('Received recovery-backup-overlay-render-request');

			//
			// Otherwise, call up the modal to query them from the user
			//

			if (obj?.success_callback) {
				this.backup_overlay.success_callback = obj.success_callback;
			}

			//
			// if we already have the email/password, just send the backup
			//
			let key = app.keychain.returnKey(this.publicKey);
			if (key) {
				if (key.email && key.wallet_decryption_secret && key.wallet_retrieval_hash) {
					siteMessage('backing up wallet...', 10000);
					await this.backupWallet({
						email: key.email,
						decryption_secret: key.wallet_decryption_secret,
						retrieval_hash: key.wallet_retrieval_hash
					});

					this.app.wallet.saveWallet();
					this.app.connection.emit('saito-header-update-message');
					return;
				}
			}

			this.backup_overlay.render();
		});
	}

	async initialize(app) {
		await super.initialize(app);

		/// Clean up detritus in the wallet
		if (this.app.options.wallet) {
			delete this.app.options.wallet.account_recovery_hash;
			delete this.app.options.wallet.account_recovery_secret;
			delete this.app.options.wallet.backup_required_msg;

			this.app.storage.saveOptions();
		}
	}

	async onPeerServiceUp(app, peer, service = {}) {
		if (!app.BROWSER) {
			return;
		}

		if (service.service === 'relay') {
			let now = Date.now();

			//
			// If a "clean" wallet or been at least an hour, check if we have a backup saved remotely
			//
			if (!this.app.options.wallet?.ts || now - this.app.options.wallet.ts > 360000) {
				// send a peer request to see if our public key is in recovery database
				// attempt to decrypt
				// prompt user to swap out wallet
				// ... but ...
				// if we are catching up on blocks in the mean time...
				// ... we might get unexpected results ...
			}
		}
	}

	returnDecryptionSecret(email = '', pass = '') {
		let hash1 = 'WHENINDISGRACEWITHFORTUNEANDMENSEYESIALLALONEBEWEEPMYOUTCASTSTATE';
		let hash2 = 'ANDTROUBLEDEAFHEAVENWITHMYBOOTLESSCRIESANDLOOKUPONMYSELFANDCURSEMYFATE';
		return this.app.crypto.hash(this.app.crypto.hash(email + pass) + hash1);
	}

	returnRetrievalHash(email = '', pass = '') {
		let hash1 = 'WHENINDISGRACEWITHFORTUNEANDMENSEYESIALLALONEBEWEEPMYOUTCASTSTATE';
		let hash2 = 'ANDTROUBLEDEAFHEAVENWITHMYBOOTLESSCRIESANDLOOKUPONMYSELFANDCURSEMYFATE';
		return this.app.crypto.hash(this.app.crypto.hash(hash2 + email) + pass);
	}

	returnServices() {
		let services = [];
		if (this.app.BROWSER == 0) {
			services.push(new PeerService(null, 'recovery'));
		}
		return services;
	}

	respondTo(type, obj) {
		if (type == 'saito-header' || (type == 'user-menu' && obj?.publicKey == this.publicKey)) {
			let x = [];

			let unknown_user =
				this.app.keychain.returnIdentifierByPublicKey(this.publicKey, true) === this.publicKey;

			if (unknown_user) {
				x.push({
					text: 'Login',
					icon: 'fa fa-sign-in',
					rank: 130,
					type: 'utilities',
					callback: function (app) {
						app.connection.emit('recovery-login-overlay-render-request');
					}
				});
			} else {
				x.push({
					text: 'Backup',
					icon: 'fa-sharp fa-solid fa-cloud-arrow-up',
					rank: 130,
					type: 'utilities',
					callback: function (app) {
						app.connection.emit('recovery-backup-overlay-render-request');
					}
				});
			}

			return x;
		}

		return super.respondTo(type);
	}

	async onConfirmation(blk, tx, conf) {
		if (this.app.BROWSER && !tx.isTo(this.publicKey)) {
			return;
		}

		if (Number(conf) == 0) {
			if (this.hasSeenTransaction(tx, Number(blk.id))) {
				return;
			}

			let txmsg = tx.returnMessage();

			if (txmsg.request == 'recovery backup') {
				await this.receiveBackupTransaction(tx);
			}
		}
	}

	async handlePeerTransaction(app, tx = null, peer, mycallback) {
		if (tx == null) {
			return;
		}

		if (app.BROWSER == 0) {
			let txmsg = tx.returnMessage();

			if (txmsg?.request === 'recovery recover') {
				return this.receiveRecoverTransaction(tx, mycallback);
			}
		}

		return super.handlePeerTransaction(app, tx, peer, mycallback);
	}

	////////////
	// Backup //
	////////////
	async createBackupTransaction(decryption_secret, retrieval_hash) {
		let newtx = await this.app.wallet.createUnsignedTransactionWithDefaultFee();

		newtx.msg = {
			module: 'Recovery',
			request: 'recovery backup',
			hash: retrieval_hash,
			wallet: this.app.crypto.aesEncrypt(this.app.wallet.exportWallet(), decryption_secret)
		};

		newtx.addTo(this.publicKey);
		await newtx.sign();
		return newtx;
	}

	async receiveBackupTransaction(tx) {
		let txmsg = tx.returnMessage();
		let publickey = tx.from[0].publicKey;
		let hash = txmsg.hash || '';
		let txjson = tx.serialize_to_web(this.app);

		console.log('********************');
		console.log('Backup Transaction confirmed on chain');
		console.log('********************');

		let sql =
			'INSERT OR REPLACE INTO recovery (publickey, hash, tx) VALUES ($publickey, $hash, $tx)';
		let params = {
			$publickey: publickey,
			$hash: hash,
			$tx: txjson
		};

		let res = await this.app.storage.runDatabase(sql, params, 'recovery');

		if (this.publicKey === publickey) {
			this.backup_overlay.success();
		}
	}

	/**
	 *
	 * data = { email, password } or {email, decryption_secret, retrieval_hash }
	 *
	 */
	async backupWallet(data) {
		let { email, password, decryption_secret, retrieval_hash } = data;

		if (!email) {
			console.error('Recovery cannot backup a wallet without an email');
			return;
		}

		let email_text = `This email contains an encrypted backup of your Saito Wallet for 
				${this.publicKey.substring(0, 6)}...${this.publicKey.slice(-6)}. 
				The system should automatically update your backup (and email you again) if you 
				add additional keys (adding friends, installing third-party cryptos, etc.). However, 
				we strongly advise you to regularly back up your account to protect your data`;

		if (this.app.options.wallet.backup_required) {
			email_text += `\n\nAutomatically triggered by: ${this.app.options.wallet.backup_required}`;
		}

		if (password) {
			//
			// Generate passcode and retreival hash
			//
			decryption_secret = this.returnDecryptionSecret(email, password);
			retrieval_hash = this.returnRetrievalHash(email, password);

			//
			// save email
			//
			this.app.options.wallet.backup_required = false;
			this.app.keychain.addKey(this.publicKey, {
				email,
				wallet_decryption_secret: decryption_secret,
				wallet_retrieval_hash: retrieval_hash
			});
			this.app.keychain.saveKeys();
		} else if (!decryption_secret || !retrieval_hash) {
			console.error('Missing credentials for backup...!');
			return;
		}

		//
		// and send transaction
		//
		let newtx = await this.createBackupTransaction(decryption_secret, retrieval_hash);
		await this.app.network.propagateTransaction(newtx);

		//
		// Ask mailrelay mod to send us a copy
		//
		this.app.connection.emit('mailrelay-send-email', {
			to: email,
			from: 'Saito Backup <no-reply@saito.tech>',
			subject: 'Saito Wallet - Encrypted Backup',
			text: email_text,
			ishtml: false,
			attachments: [
				{
					filename: `saito-wallet-${this.publicKey}.aes`,
					content: String(Buffer.from(newtx.msg.wallet, 'utf-8'))
				}
			]
		});
	}

	/////////////
	// Recover //
	/////////////
	async createRecoverTransaction(retrieval_hash) {
		let newtx = await this.app.wallet.createUnsignedTransactionWithDefaultFee();
		newtx.msg = {
			module: 'Recovery',
			request: 'recovery recover',
			hash: retrieval_hash
		};
		newtx.addTo(this.publicKey);

		await newtx.sign();
		return newtx;
	}

	//
	// this is never run, see overlay
	//
	async receiveRecoverTransaction(tx, mycallback = null) {
		if (mycallback == null) {
			console.warn('No callback');
			return 0;
		}
		if (this.app.BROWSER == 1) {
			console.warn("Browsers don't support backup/recovery");
			return 0;
		}

		let txmsg = tx.returnMessage();

		let hash = txmsg.hash || '';

		let sql = 'SELECT * FROM recovery WHERE hash = $hash';
		let params = {
			$hash: hash
		};

		let results = await this.app.storage.queryDatabase(sql, params, 'recovery');

		console.log('********************');
		console.log('Restore Transaction');
		console.log('********************');

		if (mycallback) {
			mycallback(results);
			return 1;
		} else {
			console.warn('No callback to process recovered wallet');
		}

		return 0;
	}

	async restoreWallet(email, password) {
		let decryption_secret = this.returnDecryptionSecret(email, password);
		let retrieval_hash = this.returnRetrievalHash(email, password);

		let newtx = await this.createRecoverTransaction(retrieval_hash);
		let peers = await this.app.network.getPeers();

		for (let peer of peers) {
			for (s of peer.services) {
				console.log(s);
			}
			if (peer.hasService('recovery')) {
				this.app.network.sendTransactionWithCallback(
					newtx,
					async (rows_as_tx) => {
						console.log('Restoring wallet!!!!!');

						//This is so weird that the passed data gets turned into a pseudotransaction
						let rows = rows_as_tx.msg;

						if (!rows?.length) {
							console.log('no rows returned!');
							this.login_overlay.failure();
							return;
						}

						if (!rows[0].tx) {
							console.log('no transaction in row returned');
							this.login_overlay.failure();
							return;
						}

						// Decrypt wallet(s) here
						for (let r of rows) {
							let newtx = new Transaction();
							newtx.deserialize_from_web(this.app, r.tx);

							let txmsg = newtx.returnMessage();

							console.log('decrypting recovered wallet...');

							let encrypted_wallet = txmsg.wallet;
							let decrypted_wallet = this.app.crypto.aesDecrypt(
								encrypted_wallet,
								decryption_secret
							);

							r.decrypted_wallet = decrypted_wallet;
						}

						this.login_overlay.selection(rows);
					},
					peer.peerIndex
				);
				return;
			}
		}

		if (document.querySelector('.saito-overlay-form-text')) {
			document.querySelector('.saito-overlay-form-text').innerHTML =
				'<center>Unable to download encrypted wallet from network...</center>';
		}
	}
}

module.exports = Recovery;
