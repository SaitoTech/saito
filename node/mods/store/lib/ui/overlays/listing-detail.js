const SaitoOverlay = require('../../../../../lib/saito/ui/saito-overlay/saito-overlay');
const ListingDetailTemplate = require('./listing-detail.template');
const Summary = require('../../summary');
const { DREAMSCAPE_PLACEHOLDER } = require('../../summary');
const { summaryBucketKey } = require('../summary-cache');

function returnShortKey(key = '') {
	if (!key) {
		return 'anon-store';
	}
	if (key.length <= 18) {
		return key;
	}
	return `${key.slice(0, 8)}...${key.slice(-8)}`;
}

class ListingDetailOverlay {
	constructor(app, mod) {
		this.app = app;
		this.mod = mod;
		this.overlay = new SaitoOverlay(app, mod);
		this.mode = 'view';
		this.summary = null;
		this.selectedNft = null;
		this.defaults = {};
		this.onBack = null;
		this.listing = {
			title: '',
			description: '',
			price: '1',
			quantity_total: 1,
			quantity_available: 1
		};
		this.max_quantity_total = 1;

		this.app.connection.on('store-listing-updated', (summary) => {
			if (
				this.mode === 'view' &&
				this.summary?.nft_id &&
				summaryBucketKey(this.summary.nft_id, this.summary.price) ===
					summaryBucketKey(summary.nft_id, summary.price)
			) {
				this.render(summary);
			}
		});
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

	returnFallbackImage() {
		return "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1200' height='800'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' x2='1' y1='0' y2='1'%3E%3Cstop stop-color='%23132736'/%3E%3Cstop offset='1' stop-color='%233c8fcb'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='1200' height='800' fill='url(%23g)'/%3E%3C/svg%3E";
	}

	returnMediaHtml(nft) {
		if (!nft) {
			return ListingDetailTemplate.mediaImage(this.returnFallbackImage());
		}

		if (nft.image) {
			return ListingDetailTemplate.mediaImage(this.escapeHtml(nft.image));
		}

		const textContent =
			nft.text || nft.json || nft.js || nft.css || nft.description || 'NFT content';
		return ListingDetailTemplate.mediaText(this.escapeHtml(textContent));
	}

	returnFileTypeFromImages(images = []) {
		const sample = images[0] || '';
		if (!sample) {
			return 'unknown';
		}
		if (sample.startsWith('data:image/')) {
			return 'image';
		}
		const ext = sample.split('?')[0].split('.').pop()?.toLowerCase() || '';
		if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'avif'].includes(ext)) {
			return `image/${ext}`;
		}
		return ext || 'unknown';
	}

	returnFileTypeFromNft(nft) {
		const type = nft?.returnType?.() || nft?.nft_type || 'unknown';
		if (type === 'image') {
			return 'image';
		}
		return type;
	}

	returnCreatedDate(summary = {}) {
		const raw = summary.created_at || summary.createdAt || summary.timestamp || Date.now();
		const date = new Date(raw);
		if (Number.isNaN(date.getTime())) {
			return new Date().toLocaleDateString();
		}
		return date.toLocaleDateString();
	}

	hasCurrencyLabel(value = '') {
		return /[a-zA-Z]/.test(String(value));
	}

	returnProductType(summary = {}) {
		if (summary.type) {
			return summary.type;
		}
		if (summary.nft || summary.nft_id || summary.badge) {
			return 'NFT';
		}
		if (summary.delivery || summary.shipping || summary.physical) {
			return 'Physical';
		}
		return 'Digital';
	}

	returnViewModel(summary = {}) {
		const listingTitle = summary.returnTitle?.() || 'Untitled Item';
		const seller = summary.seller || 'anon-store';
		const shortSeller = returnShortKey(seller);

		const display = summary.returnMediaDisplay?.() || {};
		const listingImage =
			display.backgroundImage ||
			(summary.hasLoadedImage?.() ? summary.returnImage?.() || '' : '');
		const placeholder =
			display.loading || display.innerHtml
				? ''
				: summary.returnPlaceholderImage?.() || DREAMSCAPE_PLACEHOLDER;
		const images = Array.isArray(summary.images)
			? summary.images.filter(Boolean)
			: [listingImage || placeholder];

		const normalizedImages = images.map((img) =>
			img?.startsWith?.('gradient-') ? DREAMSCAPE_PLACEHOLDER : img
		);

		const priceValue = summary.returnPrice?.() || summary.price || summary.reserve_price || '';
		const bidValue = summary.current_bid || summary.currentBid || '';
		const isBid = !!bidValue && !priceValue;
		const primaryValue = isBid ? bidValue : priceValue || 'N/A';
		const primaryLabel = isBid ? 'Current Bid' : 'Price';
		const currency = summary.currency || summary.denomination || 'SAITO';
		const nextBid = summary.next_bid || summary.nextMinBid || '';
		const supply = summary.returnQuantity?.() || 1;
		const actionText = isBid ? 'Bid' : 'Buy';
		const description = summary.returnDescription?.() || '';
		const txid = String(summary.listing_signature || summary.nft_id || 'N/A');
		const primaryDisplay = this.hasCurrencyLabel(primaryValue)
			? String(primaryValue)
			: `${primaryValue} ${currency}`;
		const nextBidDisplay = this.hasCurrencyLabel(nextBid)
			? String(nextBid)
			: `${nextBid} ${currency}`;

		return {
			identicon: this.app?.keychain?.returnIdenticon?.(seller) || '',
			listingTitle,
			seller,
			shortSeller,
			images: normalizedImages,
			hasGallery: normalizedImages.length > 1,
			primaryLabel,
			primaryDisplay,
			nextBid,
			showNextBid: !!nextBid,
			nextBidDisplay,
			supply,
			showQuantity: supply > 1,
			actionText,
			description,
			hasDescription: !!description,
			productType: this.returnProductType(summary),
			fileType: this.returnFileTypeFromImages(normalizedImages),
			createdDate: this.returnCreatedDate(summary),
			txidShort: returnShortKey(txid),
			imageLoading: summary.isImageLoading?.() ?? false
		};
	}

	returnEditView(nft) {
		const seller = this.mod.publicKey || 'anon-store';
		const priceNum = Number(this.listing.price) || 1;

		return {
			listingTitle: this.escapeHtml(this.listing.title),
			shortSeller: returnShortKey(seller),
			mediaHtml: this.returnMediaHtml(nft),
			description: this.escapeHtml(this.listing.description),
			priceDisplay: `${priceNum} SAITO`,
			productType: this.escapeHtml(nft?.returnType?.() || 'NFT'),
			fileType: this.escapeHtml(this.returnFileTypeFromNft(nft)),
			createdDate: new Date().toLocaleDateString(),
			supply: this.listing.quantity_total
		};
	}

	resetListingFromNft(nft) {
		const max_quantity_total = Number(nft?.getTotalAmount?.() || nft?.amount || 1) || 1;
		this.max_quantity_total = max_quantity_total;
		this.listing = {
			title: nft?.title || 'Untitled NFT',
			description: nft?.description || '',
			price: '1',
			quantity_total: max_quantity_total,
			quantity_available: max_quantity_total
		};
	}

	applyProductMedia(summary = this.summary) {
		if (!(summary instanceof Summary)) {
			return;
		}

		const display = summary.returnMediaDisplay?.() || {};
		const media = document.querySelector('.listing-detail .media');
		const mainImage = document.querySelector('.listing-detail .image');
		if (!media) {
			return;
		}

		let content = media.querySelector('.media-content');
		if (display.loading) {
			return;
		}

		if (display.innerHtml) {
			if (mainImage) {
				mainImage.style.display = 'none';
			}
			if (!content) {
				content = document.createElement('div');
				content.className = 'media-content';
				media.appendChild(content);
			}
			content.innerHTML = display.innerHtml;
			return;
		}

		if (content) {
			content.remove();
		}
		if (mainImage) {
			mainImage.style.display = '';
			if (display.backgroundImage) {
				mainImage.setAttribute('src', display.backgroundImage);
			}
		}
	}

	/**
	 * View mode: render(summary)
	 * Edit mode: render({ mode: 'edit', nft, defaults })
	 */
	render(input = null) {
		if (input && !(input instanceof Summary) && input.mode === 'edit') {
			this.renderEdit(input.nft, input.defaults || {});
			return;
		}

		if (input instanceof Summary || input === null || input === undefined) {
			this.renderView(input);
			return;
		}

		if (input?.nft_id || input?.returnTitle) {
			this.renderView(input);
			return;
		}

		this.renderView(input);
	}

	renderView(summary = null) {
		this.mode = 'view';
		if (summary) {
			this.summary = summary;
		}
		const view = this.returnViewModel(this.summary || {});
		this.overlay.show(ListingDetailTemplate.viewTemplate(view));
		this.attachViewEvents();
		this.applyProductMedia();
		this.beginOverlayEnrichment();
	}

	renderEdit(nft, defaults = {}) {
		this.mode = 'edit';
		this.defaults = defaults;
		this.selectedNft = nft?.nft || nft;
		this.resetListingFromNft(this.selectedNft);

		const view = this.returnEditView(this.selectedNft);
		this.overlay.show(ListingDetailTemplate.editTemplate(view), () => {
			if (typeof this.defaults?.callback === 'function') {
				this.defaults.callback({ status: 'cancelled' });
			}
		});
		this.attachEditEvents();
		this.applyEditDefaults();
	}

	attachViewEvents() {
		const root = document.querySelector('.listing-detail');
		if (!root) {
			return;
		}

		const mainImage = root.querySelector('.image');
		root.querySelectorAll('.thumb').forEach((thumb) => {
			thumb.onclick = (e) => {
				e.preventDefault();
				const src = thumb.getAttribute('data-src');
				if (mainImage && src) {
					mainImage.setAttribute('src', src);
				}
				root.querySelectorAll('.thumb').forEach((n) => {
					n.classList.remove('active');
					n.setAttribute('aria-pressed', 'false');
				});
				thumb.classList.add('active');
				thumb.setAttribute('aria-pressed', 'true');
			};
		});

		if (mainImage) {
			mainImage.onerror = () => {
				const display = this.summary?.returnMediaDisplay?.() || {};
				if (display.innerHtml || display.loading) {
					return;
				}
				mainImage.onerror = null;
				this.beginOverlayEnrichment();
			};
		}

		const buyBtn = root.querySelector('[data-action="buy"]');
		if (buyBtn) {
			buyBtn.onclick = async (e) => {
				e.preventDefault();
				const summary = this.summary;
				if (!(summary instanceof Summary)) {
					return;
				}

				const qtyInput = root.querySelector('#listing-qty');
				const quantity = qtyInput ? Number(qtyInput.value) || 1 : 1;

				if (buyBtn.disabled) {
					return;
				}
				buyBtn.disabled = true;

				try {
					await this.mod.main?.purchase_flow?.startPurchase(summary, quantity);
				} finally {
					buyBtn.disabled = false;
				}
			};
		}
	}

	attachEditEvents() {
		const root = document.querySelector('.listing-detail.edit');
		if (!root) {
			return;
		}

		const backBtn = root.querySelector('[data-action="back"]');
		if (backBtn) {
			backBtn.onclick = (e) => {
				e.preventDefault();
				if (typeof this.onBack === 'function') {
					this.onBack(this.defaults);
				}
			};
		}

		const editTitle = root.querySelector('[data-edit="title"]');
		if (editTitle) {
			editTitle.onclick = (e) => {
				e.preventDefault();
				const next = prompt('Listing title', this.listing.title);
				if (next !== null && next.trim()) {
					this.listing.title = next.trim();
					root.querySelector('[data-field="title"]').textContent = this.listing.title;
				}
			};
		}

		const editDesc = root.querySelector('[data-edit="description"]');
		if (editDesc) {
			editDesc.onclick = (e) => {
				e.preventDefault();
				if (this.defaults?.locked?.includes('description')) {
					return;
				}
				const next = prompt('Listing description', this.listing.description);
				if (next !== null) {
					this.listing.description = next.trim();
					root.querySelector('[data-field="description"]').textContent =
						this.listing.description || 'No description provided';
				}
			};
		}

		const editPrice = root.querySelector('[data-edit="price"]');
		if (editPrice) {
			editPrice.onclick = (e) => {
				e.preventDefault();
				if (this.defaults?.locked?.includes('price')) {
					return;
				}
				const next = prompt('Price in SAITO', this.listing.price);
				if (next !== null && next.trim()) {
					const cleaned = next.trim().replace(/[^\d.]/g, '');
					if (cleaned) {
						this.listing.price = cleaned;
						root.querySelector('[data-field="price"]').textContent = `${cleaned} SAITO`;
					}
				}
			};
		}

		const editAvailable = root.querySelector('[data-edit="available"]');
		if (editAvailable) {
			editAvailable.onclick = (e) => {
				e.preventDefault();
				if (this.defaults?.locked?.includes('quantity')) {
					return;
				}
				const next = prompt(
					`Available quantity (max ${this.max_quantity_total})`,
					String(this.listing.quantity_total)
				);
				if (next !== null && next.trim()) {
					let qty = parseInt(next.trim(), 10);
					if (!Number.isFinite(qty) || qty < 1) {
						qty = 1;
					}
					if (qty > this.max_quantity_total) {
						qty = this.max_quantity_total;
					}
					this.listing.quantity_total = qty;
					this.listing.quantity_available = qty;
					root.querySelector('[data-field="available"]').textContent = String(qty);
				}
			};
		}

		const submitBtn = root.querySelector('[data-action="submit"]');
		if (submitBtn) {
			submitBtn.onclick = async (e) => {
				e.preventDefault();
				await this.submitListing();
			};
		}
	}

	applyEditDefaults() {
		const root = document.querySelector('.listing-detail.edit');
		if (!root) {
			return;
		}

		if (this.defaults?.price) {
			this.listing.price = String(this.defaults.price);
			const priceEl = root.querySelector('[data-field="price"]');
			if (priceEl) {
				priceEl.textContent = `${this.listing.price} SAITO`;
			}
			if (this.defaults.locked?.includes('price')) {
				const affordance = root.querySelector('[data-edit="price"]');
				if (affordance) {
					affordance.hidden = true;
				}
			}
		}

		if (this.defaults?.quantity) {
			let qty = parseInt(this.defaults.quantity, 10);
			if (!Number.isFinite(qty) || qty < 1) {
				qty = 1;
			}
			if (qty > this.max_quantity_total) {
				qty = this.max_quantity_total;
			}
			this.listing.quantity_total = qty;
			this.listing.quantity_available = qty;
			const qtyEl = root.querySelector('[data-field="available"]');
			if (qtyEl) {
				qtyEl.textContent = String(qty);
			}
			if (this.defaults.locked?.includes('quantity')) {
				const affordance = root.querySelector('[data-edit="available"]');
				if (affordance) {
					affordance.hidden = true;
				}
			}
		}

		if (this.defaults?.description) {
			this.listing.description = String(this.defaults.description);
			const descEl = root.querySelector('[data-field="description"]');
			if (descEl) {
				descEl.textContent = this.listing.description || 'No description provided';
			}
			if (this.defaults.locked?.includes('description')) {
				const affordance = root.querySelector('[data-edit="description"]');
				if (affordance) {
					affordance.hidden = true;
				}
			}
		}
	}

	async submitListing() {
		try {
			const tx = await this.mod.createListAssetTransaction(this.selectedNft, this.listing);
			await this.app.network.propagateTransaction(tx);
			if (typeof this.defaults?.callback === 'function') {
				this.defaults.callback({
					status: 'listed',
					tx: tx
				});
				this.defaults.callback = null;
			}
			this.overlay.close();
		} catch (err) {
			console.error('Store: listing failed', err);
			alert(err?.message || 'Listing failed');
		}
	}

	beginOverlayEnrichment() {
		const summary = this.summary;
		if (!(summary instanceof Summary)) {
			return;
		}

		const refreshIfNeeded = () => {
			this.renderView(summary);
			if (summary.isImageLoading?.()) {
				summary.enrichMedia(() => this.renderView(summary));
			}
		};

		if (summary.listing_tx) {
			if (summary.isImageLoading?.()) {
				summary.enrichMedia(() => this.renderView(summary));
			}
			return;
		}

		summary.ensureListingTransaction(refreshIfNeeded);
	}
}

module.exports = ListingDetailOverlay;
