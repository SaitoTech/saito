const SaitoOverlay = require('../../../../../lib/saito/ui/saito-overlay/saito-overlay');
const SaitoNFTCard = require('../../../../../lib/saito/ui/saito-nft/saito-nft-card');
const NftPickerTemplate = require('./nft-picker.template');

class NftPickerOverlay {
	constructor(app, mod) {
		this.app = app;
		this.mod = mod;
		this.overlay = new SaitoOverlay(app, mod);
		this.card_list = [];
		this.defaults = {};
		this.onSelect = null;
	}

	render(defaults = {}) {
		this.defaults = defaults || {};

		this.overlay.show(NftPickerTemplate(), () => {
			if (typeof this.defaults?.callback === 'function') {
				this.defaults.callback({ status: 'cancelled' });
			}
		});

		this.renderNftGrid();
	}

	async renderNftGrid() {
		const container = document.querySelector('.nft-picker [data-nft-grid]');
		const statusEl = document.querySelector('.nft-picker [data-nft-status]');
		if (!container) {
			return;
		}

		await this.app.wallet.updateNFTList();
		const nft_list = this.app.options.wallet.nfts || [];

		this.card_list = [];
		container.innerHTML = '';

		if (!nft_list.length) {
			if (statusEl) {
				statusEl.innerHTML = NftPickerTemplate.emptyInstructions();
			}
			return;
		}

		if (statusEl) {
			statusEl.innerHTML = '';
		}

		for (const rec of nft_list) {
			const card = new SaitoNFTCard(
				this.app,
				this.mod,
				'.nft-picker [data-nft-grid]',
				null,
				rec,
				(nft) => {
					this.handleSelect(nft);
				}
			);
			this.card_list.push(card);
			await card.render();
		}
	}

	async handleSelect(nft) {
		const selected = nft?.nft || nft;

		if (selected && (!selected.tx_fetched || !selected.image)) {
			await new Promise((resolve) => {
				let settled = false;
				const finish = () => {
					if (!settled) {
						settled = true;
						resolve();
					}
				};
				selected.fetchTransaction(finish);
				setTimeout(finish, 5000);
			});
		}

		// Avoid treating a successful pick as a cancel when the picker closes.
		if (this.defaults) {
			this.defaults.callback = null;
		}
		this.overlay.close();

		if (typeof this.onSelect === 'function') {
			this.onSelect(selected, this.defaults);
		}
	}
}

module.exports = NftPickerOverlay;
