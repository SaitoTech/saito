const LoginTemplate = require('./login.template');
const SaitoOverlay = require('./../../../lib/saito/ui/saito-overlay/saito-overlay');
const SaitoLoader = require('./../../../lib/saito/ui/saito-loader/saito-loader');
const LoginSuccessTemplate = require('./login-success.template');
const LoginSelectionTemplate = require('./login-selection.template');
const SaitoUser = require('./../../../lib/saito/ui/saito-user/saito-user');

class Login {
	constructor(app, mod) {
		this.app = app;
		this.mod = mod;

		this.modal_overlay = new SaitoOverlay(this.app, this.mod);
		this.loader = new SaitoLoader(this.app, this.mod, '#login-template');

		app.connection.on('recovery-login-overlay-render-request', () => {
			console.debug('Received recovery-login-overlay-render-request');
			this.render();
		});
	}

	render() {
		this.modal_overlay.show(LoginTemplate());
		this.attachEvents();
	}

	show() {
		this.render();
	}
	hide() {
		this.remove();
	}

	remove() {
		this.modal_overlay.remove();
	}

	attachEvents() {
		document.querySelector('.saito-overlay-login-submit').onclick = (e) => {
			let email = document.querySelector('.saito-overlay-form-email').value;
			let password = document.querySelector('.saito-overlay-form-password').value;

			//document.querySelector(".saito-overlay-form-text").remove();
			document.querySelector('.saito-overlay-form-email').remove();
			document.querySelector('.saito-overlay-form-password').remove();
			document.querySelector('.saito-button-row').remove();

			this.loader.render();

			document.querySelector('#login-template .saito-overlay-form-text').innerHTML =
				'<center>Fetching Encrypted Wallet from Network...</center>';
			this.mod.restoreWallet(email, password);
		};

		if (document.getElementById('input-private-key')) {
			document.getElementById('input-private-key').onclick = () => {
				this.hide();
				this.mod.key_entry.render();
			};
		}

		if (document.getElementById('upload-file')) {
			document.getElementById('upload-file').onclick = () => {
				this.hide();
				this.mod.key_entry.loadFile();
			};
		}
	}

	async success(publicKey) {
		if (!this.app.BROWSER) {
			return;
		}

		this.modal_overlay.closebox = false;
		this.modal_overlay.show(LoginSuccessTemplate());

		//constructor(app, mod, container = '', publicKey = '', notice = '', fourthelem = '') {
		let user = new SaitoUser(this.app, this.mod, '.saito-user-field', publicKey, publicKey);
		user.render();

		document.querySelector('.saito-overlay-login-submit').onclick = (e) => {
			reloadWindow(300);
		};

		this.modal_overlay.blockClose();
	}

	failure() {
		try {
			this.render();
			document.querySelector('#login-template .saito-overlay-form-text').innerHTML =
				'<center>Failed: Incorrect Email or Password?</center>';
			this.attachEvents();
		} catch (err) {
			console.error(err);
		}
	}

	async installWallet(row, show_success = true) {
		let result = await this.app.wallet.onUpgrade('import', '', row.decrypted_wallet);
		if (result) {
			this.success(row.publickey);
		} else {
			console.error(result);
			this.failure();
		}
	}

	async selection(rows) {
		if (rows.length == 1) {
			this.installWallet(rows[0]);
		} else {
			this.modal_overlay.closebox = false;
			this.modal_overlay.show(LoginSelectionTemplate());
			for (let r of rows) {
				let user = new SaitoUser(this.app, this.mod, '.recovery-wallet-selection', r.publickey, r.publickey);
				user.data_disable = true;
				user.render();
			}

			Array.from(document.querySelectorAll('.recovery-wallet-selection .saito-user')).forEach((elem) => {
				elem.onclick = (e) => {
					let pkey = e.currentTarget.dataset.id;
					console.log(pkey);
					for (let r of rows) {
						if (r.publickey == pkey) {
							this.installWallet(r);
						}
					}
				};
			});
		}
	}
}

module.exports = Login;
