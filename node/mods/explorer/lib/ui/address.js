const AddressTemplate = require('./address.template');
const { formatAddressActivityRows, formatAddressSummary } = require('../address-format');
const { parseBalanceSnapshotNolan } = require('../peer-node-info');

class Address {
	constructor(app, mod, publicKey) {
		this.app = app;
		this.mod = mod;
		this.publicKey = publicKey;
		this.container = '.explorer-view';
		this.currentBalanceNolan = null;
		this.balanceFetched = false;
	}

	render(container = '') {
		if (container) {
			this.container = container;
		}

		this.mod.addressComponent = this;
		this.paint();

		if (!this.mod.addressReady && this.mod.explorerPeer) {
			this.mod.fetchAddressData(this.app, this.mod.explorerPeer, this.publicKey);
		}

		if (!this.balanceFetched) {
			this.fetchBalance();
		}
	}

	async fetchBalance() {
		try {
			const response = await fetch(`/balance/${encodeURIComponent(this.publicKey)}`);
			if (response.ok) {
				const text = await response.text();
				this.currentBalanceNolan = parseBalanceSnapshotNolan(text);
			}
		} catch (err) {
			// balance fetch is best-effort
		}
		this.balanceFetched = true;
		this.paint();
	}

	paint() {
		const loading = !this.mod.addressReady;
		const error = this.mod.addressError
			? this.app.browser.escapeHTML(this.mod.addressError)
			: null;
		const rawRows = this.mod.addressRows || [];
		const balanceNolan = this.balanceFetched ? this.currentBalanceNolan : null;
		const summary = formatAddressSummary(this.app, this.publicKey, rawRows, balanceNolan);
		const rows = formatAddressActivityRows(this.app, rawRows, balanceNolan);

		this.app.browser.replaceElementContentBySelector(
			AddressTemplate({
				loading,
				error,
				summary,
				rows,
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

		root.querySelectorAll('.explorer-address-block-link, .explorer-address-tx-link').forEach((link) => {
			link.onclick = (event) => {
				event.preventDefault();
				const hash = link.dataset?.blockHash;
				if (hash) {
					this.mod.renderBlock(hash, { pushState: true, animate: true });
				}
			};
		});
	}
}

module.exports = Address;
