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
		this.dashboardView = 'store-admin';
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
				? MenuTemplate.dashboard({ dashboardView: this.dashboardView })
				: MenuTemplate.browse();

		this.app.browser.replaceElementContentBySelector(html, this.container);

		if (this.mode === 'browse') {
			this.setActive(this.active);
		}

		this.attachEvents();
	}

	setMode(mode = 'browse', { dashboardView = this.dashboardView, storeMode } = {}) {
		this.mode = mode === 'dashboard' ? 'dashboard' : 'browse';
		if (storeMode === 'sold') {
			this.dashboardView = 'sold';
		} else if (storeMode === 'active') {
			this.dashboardView = dashboardView === 'active' ? 'active' : 'store-admin';
		} else if (dashboardView) {
			this.dashboardView = ['store-admin', 'active', 'sold'].includes(dashboardView)
				? dashboardView
				: 'store-admin';
		}
		this.render();
	}

	setDashboardView(dashboardView = 'store-admin') {
		this.dashboardView = ['store-admin', 'active', 'sold'].includes(dashboardView)
			? dashboardView
			: 'store-admin';
		if (this.mode !== 'dashboard' || !this.container) {
			return;
		}
		this.setActive(this.dashboardView);
	}

	/** @deprecated Prefer setDashboardView — kept for callers that still pass storeMode. */
	setStoreMode(storeMode = 'active') {
		this.setDashboardView(storeMode === 'sold' ? 'sold' : 'store-admin');
	}

	setActive(view = '') {
		if (this.mode === 'dashboard') {
			this.dashboardView = ['store-admin', 'active', 'sold'].includes(view)
				? view
				: this.dashboardView;
		} else {
			this.active = view;
		}
		if (!this.container) {
			return;
		}
		const root = document.querySelector(this.container);
		if (!root) {
			return;
		}
		const current = this.mode === 'dashboard' ? this.dashboardView : this.active;
		root.querySelectorAll('.item').forEach((item) => {
			const on = item.dataset.view === current;
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
	}
}

module.exports = Menu;
