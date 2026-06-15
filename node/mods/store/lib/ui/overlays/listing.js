const SaitoOverlay = require('../../../../../lib/saito/ui/saito-overlay/saito-overlay');
const SaitoNFTCard = require('../../../../../lib/saito/ui/saito-nft/saito-nft-card');
const ListingTemplate = require('./listing.template');

class ListingOverlay {
	constructor(app, mod) {
		this.app = app;
		this.mod = mod;
		this.overlay = new SaitoOverlay(app, mod);
		this.mode = 'select';
		this.selectedNft = null;
		this.card_list = [];
		this.form = {
			title: '',
			description: '',
			price: '1',
			supply: 1,
			maxSupply: 1
		};
	}

	returnShortKey(key = '') {
		if (!key) {
			return 'anon-store';
		}
		if (key.length <= 18) {
			return key;
		}
		return `${key.slice(0, 8)}...${key.slice(-8)}`;
	}

	returnFallbackImage() {
		return "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1200' height='800'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' x2='1' y1='0' y2='1'%3E%3Cstop stop-color='%23132736'/%3E%3Cstop offset='1' stop-color='%233c8fcb'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='1200' height='800' fill='url(%23g)'/%3E%3C/svg%3E";
	}

	escapeHtml(value = '') {
		if (this.app?.browser?.escapeHTML) {
			return this.app.browser.escapeHTML(String(value));
		}
		return String(value)
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;');
	}

	returnMediaHtml(nft) {
		if (!nft) {
			return `<img class="store-product-main-image" src="${this.returnFallbackImage()}" alt="" />`;
		}

		if (nft.image) {
			return `<img class="store-product-main-image" src="${this.escapeHtml(nft.image)}" alt="" />`;
		}

		const textContent =
			nft.text || nft.json || nft.js || nft.css || nft.description || 'NFT content';
		return `<div class="nft-card-text store-listing-media-text">${this.escapeHtml(textContent)}</div>`;
	}

	returnFileType(nft) {
		const type = nft?.returnType?.() || nft?.nft_type || 'unknown';
		if (type === 'image') {
			return 'image';
		}
		return type;
	}

	returnConfigureView(nft) {
		const seller = this.mod.publicKey || 'anon-store';
		const maxSupply = Number(nft?.getTotalAmount?.() || nft?.amount || 1) || 1;
		const priceNum = Number(this.form.price) || 1;

		return {
			listingTitle: this.escapeHtml(this.form.title),
			shortSeller: this.returnShortKey(seller),
			mediaHtml: this.returnMediaHtml(nft),
			description: this.escapeHtml(this.form.description),
			priceDisplay: `${priceNum} SAITO`,
			productType: this.escapeHtml(nft?.returnType?.() || 'NFT'),
			fileType: this.escapeHtml(this.returnFileType(nft)),
			createdDate: new Date().toLocaleDateString(),
			supply: this.form.supply
		};
	}

	populateFormFromNft(nft) {
		const maxSupply = Number(nft?.getTotalAmount?.() || nft?.amount || 1) || 1;
		this.form = {
			title: nft?.title || 'Untitled NFT',
			description: nft?.description || '',
			price: '1',
			supply: maxSupply,
			maxSupply
		};
	}

	async renderSelectMode() {
		this.mode = 'select';
		this.selectedNft = null;
		this.overlay.show(ListingTemplate.selectTemplate());
		await this.renderNftGrid();
		this.attachSelectEvents();
	}

	async renderNftGrid() {
		const container = document.querySelector('#store-listing-nft-list');
		if (!container) {
			return;
		}

		await this.app.wallet.updateNFTList();
		const nft_list = this.app.options.wallet.nfts || [];

		this.card_list = [];
		container.innerHTML = '';

		if (!nft_list.length) {
			container.innerHTML = `
        <div class="store-listing-empty">
          You do not have any NFTs in your wallet yet.
        </div>
      `;
			return;
		}

		for (const rec of nft_list) {
			const card = new SaitoNFTCard(
				this.app,
				this.mod,
				'#store-listing-nft-list',
				null,
				rec,
				(nft) => {
					this.onNftSelected(nft);
				}
			);
			this.card_list.push(card);
			await card.render();
		}
	}

	async onNftSelected(nft) {
		this.selectedNft = nft?.nft || nft;

		if (this.selectedNft && !this.selectedNft.tx_fetched) {
			await this.selectedNft.fetchTransaction();
		}

		this.populateFormFromNft(this.selectedNft);
		this.renderConfigureMode();
	}

	renderConfigureMode() {
		this.mode = 'configure';
		const view = this.returnConfigureView(this.selectedNft);
		this.overlay.show(ListingTemplate.configureTemplate(view));
		this.attachConfigureEvents();
	}

	attachSelectEvents() {
		// NFT selection handled by card callbacks.
	}

	attachConfigureEvents() {
		const backBtn = document.querySelector('#store-listing-back');
		if (backBtn) {
			backBtn.onclick = (e) => {
				e.preventDefault();
				this.renderSelectMode();
			};
		}

		const editTitle = document.querySelector('#store-listing-edit-title');
		if (editTitle) {
			editTitle.onclick = (e) => {
				e.preventDefault();
				const next = prompt('Listing title', this.form.title);
				if (next !== null && next.trim()) {
					this.form.title = next.trim();
					document.querySelector('#store-listing-title-text').textContent = this.form.title;
				}
			};
		}

		const editDesc = document.querySelector('#store-listing-edit-desc');
		if (editDesc) {
			editDesc.onclick = (e) => {
				e.preventDefault();
				const next = prompt('Listing description', this.form.description);
				if (next !== null) {
					this.form.description = next.trim();
					document.querySelector('#store-listing-desc-text').textContent =
						this.form.description || 'No description provided';
				}
			};
		}

		const editPrice = document.querySelector('#store-listing-edit-price');
		if (editPrice) {
			editPrice.onclick = (e) => {
				e.preventDefault();
				const next = prompt('Price in SAITO', this.form.price);
				if (next !== null && next.trim()) {
					const cleaned = next.trim().replace(/[^\d.]/g, '');
					if (cleaned) {
						this.form.price = cleaned;
						document.querySelector('#store-listing-price-text').textContent = `${cleaned} SAITO`;
					}
				}
			};
		}

		const editAvailable = document.querySelector('#store-listing-edit-available');
		if (editAvailable) {
			editAvailable.onclick = (e) => {
				e.preventDefault();
				const next = prompt(
					`Available quantity (max ${this.form.maxSupply})`,
					String(this.form.supply)
				);
				if (next !== null && next.trim()) {
					let qty = parseInt(next.trim(), 10);
					if (!Number.isFinite(qty) || qty < 1) {
						qty = 1;
					}
					if (qty > this.form.maxSupply) {
						qty = this.form.maxSupply;
					}
					this.form.supply = qty;
					document.querySelector('#store-listing-available-text').textContent = String(qty);
				}
			};
		}

		const submitBtn = document.querySelector('#store-listing-submit');
		if (submitBtn) {
			submitBtn.onclick = async (e) => {
				e.preventDefault();
				await this.submitListing();
			};
		}
	}

	collectListingData() {
		return {
			quantity: this.form.supply,
			price: this.form.price,
			title: this.form.title,
			description: this.form.description
		};
	}

	async submitListing() {
		const listing = this.collectListingData();
		try {
			const tx = await this.mod.createListAssetTransaction(this.selectedNft, listing);
			await this.app.network.propagateTransaction(tx);
			alert('Listing submitted');
			this.overlay.close();
		} catch (err) {
			console.error('Store: listing failed', err);
			alert(err?.message || 'Listing failed');
		}
	}

	render() {
		this.renderSelectMode();
	}
}

module.exports = ListingOverlay;
