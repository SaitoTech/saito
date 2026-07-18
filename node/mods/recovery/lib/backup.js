const BackupTemplate = require('./backup.template');
const SaitoOverlay = require('./../../../lib/saito/ui/saito-overlay/saito-overlay');
const SaitoLoader = require('./../../../lib/saito/ui/saito-loader/saito-loader');

class Backup {
	constructor(app, mod) {
		this.app = app;
		this.mod = mod;
		this.success_callback = null;

		this.modal_overlay = new SaitoOverlay(this.app, this.mod);
		this.loader = new SaitoLoader(this.app, this.mod, '#backup-template #saito-overlay-loader');
	}

	render() {
		if (!document.getElementById('backup-template')) {
			this.modal_overlay.show(BackupTemplate());
			this.modal_overlay.callback_on_close = () => {
				if (this.app.options.wallet?.backup_required) {
					this.app.connection.emit('saito-header-update-message', {
						msg: 'wallet backup needed',
						flash: true,
						callback: () => {
							this.app.connection.emit('recovery-backup-overlay-render-request');
						}
					});
				}
			};
		} else {
			this.app.browser.replaceElementById(BackupTemplate(), 'backup-template');
		}

		this.attachEvents();
	}

	show() {
		this.render();
	}
	hide() {
		this.close();
	}

	close() {
		this.modal_overlay.close();
	}

	attachEvents() {
		let this_self = this;

		document.querySelector('#backup-template .saito-overlay-form-submit').onclick = (e) => {
			e.preventDefault();
			let email = document.querySelector('#backup-template .saito-overlay-form-email').value;
			let password = document.querySelector('#backup-template .saito-overlay-form-password').value;

			if (!email || !password) {
				salert('No email or password provided!');
				return;
			}

			this_self.showLoaderOverlay();
			this_self.mod.backupWallet({ email, password });
		};

		document.querySelector('#saito-backup-manual').addEventListener('click', async () => {
			await this_self.app.wallet.backupWallet();
			await this_self.success();
		});
	}

	//
	// This is called when we receive the backup wallet tx that we sent
	//
	success() {
		siteMessage('wallet backup successful', 5000);

		delete this.app.options.wallet.backup_required;

		if (this.success_callback) {
			this.success_callback();
		}

		this.modal_overlay.remove();
	}

	showLoaderOverlay(msg = null) {
		document.querySelector('#saito-overlay-form-header-title').innerHTML =
			`Enabling Account Recovery`;

		let div = document.querySelector('#backup-template .saito-overlay-subform');
		if (div) {
			if (msg == null) {
				msg = `
					<div id="saito-overlay-loader"></div>
					<div class="saito-overlay-form-subtext">
					    Your browser is encrypting your wallet with the password 
					    provided. Once completed, it will send a copy of this 
					    wallet to your email address.
		            </div>

					<div class="saito-overlay-form-subtext">
						This entire process usually takes no more than a minute. 
						Once done you will also be able to login to your account 
						from any computer. Please be patient while the process finishes.
		      		</div>
	      		`;
			}

			div.innerHTML = msg;
			div.classList.add('centered');
		}

		this.loader.render();

		let button = document.querySelector('#backup-template .saito-overlay-form-submit');
		if (button) {
			button.innerHTML = 'Uploading...';
			button.onclick = null;
		}
	}
}

module.exports = Backup;
