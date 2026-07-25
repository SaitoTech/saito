const saito = require('./../../lib/saito/saito');
const Transaction = require('../../lib/saito/transaction').default;
const SaitoHeader = require('./../../lib/saito/ui/saito-header/saito-header');
const ModTemplate = require('./../../lib/templates/modtemplate');
const VaultMain = require('./lib/ui/main');
const VaultHome = require('./index');
const AccessFileOverlay = require('./lib/ui/overlays/load-nfts.js');

class Vault extends ModTemplate {
	constructor(app) {
		super(app);

		this.appname = 'Vault';
		this.name = 'Vault';
		this.slug = 'vault';
		this.dependencies = ['Archive'];
		this.description = 'Storage Vault regulated by NFT Keys';
		this.categories = 'Utility Cryptography Programming';
		this.icon = 'fas fa-vault';

		this.peer_connected = false;
		this.peer = null;

		//
		// vars for users / uploads
		//
		this.file = null;
		this.filename = '';
		this.file_id = null;
		this.mode = 'private';
		this.styles = ['/vault/style.css'];

		this.social = {
			twitter: '@SaitoOfficial',
			title: 'Vault - Secure Storage',
			url: 'https://saito.io/vault',
			description: 'NFT-based cloud storage',
			image: 'https://saito.io/vault/img/splash.png'
		};

		this.access_file_overlay = new AccessFileOverlay(this.app, this);
	}

	async initialize(app) {
		if (this.app.BROWSER) {
			const SaitoTransactionMonitor = require('../../lib/saito/ui/saito-transaction-monitor/saito-transaction-monitor');
			this.transaction_monitor = new SaitoTransactionMonitor(this.app, this);
		}

		if (this.browser_active) {
			this.main = new VaultMain(app, this, '.saito-container');
			this.addComponent(this.main);
			this.header = new SaitoHeader(app, this);
			await this.header.initialize(app);
			this.addComponent(this.header);
		}
	}

	async render() {
		await super.render();
	}

	/////////////////////////////////
	// inter-module communications //
	/////////////////////////////////
	respondTo(type = '', obj) {
		let this_mod = this;

		if (type === 'saito-header') {
			let x = [];
			if (!this.browser_active) {
				this_mod.attachStyleSheets();
				x.push({
					text: 'Vault',
					icon: this.icon,
					rank: 105,
					type: 'quicklaunch',
					callback: function (app, id) {
						//navigateWindow('/vault');
						this_mod.access_file_overlay.render();
					},
					navigation: '/vault'
				});
			}
			return x;
		}

		if (type === 'saito-create-nft') {
			return {
				title: 'NFT Access Key',
				class: ['vault-nft-key'],
				json: {
					txsig: 'YYYYY',
					archive: 'ZZZZZ'
				}
			};
		}

		if (type === 'saito-nft-media') {
			return {
				// Canonical access-key type; "vault" kept for legacy keys already on-chain.
				class: ['vault-nft-key', 'vault'],
				returnMediaDisplay(nft) {
					if (!nft?.json) {
						return null;
					}
					try {
						const obj = JSON.parse(nft.json);
						const backgroundImage = obj.file_access_script
							? '/vault/img/crystal_key_min.png'
							: '/vault/img/jade_key_min.png';
						return {
							backgroundImage,
							innerHtml: `<div class="saito-nft-card-text">${nft.json}</div>`
						};
					} catch (err) {
						return null;
					}
				}
			};
		}
		return null;
	}

	returnServices() {
		let services = [];
		if (!this.app.BROWSER || this.offerService) {
			services.push(this.app.network.createPeerService(null, 'vault', 'Secure File Vault'));
		}
		return services;
	}

	async onPeerServiceUp(app, peer, service = {}) {
		if (!this.browser_active) {
			return;
		}
		if (service.service === 'vault') {
			this.peer = peer;
			this.peer_connected = true;
		}
	}

	async handlePeerTransaction(app, tx = null, peer, mycallback) {

		if (tx == null) {
			return 0;
		}

		let txmsg = tx.returnMessage();

		if (!txmsg.request || !mycallback) {
			return 0;
		}

		if (txmsg.request === 'vault access file') {
			try {
				//
				// run CHECKOWN / CHECKOWNNFT script
				//
				if (!app.core?.scripting?.hash || !app.core?.scripting?.evaluate) {
console.log("ERROR vault access file 1");
					mycallback({ status: 'err', err: 'scripting_unavailable' });
					return 0;
				}
console.log("NORMAL vault access file 1");

				let access_script = txmsg.data.access_script || '';
				let access_hash = txmsg.data.access_hash || '';
				let ok = false;

				let computed_hash = app.core.scripting.hash(access_script);
				let hash_match = computed_hash === access_hash;
				console.log(
					'--------------------------------\nVAULT ACCESS REQUEST RECEIVED\n\naccess_hash:\n' +
						access_hash +
						'\n\ncomputed_hash:\n' +
						computed_hash +
						'\n\nhash_match:\n' +
						hash_match +
						'\n\n--------------------------------'
				);
console.log("NORMAL vault access file 1");

				if (app.core.scripting.hash(access_script) === access_hash) {
					console.log(
						'--------------------------------\nCALLING RUST SCRIPT VALIDATOR\n--------------------------------'
					);
					ok = await app.core.scripting.evaluateWithTransaction(access_script, tx);
					console.log(
						'--------------------------------\nSCRIPT VALIDATION RESULT:\n\n' +
							(ok ? 'true' : 'false') +
							'\n\n--------------------------------'
					);
				}
console.log("NORMAL vault access file 2");

				if (!ok) {
					console.log('SCRIPT VALIDATION FAILED');
					siteMessage('Supplied Witness Data Incorrect: Access Denied', 2000);
					mycallback({ status: 'err', err: 'access_denied_script_failed' });
					return 0;
				}

console.log("NORMAL vault access file 3");


				//
				// If script passes, proceed to Archive
				//
				let archive_mod = app.modules.returnModule('Archive');
				archive_mod.access_hash = 1; // ownership restricted

				let data = {};
				data.owner = txmsg.data.access_hash;
				data.access_hash = txmsg.data.access_hash;
				data.access_script = txmsg.data.access_script;
				data.sig = txmsg.data.data.file_id;
				data.request_tx = tx;
console.log("NORMAL vault access file 4");

				this.app.storage.loadTransactions(
					data,
					async (txs) => {
						mycallback({ status: 'success', err: '', txs: txs });
					},
					'localhost',
					0
				);
			} catch (err) {
console.log("ERROR processing vault access file...");
				mycallback({ status: 'err', err: JSON.stringify(err) });
			}

			// prevent sending fake response
			return 1;
		}

		if (txmsg.request === 'vault add file') {
			try {
				let archive_mod = app.modules.returnModule('Archive');
				archive_mod.access_hash = 1; // ownership restricted

				let peer_tx = new Transaction();
				peer_tx.deserialize_from_web(this.app, txmsg.data);
				let peer_txmsg = peer_tx.returnMessage();

				let access_hash = peer_txmsg.access_hash || '';

				let data = {};
				data.owner = access_hash;
				data.preserve = 1;

				this.app.storage.saveTransaction(peer_tx, data, 'localhost');
				mycallback({ status: 'success', err: '' });
			} catch (err) {
				console.error('Vault add file error:', err);
				mycallback({ status: 'err', err: JSON.stringify(err) });
			}

			return 1;
		}
	}

	async createVaultAddFileTransaction(nftid = null, access_script_obj = null) {
		let newtx = await this.app.wallet.createUnsignedTransaction();

		try {
			if (!this.app.core?.scripting?.hash) {
				return null;
			}

			if (!nftid) {
				console.warn('Vault: createVaultAddFileTransaction missing nftid');
				return null;
			}

			if (access_script_obj == null) {
				access_script_obj = {
					op: 'CHECKOWNNFT',
					nftid,
					witness: {
						utxokey1: '',
						utxokey2: '',
						utxokey3: ''
					}
				};
			}

			let access_script =
				typeof access_script_obj === 'string'
					? access_script_obj
					: JSON.stringify(access_script_obj);
			let access_hash = this.app.core.scripting.hash(access_script);

			let msg = {
				request: 'vault add file',
				access_script: access_script,
				access_hash: access_hash,
				data: { file: this.file, name: this.filename }
			};

			newtx.msg = msg;
			await newtx.sign();
		} catch (err) {}

		return newtx;
	}

	async sendAccessFileRequest(vault_data = null, access_script_override = null, mycallback = null) {
		if (!this.app.core?.scripting?.hash) {
			console.warn('VAULT: app.core.scripting not available, aborting');
			return null;
		}

		//
		// Standard path builds CHECKOWNNFT from nft utxokeys.
		// Custom keys pass a complete access_script via access_script_override.
		//
		let nftid = null;
		let utxokey1 = null;
		let utxokey2 = null;
		let utxokey3 = null;
		let file_id = null;
		//
		// if called from UI (LoadNFTs click) use provided values
		//
		if (vault_data) {
			nftid = vault_data.nft_id;
			utxokey1 = vault_data.slip1_utxokey;
			utxokey2 = vault_data.slip2_utxokey;
			utxokey3 = vault_data.slip3_utxokey;
			file_id = vault_data.file_id;
		} else {
			nftid = prompt('NFT ID (nftid):');
			utxokey1 = prompt('NFT utxokey1:');
			utxokey2 = prompt('NFT utxokey2:');
			utxokey3 = prompt('NFT utxokey3:');
			file_id = this.file_id;
		}

		if (!nftid || !utxokey1 || !utxokey2 || !utxokey3) {
			console.warn('VAULT: Missing nftid or one of the utxokeys, aborting');
			return null;
		}

		let access_script = '';
		let access_hash = '';

		if (access_script_override) {
			try {
				access_script =
					typeof access_script_override === 'string'
						? access_script_override
						: JSON.stringify(access_script_override);
				JSON.parse(access_script);
				access_hash = this.app.core.scripting.hash(access_script);
			} catch (err) {
				alert('Error submitting access script: invalid JSON?');
				return;
			}
		} else {
			//
			// Standard CHECKOWNNFT flow
			//
			let access_script_obj = {
				op: 'CHECKOWNNFT',
				nftid,
				witness: {
					utxokey1: utxokey1,
					utxokey2: utxokey2,
					utxokey3: utxokey3
				}
			};

			access_script = JSON.stringify(access_script_obj);
			access_hash = this.app.core.scripting.hash(access_script);
		}

		//
		// if file_id still not set, fall back to this.file_id
		//
		if (!file_id) {
			console.log('VAULT: file_id not set from vault_data, using this.file_id');
			file_id = this.file_id;
		}

		let data = {
			request: 'vault access file',
			access_script: access_script,
			access_hash: access_hash,
			data: { file_id }
		};

		if (this.peer) {
			let computed_hash = this.app.core.scripting.hash(access_script);
			let script_pretty = JSON.stringify(JSON.parse(access_script), null, 2);
			console.log(
				'--------------------------------\nVAULT DOWNLOAD REQUEST\n\naccess_hash:\n' +
					access_hash +
					'\n\nhash(access_script):\n' +
					computed_hash +
					'\n\nscript:\n' +
					script_pretty +
					'\n\nfile_id:\n' +
					file_id +
					'\n\n--------------------------------'
			);

			this.app.network.sendRequestAsTransaction(
				'vault access file',
				data,
				(res) => {


console.log("$$$");
console.log("$$$");
console.log("RECEIVED RESPONSE: ");
console.log("$$$");
console.log("$$$");

					// Handle undefined or error responses
					if (!res) {
						console.error('VAULT: No response received (network error or timeout)');
						if (mycallback) {
							mycallback(null); // Pass null to NWASM callback
						}
						return;
					}

					// Check for error status
					if (res.status === 'err') {
						console.error('VAULT: Error from vault:', res);
						if (mycallback) {
							mycallback(null); // Pass null to NWASM callback
						}
						return;
					}

					// Handle case where res might be a Transaction object instead of {status, txs}
					let txs = [];
					if (res.txs) {
						txs = res.txs;
					} else if (Array.isArray(res)) {
						txs = res;
					} else if (res.status === 'success' && res.txs) {
						txs = res.txs;
					}

					if (txs.length > 0) {
						for (let i = 0; i < txs.length; i++) {
							let tx = new Transaction();
							tx.deserialize_from_web(this.app, txs[i]);
							txmsg = tx.returnMessage();

							try {
								let filename = txmsg.data.name;
								if (!filename) {
									filename = prompt('Enter filename to save:') || 'vault.bin';
								}

								const parts = txmsg.data.file.split(',');
								const header = parts[0];
								const base64Data = parts[1];
								const mime = header.match(/data:(.*);base64/)[1];

								if (mycallback) {
									mycallback(base64Data);
								} else {
									const binary = atob(base64Data);
									const len = binary.length;

									const bytes = new Uint8Array(len);
									for (let i = 0; i < len; i++) {
										bytes[i] = binary.charCodeAt(i);
									}

									const blob = new Blob([bytes], { type: mime });
									const url = URL.createObjectURL(blob);
									const a = document.createElement('a');
									a.href = url;
									a.download = filename || 'download';

									a.click();
									URL.revokeObjectURL(url);
								}
							} catch (err) {
								console.log('VAULT: ERROR while handling downloaded file: ' + JSON.stringify(err));
							}
						}
					}
				},
				this.peer.publicKey,
				true
			);

			siteMessage('Transferring File...', 3000);
		} else {
			console.warn('VAULT: no peer found, cannot send vault access request');
		}
	}

	webServer(app, expressapp, express) {
		let webdir = `${__dirname}/../../mods/${this.dirname}/web`;
		let vault_self = this;

		expressapp.get('/' + encodeURI(this.returnSlug()), async function (req, res) {
			let reqBaseURL = req.protocol + '://' + req.headers.host + '/';

			let updatedSocial = Object.assign({}, vault_self.social);

			let html = VaultHome(app, vault_self, app.build_number, updatedSocial);
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

module.exports = Vault;
