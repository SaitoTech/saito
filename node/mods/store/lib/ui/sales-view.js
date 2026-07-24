const SalesViewTemplate = require('./sales-view.template');
const EmptyPanel = require('./empty-panel');

class SalesView {
	constructor(app, mod, container = '', callbacks = {}) {
		this.app = app;
		this.mod = mod;
		this.container = container;
		this.onSell = callbacks.onSell;
		this.empty = new EmptyPanel(app, mod, {
			title: 'No listings',
			actionLabel: 'List Item',
			actionIcon: 'fa-plus',
			onAction: () => this.onSell?.()
		});
	}

	render(container = '') {
		if (container) {
			this.container = container;
		}

		if (!this.container) {
			return;
		}

		this.app.browser.replaceElementContentBySelector(
			SalesViewTemplate(),
			this.container
		);

		this.empty.render(`${this.container} .storefront-empty`);
	}
}

module.exports = SalesView;
