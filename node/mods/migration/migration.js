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
		this.overlay = new SaitoOverlay(this.app, this, false);

		this.key_cache = {};
		this.wrapped_saito_ticker = 'ERC-SAITO';

		this.relay_available = false;
		this.can_auto = false;
		this.ercMod = null;

		this.local_dev = false;

		//
		// TODO -- CHANGE THIS
		//
		//this.migration_publickey = 'zYCCXRZt2DyPD9UmxRfwFgLTNAqCd5VE8RuNneg4aNMK';
		this.migration_publickey = 'cNACSaLdZQfbPkTTud4ezLWFYqRPUCMEt2dgLxJ9Axxx';
		this.migration_mixin_address = '';

		this.messages = [
			'This is taking a while',
			'Hang in there',
			'Wow, Ethereum is slow',
			'It will come through eventually',
			'Please remain on the line'
		];
		this.gifs = [
			'https://media4.giphy.com/media/mlvseq9yvZhba/giphy.gif?cid=2dedbeb5qwxjlsbfbb6hoegrqhuuk3jyox9114xh67d5n26b&ep=v1_gifs_search&rid=giphy.gif&ct=g',
			'https://media3.giphy.com/media/nR4L10XlJcSeQ/giphy.gif?cid=2dedbeb5qwxjlsbfbb6hoegrqhuuk3jyox9114xh67d5n26b&ep=v1_gifs_search&rid=giphy.gif&ct=g',
			'https://media2.giphy.com/media/5i7umUqAOYYEw/giphy.gif?cid=2dedbeb5qwxjlsbfbb6hoegrqhuuk3jyox9114xh67d5n26b&ep=v1_gifs_search&rid=giphy.gif&ct=g',
			'https://media4.giphy.com/media/ND6xkVPaj8tHO/giphy.gif?cid=2dedbeb5zv19d51h53z7kixbzxbyecof4okksa5gllpv0pxr&ep=v1_gifs_search&rid=giphy.gif&ct=g',
			'https://media1.giphy.com/media/YBsd8wdchmxqg/giphy.gif?cid=2dedbeb5zv19d51h53z7kixbzxbyecof4okksa5gllpv0pxr&ep=v1_gifs_search&rid=giphy.gif&ct=g'
		];

		if (!app.BROWSER) {
			app.connection.on('saito-crypto-payment-received', (tx) => {
				let txmsg = tx.returnMessage();

				const { amount, from } = txmsg;

				if (tx.isFrom(this.publicKey)) {
					this.notifyTeam(txmsg, 2, tx.signature);
					return;
				}

				if (tx.isTo(this.publicKey)) {
					if (txmsg.module !== this.wrapped_saito_ticker) {
						this.notifyTeam(txmsg, 0, 'Processing a crypto transfer tx for non-Saito!!');
						console.error('Processing a crypto transfer tx for non-Saito!!');
						return;
					}

					let saitozen_key = this.key_cache[from];

					if (!saitozen_key) {
						this.notifyTeam(txmsg, 0, 'Processing a crypto transfer tx for non-Saito!!');
						console.error('Process a crypto transfer from an unknown sender!!!');
						return;
					}

					let sm = app.wallet.returnCryptoModuleByTicker('SAITO');

					sm.sendPayment(amount, saitozen_key, txmsg.hash + 1)
						.then(() => {
							this.notifyTeam(txmsg, 1, saitozen_key);
						})
						.catch((err) => {
							this.notifyTeam(txmsg, 0, err);
							console.error(err);
							this.sendFailureNotification(saitozen_key);
						});
				}
			});
		}

		return this;
	}

	async initialize(app) {
		await super.initialize(app);

		if (!this.app.BROWSER) {
			if (this.local_dev) {
				this.migration_publickey = this.publicKey;
				console.warn('---> I am the migration bot for local testing!!!!');
			}
			return;
		}

		if (this.browser_active) {
			try {
				this.ercMod = this.app.wallet.returnCryptoModuleByTicker(this.wrapped_saito_ticker);
			} catch (err) {
				salert('Automated Migration requires Mixin and ERC modules to be installed!');
			}
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
						}
					} catch (err) {
						console.error(err);
					}
					console.log('Hello...');
					salert('Unable to initialize deposit address for automated migration');
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
	}

	async onConfirmation(blk, tx, conf) {
		if (this.app.BROWSER && !tx.isTo(this.publicKey)) {
			return;
		}

		let txmsg = tx.returnMessage();
		try {
			if (Number(conf) == 0) {
				if (txmsg.request === 'save migration data') {
					await this.receiveStoreMigrationTransaction(blk, tx, conf);
				}

				if (txmsg.request == 'migration check' && this.publicKey == this.migration_publickey) {
					this.receiveMigrationPingTransaction(tx);
				}
			}
		} catch (err) {
			console.error('ERROR in ' + this.name + ' onConfirmation: ' + err);
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
			console.error('ERROR in saving migration data to db: ' + err);
		}
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

	async receiveMigrationPingTransaction(tx) {
		let txmsg = tx.returnMessage();
		let saitozen = tx.from[0].publicKey;

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

		// Max of 500k at a time
		if (max_deposit > 500000) {
			max_deposit = 500000;
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
				return;
			}

			// Maybe the migration server changes the deposit address...
			this.migration_mixin_address = txmsg.data.mixin_address;
			this.max_deposit = txmsg.data.max_deposit;

			this.can_auto = true;

			// We are already sitting on some ERC20 wrapped SAITO
			this.balance = Number(this.ercMod.returnBalance());

			if (txmsg.data?.go) {
				this.processDepositedSaito(this.balance);
			} else {
				this.main.render();
			}
		}
	}

	checkForLocalDeposit() {
		this.overlay.show(`
						        <div id="saito-deposit-form" class="saito-overlay-form saito-crypto-deposit-container">
						            <div class="saito-overlay-form-header">
						                <div class="saito-overlay-form-header-title">Depositing...</div>
						                <div class="saito-overlay-form-header-content">1 of 2</div>
						            </div>
						            <div class="saito-overlay-form-content">
						            	<div>This may take a few minutes to confirm, please be patient</div>
						            	<div class="game-loader-spinner"></div>
						            </div>
						            <div class="saito-progress-meter"><div class="file-transfer-progress" style="width:0%;"></div></div>
						        </div>`);

		this.overlay.blockClose();
		let confs = this.ercMod.confirmations;
		let ct = 0;
		let interval = setInterval(() => {
			this.ercMod.checkBalance();
			this.ercMod.fetchPendingDeposits((res) => {
				if (res.length > 0) {
					let pending = res.pop();
					ct = pending.confirmations;
					let amount = Number(pending.amount);
					if (amount > 0) {
						console.log(`${amount} deposit pending (${ct}/${confs})`);
					}
				}
				if (this.local_dev) {
					ct += 4;
				}

				if (document.querySelector('.saito-progress-meter')) {
					document.querySelector('.saito-progress-meter .file-transfer-progress').style.width =
						`${(100 * ct) / confs}%`;
				}
			});

			if (ct % 2 == 0 && ct > 0) {
				let html = `<div>${this.messages[Math.floor(this.messages.length * Math.random())]}</div>`;
				html += `<img class="img-prev" src="${this.gifs[Math.floor(this.gifs.length * Math.random())]}"/>`;
				document.querySelector('.saito-overlay-form-content').innerHTML = html;
			}

			let new_balance = Number(this.ercMod.returnBalance());

			if (this.local_dev && ct > 8) {
				new_balance = 100000 * Math.random();
				new_balance = Number(new_balance.toFixed(8));
			}

			if (new_balance > this.balance) {
				clearInterval(interval);
				this.sendMigrationPingTransaction(
					{
						mixin_address: this.ercMod.formatAddress(),
						double_check: true
					},
					true
				);
			}
		}, 4250);
	}

	processDepositedSaito(new_balance) {
		let html = `
	        <div id="saito-deposit-form" class="saito-overlay-form saito-crypto-deposit-container">
	            <div class="saito-overlay-form-header">
	                <div class="saito-overlay-form-header-title">Deposited</div>
	            </div>
	            <div class="saito-overlay-form-content">`;

		if (this.balance) {
			html += `<div>${this.balance} ERC20 SAITO pending conversion into </div>`;
		} else {
			html += `<div>Deposited ${new_balance} ERC20 SAITO into </div>`;
		}
		html += `<div class=""> ${this.publicKey.slice(0, 8)}...${this.publicKey.slice(-8)} </div>`;

		if (new_balance > this.max_deposit) {
			html += `<div>Click to convert the maximum of ${this.max_deposit} into on chain SAITO. The remaining ${new_balance - this.max_deposit} SAITO will be safe on your wallet (please back it up!!!), 
					let omskian@saito [Richard] know that the migration bot is out of money. 
					When it is refilled, you'll be able to convert the rest just be revisiting this page.</div>`;
		} else {
			html += `<div>Click next to convert to on chain SAITO</div>`;
		}

		html += `</div>

	        <div class="saito-button-row">
	           <button type="button" class="saito-button-primary" id='submit'>Convert</button> 
	        </div>

			`;

		this.overlay.show(html);
		const mod_self = this;

		const sendCallback = (robj) => {
			if (robj?.err) {
				salert('Migration Error: <br> ' + robj.err);
				return;
			}

			try {
				mod_self.overlay.remove();
				document.querySelector('.withdraw-title').innerHTML = 'Converting saito';
				this.app.browser.addElementToSelectorOrDom(
					'<div class="saito-overlay-form-header-content">2 of 2</div>',
					'.saito-overlay-form-header'
				);
				document.querySelector('.withdraw-intro').innerHTML =
					'Check your wallet in the side bar ->';
				document.querySelector('.withdraw-form-fields').remove();

				/*this.app.browser.addElementToSelectorOrDom(
					`<div class="game-loader-spinner"></div>`,
					'.saito-overlay-form.withdraw-container'
				);*/
			} catch (err) {
				console.warn('UI errors...', err);
			}
		};

		if (document.getElementById('submit')) {
			document.getElementById('submit').onclick = (e) => {
				if (document.querySelector('.saito-overlay-form-header-title')) {
					document.querySelector('.saito-overlay-form-header-title').innerHTML = 'Converting...';
				}

				e.currentTarget.remove();
				let sender = this.ercMod.formatAddress();

				let amount = Math.min(new_balance, this.max_deposit).toFixed(8);

				let unique_hash = this.app.crypto.hash(
					Buffer.from(sender + this.migration_mixin_address + amount + 'ERC-SAITO', 'utf-8')
				);

				if (this.local_dev) {
					//Fake payment
					this.ercMod.sendPaymentTransaction(
						this.migration_publickey,
						this.ercMod.formatAddress(),
						this.migration_mixin_address,
						amount,
						unique_hash
					);
					sendCallback({});
					return;
				}

				this.app.wallet.sendPayment(
					this.wrapped_saito_ticker,
					[this.ercMod.formatAddress()],
					[this.migration_mixin_address],
					[amount],
					unique_hash,
					sendCallback,
					this.migration_publickey
				);
			};
		}
	}

	async notifyTeam(txmsg, result, msg) {
		const { amount, from } = txmsg;

		let emailtext = `
			      <div>
			     	<p>Saito Automated Migration Transfer Service</p>
			     	<hr>
			     	<p>Tokens received by Migration Bot:</p>
			     	<p>TICKER: ${txmsg.module}</p>
			        <p>AMOUNT: ${this.app.browser.formatDecimals(txmsg.amount, true)}</p>
			     	<p></p>
			     	`;

		if (result) {
			emailtext += `<p>Sending SAITO to ${msg}</p></div>`;
		} else {
			emailtext += `<p>FROM: ${from}</p>`;
			emailtext += `<p>Error: ${msg}</p></div>`;
		}

		let low_balance = false;

		if (result == 2) {
			let x = await this.app.wallet.getBalance();
			let y = this.app.wallet.convertNolanToSaito(x);

			emailtext = `
					<div>
				     	<p>Saito Automated Migration Complete!</p>
				     	<hr>
				        <p>Migration Bot issued ${this.app.browser.formatDecimals(txmsg.amount, true)} ${txmsg.module} to ${txmsg.to}</p>
				     	<p></p>
				     	<p>TX SIGNATURE: ${msg}</p>
				        <p>Remaining BALANCE: ${this.app.browser.formatDecimals(y)}</p>
				     </div>
			     	`;

			if (Number(y) < 10000) {
				low_balance = y;
			}
		}

		this.app.connection.emit('mailrelay-send-email', {
			to: 'migration@saito.tech',
			from: 'Saito Token Migration <info@saito.tech>',
			subject: `Saito Token Automated Migration Alert (${result ? 'Success!' : 'Error'})`,
			html: emailtext,
			ishtml: true,
			bcc: 'migration@saito.io'
		});

		if (low_balance) {
			this.app.connection.emit('mailrelay-send-email', {
				to: 'migration@saito.tech',
				from: 'Saito Token Migration <info@saito.tech>',
				subject: `Low Balance Warning: ${this.app.browser.formatDecimals(low_balance)}`,
				text: `Please deposit more SAITO ASAP`,
				bcc: 'migration@saito.io'
			});
		}
	}
}

module.exports = Migration;
