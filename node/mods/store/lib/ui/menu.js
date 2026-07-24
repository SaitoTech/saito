const MenuTemplate = require('./menu.template');

class Menu {
	constructor(app, mod, container = '', callbacks = {}) {
		this.app = app;
		this.mod = mod;
		this.container = container;
		this.onNavigate = callbacks.onNavigate || null;
		this.onSell = callbacks.onSell || null;
		this.onStoreModeChange = callbacks.onStoreModeChange || null;
		this.active = 'all';
		this.mode = 'browse';
		this.storeMode = 'active';
	}

	render(container = '') {
		if (container) {
			this.container = container;
		}

		if (!this.container) {
			return;
		}

		const root = document.querySelector(this.container);
		if (root) {
			root.classList.toggle('marketplace', this.mode === 'browse');
			root.classList.toggle('dashboard', this.mode === 'dashboard');
		}

		const html =
			this.mode === 'dashboard'
				? MenuTemplate.dashboard({ storeMode: this.storeMode })
				: MenuTemplate.browse();

		this.app.browser.replaceElementContentBySelector(html, this.container);

		if (this.mode === 'browse') {
			this.setActive(this.active);
		}

		this.attachEvents();
	}

	setMode(mode = 'browse', { storeMode = this.storeMode } = {}) {
		this.mode = mode === 'dashboard' ? 'dashboard' : 'browse';
		this.storeMode = storeMode === 'sold' ? 'sold' : 'active';
		this.render();
	}

	setStoreMode(storeMode = 'active') {
		this.storeMode = storeMode === 'sold' ? 'sold' : 'active';
		if (this.mode !== 'dashboard' || !this.container) {
			return;
		}
		const select = document.querySelector(`${this.container} [data-action="store-mode"]`);
		if (select) {
			select.value = this.storeMode;
		}
	}

	setActive(view = '') {
		this.active = view;
		if (!this.container || this.mode !== 'browse') {
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

		const cta = root.querySelector('[data-action="list-item"]');
		if (cta) {
			cta.onclick = (e) => {
				e.preventDefault();
				if (typeof this.onSell === 'function') {
					this.onSell();
				}
			};
		}

		const modeSelect = root.querySelector('[data-action="store-mode"]');
		if (modeSelect) {
			modeSelect.onchange = (e) => {
				const mode = e.target.value === 'sold' ? 'sold' : 'active';
				this.storeMode = mode;
				if (typeof this.onStoreModeChange === 'function') {
					this.onStoreModeChange(mode);
				}
			};
		}
	}
}

module.exports = Menu;
