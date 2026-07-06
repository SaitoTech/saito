const SupplyTemplate = require('./supply.template');

class Supply {
	constructor(app, mod) {
		this.app = app;
		this.mod = mod;
		this.container = '.explorer-view';
	}

	render(container = '') {
		if (container) {
			this.container = container;
		}

		this.mod.supplyComponent = this;
		this.paint();

		if (!this.mod.supplyReady && this.mod.explorerPeer) {
			this.mod.fetchSupplyData(this.app, this.mod.explorerPeer);
		}
	}

	paint() {
		const loading = !this.mod.supplyReady;
		const error = this.mod.supplyError
			? this.app.browser.escapeHTML(this.mod.supplyError)
			: null;
		const view = this.mod.supplyView || null;

		this.app.browser.replaceElementContentBySelector(
			SupplyTemplate({
				loading,
				error,
				columns: view?.columns || [],
				rows: view?.rows || [],
				hasData: Boolean(view?.hasData),
			}),
			this.container
		);

		this.attachEvents();
	}

	attachEvents() {
		const root = document.querySelector(this.container);
		if (!root) {
			return;
		}

		root.querySelectorAll('.explorer-supply-block-link').forEach((link) => {
			link.onclick = (event) => {
				event.preventDefault();
				const hash = link.closest('[data-block-hash]')?.dataset?.blockHash;
				if (hash) {
					this.mod.renderBlock(hash, { pushState: true, animate: true });
				}
			};
		});
	}
}

module.exports = Supply;
