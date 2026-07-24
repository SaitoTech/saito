const EmptyPanelTemplate = require('./empty-panel.template');

class EmptyPanel {
	constructor(app, mod, options = {}) {
		this.app = app;
		this.mod = mod;
		this.container = '';
		this.title = options.title || '';
		this.body = options.body || '';
		this.actionLabel = options.actionLabel || '';
		this.actionIcon = options.actionIcon || '';
		this.action = options.action || 'sell';
		this.onAction = options.onAction || null;
	}

	render(container = '') {
		if (container) {
			this.container = container;
		}

		if (!this.container) {
			return;
		}

		this.app.browser.replaceElementContentBySelector(
			EmptyPanelTemplate({
				title: this.title,
				body: this.body,
				actionLabel: this.actionLabel,
				actionIcon: this.actionIcon,
				action: this.action
			}),
			this.container
		);

		const btn = document.querySelector(`${this.container} [data-action]`);
		if (btn && typeof this.onAction === 'function') {
			btn.onclick = (e) => {
				e.preventDefault();
				this.onAction();
			};
		}
	}
}

module.exports = EmptyPanel;
