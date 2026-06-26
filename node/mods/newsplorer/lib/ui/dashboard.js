const DashboardTemplate = require('./dashboard.template');

class Dashboard {
	constructor(app, mod) {
		this.app = app;
		this.mod = mod;
	}

	render(container = '') {
		if (!container) {
			return;
		}

		this.app.browser.replaceElementContentBySelector(DashboardTemplate(), container);
	}
}

module.exports = Dashboard;
