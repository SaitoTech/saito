var saito = require('../../lib/saito/saito');
var ModTemplate = require('../../lib/templates/modtemplate');
const SettingsAppspace = require('./lib/appspace/main');
const AppSettings = require('./lib/settings-settings');

class Settings extends ModTemplate {
	constructor(app) {
		super(app);
		this.app = app;
		this.name = 'Settings';
		this.appname = 'Settings';
		this.slug = 'settings';
		this.description = 'Convenient Email plugin for managing Saito account settings';
		this.class = 'utility';
		this.utilities = 'Core Utilities';
		this.link = '/email?module=settings';
		this.icon = 'fas fa-cog';
		this.description = 'User settings module.';
		this.categories = 'Admin Users';
		this.styles = ['/settings/style.css', '/saito/lib/jsonTree/jsonTree.css'];
		this.main = null;

		return this;
	}

	async initialize(app) {
		await super.initialize(app);

		//
		// If you have the settings page open and you trigger a name registration event
		// it will deactivate the button so you cannot reregister
		//
		this.app.connection.on('registry-update-identifier', (publickey) => {
			if (publickey === this.publicKey) {
				let username = app.keychain.returnIdentifierByPublicKey(this.publicKey);
				if (!username) {
					return;
				}
				let btn = document.getElementById('register-identifier-btn');
				let existing = document.getElementById('settings-username');
				if (btn) {
					let el = document.createElement('div');
					el.className = 'username';
					el.id = 'settings-username';
					el.textContent = username;
					btn.replaceWith(el);
				} else if (existing) {
					existing.textContent = username;
				}
			}
		});

		this.app.connection.on('settings-overlay-render-request', async () => {
			if (!this.main) {
				this.main = new SettingsAppspace(this.app, this);
				this.attachStyleSheets();
			}
			// the slight delay gives us time to download and process the style sheets,
			// which is better than a flicker of unstyled html
			setTimeout(() => {
				this.main.render();
			}, 50);
		});

		if (!app.options.settings) {
			app.options.settings = { debug: false };
		}
	}

	canRenderInto(qs) {
		return false;
	}

	/*
  	Note: Account Settings is hardcoded into saito-header
  	*/
	respondTo(type = '') {
		if (type === 'saito-header') {
			if (this.app.modules.returnActiveModule()) {
				this.attachStyleSheets();
				return [
					/*{
						text: 'Sync Chain',
						icon: 'fa-solid fa-link',
						rank: 130,
						type: 'utilities',
						callback: async function (app, id) {
							siteMessage('Reimporting your account...');
							await app.wallet.onUpgrade('upgrade');
							reloadWindow(150);
						}
					}*/
					{
						text: 'Nuke',
						icon: 'fa-solid fa-radiation',
						rank: 130,
						type: 'utilities',
						callback: async function (app, id) {
							let c = await app.wallet.onUpgrade('nuke');
							if (c) {
								reloadWindow(150);
							}
						}
					}
				];
			}
		}
		return null;
	}

	hasSettings() {
		return true;
	}

	/**
	 * Lite clients request the connected node's build number to compare with the browser bundle.
	 */
	async handlePeerTransaction(app, tx = null, peer, mycallback = null) {
		if (tx == null) {
			return 0;
		}
		let txmsg;
		try {
			txmsg = tx.returnMessage();
		} catch (err) {
			return 0;
		}
		if (txmsg?.request === 'settings server build') {
			if (mycallback) {
				mycallback({ build_number: String(this.app.build_number) });
				return 1;
			}
		}
		return super.handlePeerTransaction(app, tx, peer, mycallback);
	}

	loadSettings(container) {
		let as = new AppSettings(this.app, this, container);
		as.render();
	}
}

module.exports = Settings;
