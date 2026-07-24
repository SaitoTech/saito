const MenuTemplate = require('./menu.template');

class Menu {
	constructor(app, mod, container = '', onNavigate = null) {
		this.app = app;
		this.mod = mod;
		this.container = container;
		this.onNavigate = onNavigate;
		this.active = 'all';
	}

	render(container = '') {
		if (container) {
			this.container = container;
		}

		if (!this.container) {
			return;
		}

		this.app.browser.replaceElementContentBySelector(MenuTemplate(), this.container);
		this.setActive(this.active);
		this.attachEvents();
	}

	setActive(view = '') {
		this.active = view;
		if (!this.container) {
			return;
		}
		const root = document.querySelector(this.container);
		if (!root) {
			return;
		}
		root.querySelectorAll('.item').forEach((item) => {
			const on = item.dataset.view === view;
			item.classList.toggle('active', on);
			item.setAttribute('aria-current', on ? 'page' : 'false');
		});
	}

	activate(item) {
		const view = item.dataset.view || '';
		const category = item.dataset.category != null ? item.dataset.category : undefined;
		this.setActive(view);
		if (typeof this.onNavigate === 'function') {
			this.onNavigate(view, { category });
		}
	}

	attachEvents() {
		const root = document.querySelector(this.container);
		if (!root) {
			return;
		}

		root.querySelectorAll('.item').forEach((item) => {
			item.onclick = (e) => {
				e.preventDefault();
				this.activate(item);
			};
			item.onkeydown = (e) => {
				if (e.key === 'Enter' || e.key === ' ') {
					e.preventDefault();
					this.activate(item);
				}
			};
		});
	}
}

module.exports = Menu;
