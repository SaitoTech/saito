const SupplyTemplate = require('./supply.template');
const { formatSupplyTable, formatLatestSupplySummary } = require('../supply-format');

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
		this.attachEvents();

		if (!this.mod.supplyReady && this.mod.explorerPeer) {
			this.mod.fetchSupplyData(this.app, this.mod.explorerPeer);
		}
	}

	paint() {
		const loading = !this.mod.supplyReady;
		const error = this.mod.supplyError
			? this.app.browser.escapeHTML(this.mod.supplyError)
			: null;
		const columns = this.mod.supplyColumns || [];
		const summary = formatLatestSupplySummary(columns);
		const rows = formatSupplyTable(this.app, columns);

		this.app.browser.replaceElementContentBySelector(
			SupplyTemplate({
				loading,
				error,
				summary,
				columns,
				rows,
			}),
			this.container
		);
	}

	attachEvents() {
		const root = document.querySelector(this.container);
		if (!root) {
			return;
		}

		const backBtn = root.querySelector('[data-nav="home"]');
		if (backBtn) {
			backBtn.onclick = (event) => {
				event.preventDefault();
				this.mod.renderHome({ pushState: true, animate: true });
			};
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
