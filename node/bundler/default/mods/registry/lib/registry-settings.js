const SettingsTemplate = require('./registry-settings.template');

class Settings {
	constructor(app, mod, container = '.saito-module-settings') {
		this.app = app;
		this.mod = mod;
		this.container = container;
	}

	render() {
		this.app.browser.addElementToSelector(SettingsTemplate(this.app, this.mod), this.container);
		this.attachEvents();
	}

	attachEvents() {
		document.getElementById('registry_translate').addEventListener('change', (e) => {
			if (e.currentTarget.checked) {
				this.app.options.registry.override_names = true;
			} else {
				this.app.options.registry.override_names = false;
			}

			Array.from(document.querySelectorAll('.treated')).forEach((elem) => {
				elem.classList.remove('treated');
			});

			this.app.storage.saveOptions();
		});
	}
}

module.exports = Settings;
