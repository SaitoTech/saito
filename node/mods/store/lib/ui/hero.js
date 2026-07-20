const HeroTemplate = require('./hero.template');

class Hero {
	constructor(app, mod, container = '', callbacks = {}) {
		this.app = app;
		this.mod = mod;
		this.container = container;
		this.onSell = callbacks.onSell;
	}

	render(container = '') {
		if (container) {
			this.container = container;
		}

		if (!this.container) {
			return;
		}

		this.app.browser.replaceElementContentBySelector(HeroTemplate(), this.container);
		this.attachEvents();
	}

	attachEvents() {
		const root = document.querySelector(this.container);
		const sellBtn = root?.querySelector('[data-action="sell"]');
		if (!sellBtn) {
			return;
		}

		sellBtn.onclick = (e) => {
			e.preventDefault();
			if (typeof this.onSell === 'function') {
				this.onSell();
			}
		};
	}
}

module.exports = Hero;
