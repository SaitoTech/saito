const KeyTemplate = require('./keyentry.template');
const PhraseTemplate = require('./phraseentry.template');
const SaitoOverlay = require('./../../../lib/saito/ui/saito-overlay/saito-overlay');

class KeyEntry {
	constructor(app, mod) {
		this.app = app;
		this.mod = mod;

		this.modal_overlay = new SaitoOverlay(this.app, this.mod);

		app.connection.on('recovery-private-key-render-request', () => {
			console.debug('Received recovery-login-overlay-render-request');
			this.render();
		});
	}

	render(mode = 'key') {
		if (mode == 'key') {
			this.modal_overlay.show(KeyTemplate());
		} else {
			this.modal_overlay.show(PhraseTemplate());
		}

		document.querySelector('.saito-overlay-form-input').focus();

		this.attachEvents();
	}

	attachEvents() {
		if (document.getElementById('private-key-submit')) {
			document.getElementById('private-key-submit').onclick = (e) => {
				let privatekey = document.getElementById('private-key-input').value;
				this.loadPrivateKey(privatekey);
			};
		}

		if (document.getElementById('seed-phrase-submit')) {
			document.getElementById('seed-phrase-submit').onclick = (e) => {
				let seedPhrase = document.getElementById('seed-phrase-input').value;
				let privatekey = this.app.crypto.getPrivateKeyFromSeed(seedPhrase);
				this.loadPrivateKey(privatekey);
			};
		}

		if (document.getElementById('input-seed-phrase')) {
			document.getElementById('input-seed-phrase').onclick = () => {
				this.render('phrase');
			};
		}

		if (document.getElementById('input-private-key')) {
			document.getElementById('input-private-key').onclick = () => {
				this.render('key');
			};
		}
	}

	async loadPrivateKey(privatekey) {
		if (privatekey) {
			try {
				let result = await this.app.wallet.onUpgrade('import', privatekey);

				if (result === true) {
					let c = await sconfirm('Success! Confirm to reload');
					if (c) {
						reloadWindow(300);
					}
				} else {
					let err = result;
					salert('Something went wrong: ' + err.name);
				}
			} catch (e) {
				salert('Restore Private Key ERROR: <br> ' + e);
				console.error('Restore Private Key ERROR: ' + e);
			}
		}
	}
}

module.exports = KeyEntry;
