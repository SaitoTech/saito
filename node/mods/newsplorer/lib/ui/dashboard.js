const DashboardTemplate = require('./dashboard.template');

class Dashboard {
	constructor(app, mod) {
		this.app = app;
		this.mod = mod;
		this.data = {
			price: {
				label: 'Saito Price',
				value: '$0.42',
				sub: '@ 0.0000071 BTC (+1.20%)'
			},
			marketCap: {
				label: 'Market Cap',
				value: '$42,180,000.00'
			},
			transactions: {
				label: 'Transactions',
				value: '12.4 M',
				sub: '(128.4 TPS)'
			},
			fee: {
				label: 'Med Fee Price',
				value: '0.001 SAITO',
				sub: '(< $0.01)'
			},
			finalized: {
				label: 'Last Finalized Block',
				value: '1,842,901'
			},
			safe: {
				label: 'Last Safe Block',
				value: '1,842,899'
			}
		};
	}

	render(container) {
		if (!container) {
			return;
		}

		this.app.browser.replaceElementContentBySelector(
			DashboardTemplate({ stats: this.data }),
			container
		);
	}
}

module.exports = Dashboard;
