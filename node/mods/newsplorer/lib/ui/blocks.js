const BlocksTemplate = require('./blocks.template');

class Blocks {
	constructor(app, mod) {
		this.app = app;
		this.mod = mod;
	}

	render(container = '') {
		if (!container) {
			return;
		}

		this.app.browser.replaceElementContentBySelector(BlocksTemplate(), container);
	}
}

module.exports = Blocks;
