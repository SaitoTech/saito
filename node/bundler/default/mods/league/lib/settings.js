const LeagueSettingsTemplate = require('./settings.template');
const SaitoOverlay = require('./../../../lib/saito/ui/saito-overlay/saito-overlay');

class LeagueSettings {
	constructor(app, mod, container = null) {
		this.app = app;
		this.mod = mod;

		this.container = container;

		//only used if no container provided!
		this.overlay = new SaitoOverlay(this.app, this.mod);
	}

	async render() {
		if (!this.container) {
			this.overlay.show(
				`<div class="module-settings-overlay"><h2>League Settings</h2></div>`,
				() => {
					console.log('Saving changes to settings');
					this.mod.saveLeagues();
				}
			);
			this.container = '.module-settings-overlay';
		}

		if (document.querySelector('.saito-module-settings')) {
			this.app.browser.replaceElementBySelector(
				LeagueSettingsTemplate(this.app, this.mod),
				'.saito-module-settings'
			);
		} else {
			this.app.browser.addElementToSelector(
				LeagueSettingsTemplate(this.app, this.mod),
				this.container
			);
		}

		this.attachEvents();
	}

	attachEvents() {
		for (let l of this.mod.leagues) {
			if (this.mod.watch_list[l.id]) {
				Array.from(document.querySelectorAll(`input[name='${l.name}']`)).forEach((radio) => {
					radio.addEventListener('change', (e) => {
						if (e.currentTarget.value !== this.mod.watch_list[l.id]) {
							this.mod.watch_list[l.id] = e.currentTarget.value;

							// not my own overlay with a save on close feature....
							if (!this.overlay.visible) {
								clearTimeout(this.timeout);
								this.timeout = setTimeout(() => {
									console.log('Saving changes to settings after debounce timeout');
									this.mod.saveLeagues();
								}, 3000);
							}
						}
					});
				});
			}
		}

		Array.from(document.querySelectorAll('.select-all')).forEach((header) => {
			header.addEventListener('click', (e) => {
				let value = e.currentTarget.dataset.selection;
				for (let i in this.mod.watch_list) {
					this.mod.watch_list[i] = value;
				}

				// not my own overlay with a save on close feature....
				if (!this.overlay.visible) {
					clearTimeout(this.timeout);
					this.timeout = setTimeout(() => {
						console.log('Saving changes to settings after debounce timeout');
						this.mod.saveLeagues();
					}, 1000);
				}
				this.render();
			});
		});
	}
}

module.exports = LeagueSettings;
