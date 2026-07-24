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
		this.create_nft_overlay = null;
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
		const instructionsEl = document.querySelector('.nft-picker [data-nft-instructions]');
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
			if (instructionsEl) {
				instructionsEl.hidden = false;
				instructionsEl.innerHTML = NftPickerTemplate.createPrompt();
				this.attachEmptyEvents();
			}
			return;
		}

		if (statusEl) {
			statusEl.innerHTML = '';
		}
		if (instructionsEl) {
			instructionsEl.hidden = true;
			instructionsEl.innerHTML = '';
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

	attachEmptyEvents() {
		const createLink = document.getElementById('nft-picker-create-link');
		if (!createLink) {
			return;
		}

		const open = (e) => {
			e.preventDefault();
			this.openCreateNft();
		};

		createLink.onclick = open;
		createLink.onkeydown = (e) => {
			if (e.key === 'Enter' || e.key === ' ') {
				e.preventDefault();
				this.openCreateNft();
			}
		};
	}

	/**
	 * Close the picker and open Create NFT.
	 * Prefers the header-owned instance so we do not register a second listener.
	 */
	openCreateNft() {
		if (this.defaults) {
			this.defaults.callback = null;
		}
		this.overlay.close();

		let createNft =
			this.mod.header &&
			this.mod.header.select_nft_overlay &&
			this.mod.header.select_nft_overlay.create_nft_overlay;

		if (!createNft) {
			if (!this.create_nft_overlay) {
				const CreateNFT = require('../../../../../lib/saito/ui/saito-nft/overlays/create-overlay');
				this.create_nft_overlay = new CreateNFT(this.app, this.mod);
			}
			createNft = this.create_nft_overlay;
		}

		createNft.render();
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
