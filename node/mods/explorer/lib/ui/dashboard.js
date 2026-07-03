const DashboardTemplate = require('./dashboard.template');
const { buildPeerNodeInfo } = require('../peer-node-info');

class Dashboard {
	constructor(app, mod) {
		this.app = app;
		this.mod = mod;
		this.container = null;
		this.fetchToken = 0;
		this.data = {
			transactions: {
				label: 'Transactions',
				value: '12.4 M',
				sub: '(128.4 TPS)',
			},
			fee: {
				label: 'Med Fee Price',
				value: '0.001 SAITO',
				sub: '(< $0.01)',
			},
			finalized: {
				label: 'Last Finalized Block',
				value: '1,842,901',
			},
			safe: {
				label: 'Last Safe Block',
				value: '1,842,899',
			},
		};
		this.peerNode = {
			ready: false,
			loading: true,
			error: null,
		};
	}

	render(container) {
		if (!container) {
			return;
		}

		this.container = container;
		this.paint();
		this.loadPeerNodeInfo();
	}

	paint() {
		if (!this.container) {
			return;
		}

		this.app.browser.replaceElementContentBySelector(
			DashboardTemplate({
				stats: this.data,
				peerNode: this.peerNode,
				app: this.app,
			}),
			this.container
		);
	}

	async loadPeerNodeInfo() {
		const token = ++this.fetchToken;

		if (!this.mod.explorerPeer?.publicKey) {
			this.peerNode = {
				ready: false,
				loading: false,
				error: null,
			};
			this.paint();
			return;
		}

		this.peerNode = {
			ready: false,
			loading: true,
			error: null,
		};
		this.paint();

		try {
			const info = await buildPeerNodeInfo(this.app, this.mod);
			if (token !== this.fetchToken) {
				return;
			}
			this.peerNode = info;
		} catch (err) {
			if (token !== this.fetchToken) {
				return;
			}
			console.error('Explorer: failed to load peer node info', err);
			this.peerNode = {
				ready: false,
				loading: false,
				error: 'Unable to load node information.',
			};
		}

		this.paint();
	}
}

module.exports = Dashboard;
